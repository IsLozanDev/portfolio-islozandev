-- Prueba de 01j_idn (spec 28). La ejecuta tools/migrar/test/db-esquemas.test.mjs sobre una base temporal
-- con db/ aplicado. Corre como superusuario y evalúa con idn_test_app, sin BYPASSRLS y con los mismos
-- privilegios que la aplicación. Todo en una transacción que se revierte.

BEGIN;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'idn_test_app') THEN
    CREATE ROLE idn_test_app NOLOGIN;
  END IF;
END $$;
GRANT USAGE ON SCHEMA idn TO idn_test_app;
GRANT SELECT ON idn.proveedor TO idn_test_app;
GRANT SELECT, INSERT, UPDATE ON idn.cache_documento TO idn_test_app;
GRANT SELECT, INSERT ON idn.consulta_log TO idn_test_app;

CREATE SCHEMA idn_test;
CREATE FUNCTION idn_test.debe_fallar(sentencia text, esperado text, caso text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE sentencia;
  RAISE EXCEPTION 'no falló';
EXCEPTION WHEN OTHERS THEN
  IF SQLSTATE <> esperado THEN
    RAISE EXCEPTION '%: se esperaba % y llegó % (%)', caso, esperado, SQLSTATE, SQLERRM;
  END IF;
END
$$;
GRANT USAGE ON SCHEMA idn_test TO idn_test_app;

CREATE FUNCTION idn_test.registrar(p_tenant uuid, p_resultado varchar) RETURNS void
LANGUAGE sql AS $$
  INSERT INTO idn.consulta_log (tenant_id, tipo_doc, numero_hash, motivo, resultado, proveedor)
  VALUES (p_tenant, 'DNI', 'sha256:' || repeat('a', 64), 'REGISTRO_CLIENTE', p_resultado, 'DECOLECTA');
$$;

-- ---------------------------------------------------------------------
-- Proveedor sembrado y de solo lectura para la aplicación.
-- ---------------------------------------------------------------------
SET ROLE idn_test_app;

DO $$
DECLARE
  proveedor idn.proveedor;
BEGIN
  SELECT * INTO proveedor FROM idn.proveedor WHERE codigo = 'DECOLECTA';
  IF proveedor IS NULL OR proveedor.prioridad <> 1 OR proveedor.ttl_dias <> 30 OR proveedor.timeout_ms <> 3000
     OR proveedor.tipos_doc <> ARRAY['DNI', 'RUC']::varchar[] OR NOT proveedor.activo THEN
    RAISE EXCEPTION 'semilla de DECOLECTA incorrecta: %', proveedor;
  END IF;
END $$;

SELECT idn_test.debe_fallar($$UPDATE idn.proveedor SET activo = false$$, '42501', 'UPDATE de proveedor');

-- ---------------------------------------------------------------------
-- Caché: global, solo campos mínimos (TR-CA-117).
-- ---------------------------------------------------------------------
INSERT INTO idn.cache_documento (tipo_doc, numero, datos, fuente, consultado_en, expira_en)
VALUES ('DNI', '45781236', '{"nombres": "Juana", "apellidos": "Quispe Mamani"}', 'DECOLECTA', now(), now() + interval '30 days'),
       ('RUC', '20512345671', '{"razon_social": "Comercial Andina SAC", "estado": "ACTIVO", "condicion": "HABIDO",
         "direccion_fiscal": "Av. Larco 123", "ubigeo": "150122"}', 'DECOLECTA', now(), now() + interval '30 days');

SELECT idn_test.debe_fallar($$
  INSERT INTO idn.cache_documento (tipo_doc, numero, datos, fuente, consultado_en, expira_en)
  VALUES ('DNI', '45781237', '{"nombres": "Juana", "apellidos": "Quispe", "direccion": "Jr. Lima 1"}', 'DECOLECTA', now(), now())$$,
  '23514', 'DNI con dirección');
SELECT idn_test.debe_fallar($$
  INSERT INTO idn.cache_documento (tipo_doc, numero, datos, fuente, consultado_en, expira_en)
  VALUES ('RUC', '20100070970', '{"razon_social": "X", "representante": "Y"}', 'DECOLECTA', now(), now())$$,
  '23514', 'RUC con representante');
SELECT idn_test.debe_fallar($$
  UPDATE idn.cache_documento SET datos = datos || '{"fecha_nacimiento": "1990-01-01"}' WHERE numero = '45781236'$$,
  '23514', 'UPDATE que agrega un campo a un DNI');
SELECT idn_test.debe_fallar($$
  INSERT INTO idn.cache_documento (tipo_doc, numero, datos, fuente, consultado_en, expira_en)
  VALUES ('CE', '001234567', '{}', 'DECOLECTA', now(), now())$$,
  '23514', 'tipo CE en caché');
SELECT idn_test.debe_fallar($$DELETE FROM idn.cache_documento$$, '42501', 'DELETE de caché');

-- Upsert por (tipo_doc, numero).
INSERT INTO idn.cache_documento (tipo_doc, numero, datos, fuente, consultado_en, expira_en)
VALUES ('DNI', '45781236', '{"nombres": "Juana", "apellidos": "Quispe Mamani"}', 'DECOLECTA', now(), now() + interval '31 days')
ON CONFLICT (tipo_doc, numero) DO UPDATE SET expira_en = EXCLUDED.expira_en;

-- La caché es global: otro tenant la ve igual.
SELECT set_config('app.tenant_id', 'bbbbbbbb-0000-0000-0000-000000000002', false);
DO $$ BEGIN
  IF (SELECT count(*) FROM idn.cache_documento) <> 2 THEN RAISE EXCEPTION 'la caché debía verse desde cualquier tenant'; END IF;
END $$;

-- ---------------------------------------------------------------------
-- Bitácora: aislada por tenant y de solo inserción.
-- ---------------------------------------------------------------------
SELECT set_config('app.tenant_id', 'aaaaaaaa-0000-0000-0000-000000000001', false);
SELECT idn_test.registrar('aaaaaaaa-0000-0000-0000-000000000001', 'PROVEEDOR');
SELECT idn_test.registrar('aaaaaaaa-0000-0000-0000-000000000001', 'CACHE');

SELECT set_config('app.tenant_id', 'bbbbbbbb-0000-0000-0000-000000000002', false);
SELECT idn_test.registrar('bbbbbbbb-0000-0000-0000-000000000002', 'CACHE');

DO $$ BEGIN
  IF (SELECT count(*) FROM idn.consulta_log) <> 1 THEN RAISE EXCEPTION 'B debía ver solo su fila'; END IF;
END $$;
SELECT idn_test.debe_fallar($$SELECT idn_test.registrar('aaaaaaaa-0000-0000-0000-000000000001', 'CACHE')$$, '42501',
                            'B no inserta con el tenant de A');

SELECT set_config('app.tenant_id', 'aaaaaaaa-0000-0000-0000-000000000001', false);
DO $$ BEGIN
  IF (SELECT count(*) FROM idn.consulta_log) <> 2 THEN RAISE EXCEPTION 'A debía ver sus dos filas'; END IF;
END $$;

SELECT set_config('app.tenant_id', '', false);
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM idn.consulta_log) THEN RAISE EXCEPTION 'sin tenant no debía ver filas'; END IF;
END $$;
SELECT idn_test.debe_fallar($$SELECT idn_test.registrar('aaaaaaaa-0000-0000-0000-000000000001', 'CACHE')$$, '42501',
                            'sin tenant no inserta');

SELECT set_config('app.tenant_id', 'aaaaaaaa-0000-0000-0000-000000000001', false);
SELECT idn_test.debe_fallar($$UPDATE idn.consulta_log SET resultado = 'CACHE'$$, '42501', 'UPDATE de bitácora');
SELECT idn_test.debe_fallar($$DELETE FROM idn.consulta_log$$, '42501', 'DELETE de bitácora');

-- El número va hasheado: un valor en claro viola el CHECK.
SELECT idn_test.debe_fallar($$
  INSERT INTO idn.consulta_log (tenant_id, tipo_doc, numero_hash, motivo, resultado)
  VALUES ('aaaaaaaa-0000-0000-0000-000000000001', 'DNI', '45781236', 'OTRO', 'CACHE')$$, '23514', 'número en claro');
SELECT idn_test.debe_fallar($$
  INSERT INTO idn.consulta_log (tenant_id, tipo_doc, numero_hash, motivo, resultado)
  VALUES ('aaaaaaaa-0000-0000-0000-000000000001', 'DNI', 'sha256:' || repeat('a', 64), 'MARKETING', 'CACHE')$$,
  '23514', 'motivo fuera de la lista');

RESET ROLE;

-- El dueño de las tablas no tiene UPDATE ni DELETE sobre la bitácora ni escritura sobre el proveedor.
DO $$
DECLARE
  dueno name := (SELECT tableowner FROM pg_tables WHERE schemaname = 'idn' AND tablename = 'consulta_log');
BEGIN
  -- Un superusuario tiene todos los privilegios por definición: ahí solo cuentan la RLS y el rol de la app.
  IF (SELECT rolsuper FROM pg_roles WHERE rolname = dueno) THEN
    RETURN;
  END IF;
  IF has_table_privilege(dueno, 'idn.consulta_log', 'UPDATE')
     OR has_table_privilege(dueno, 'idn.consulta_log', 'DELETE')
     OR has_table_privilege(dueno, 'idn.proveedor', 'INSERT')
     OR has_table_privilege(dueno, 'idn.proveedor', 'UPDATE') THEN
    RAISE EXCEPTION 'el dueño % conserva privilegios de cambio en idn', dueno;
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- anon y authenticated sin acceso al esquema (regla 8).
-- ---------------------------------------------------------------------
DO $$
DECLARE
  rol text;
  tabla text;
BEGIN
  FOREACH rol IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    CONTINUE WHEN NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = rol);
    IF has_schema_privilege(rol, 'idn', 'USAGE') THEN
      RAISE EXCEPTION '% no debía tener USAGE sobre idn', rol;
    END IF;
    FOREACH tabla IN ARRAY ARRAY['idn.proveedor', 'idn.cache_documento', 'idn.consulta_log'] LOOP
      IF has_table_privilege(rol, tabla, 'SELECT') OR has_table_privilege(rol, tabla, 'INSERT') THEN
        RAISE EXCEPTION '% no debía tener acceso a %', rol, tabla;
      END IF;
    END LOOP;
  END LOOP;
END $$;

ROLLBACK;
