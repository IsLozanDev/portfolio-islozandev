-- Prueba de 01p_fe (spec 49). La ejecuta tools/migrar/test/db-esquemas.test.mjs sobre una base temporal
-- con db/ aplicado. Siembra como superusuario y evalúa con fe_test_app, sin BYPASSRLS y con los mismos
-- privilegios que la aplicación. Todo en una transacción que se revierte.

BEGIN;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fe_test_app') THEN
    CREATE ROLE fe_test_app NOLOGIN;
  END IF;
END $$;
GRANT USAGE ON SCHEMA fe TO fe_test_app;
GRANT SELECT, INSERT, UPDATE ON fe.emisor TO fe_test_app;
GRANT SELECT, INSERT ON fe.aviso_certificado TO fe_test_app;
GRANT EXECUTE ON FUNCTION fe.certificados_con_aviso_pendiente(timestamptz, uuid, integer) TO fe_test_app;

CREATE SCHEMA fe_test;
CREATE FUNCTION fe_test.debe_fallar(sentencia text, esperado text, caso text) RETURNS void
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
GRANT USAGE ON SCHEMA fe_test TO fe_test_app;

-- ---------------------------------------------------------------------
-- Semilla del catálogo GLOBAL PROVEEDOR_FE con el simulador.
-- ---------------------------------------------------------------------
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM cat.catalogo c JOIN cat.catalogo_item i ON i.catalogo_id = c.id
     WHERE c.codigo = 'PROVEEDOR_FE' AND c.alcance = 'GLOBAL' AND c.fuente = 'Plataforma' AND NOT c.editable_por_tenant
       AND c.version = 1 AND i.codigo = 'SIMULADO' AND i.tenant_id IS NULL AND i.activo
       AND i.atributos = '{"requiere_certificado": true, "soporta_resumen": true, "url_beta": null}'::jsonb
  ) THEN
    RAISE EXCEPTION 'PROVEEDOR_FE debía nacer GLOBAL con el ítem SIMULADO y sus atributos';
  END IF;
  IF (SELECT count(*) FROM cat.catalogo_item i JOIN cat.catalogo c ON c.id = i.catalogo_id WHERE c.codigo = 'PROVEEDOR_FE') <> 1 THEN
    RAISE EXCEPTION 'PROVEEDOR_FE debía tener solo el simulador';
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- Dos tenants, cada uno con una empresa; el A con una segunda empresa.
-- ---------------------------------------------------------------------
INSERT INTO org.tenant (id, codigo, nombre, estado, version) VALUES
  ('49000000-0000-0000-0000-00000000000a', 'fe-tenant-a', 'FE tenant A', 'ACTIVO', 1),
  ('49000000-0000-0000-0000-00000000000b', 'fe-tenant-b', 'FE tenant B', 'ACTIVO', 1);
INSERT INTO org.empresa (id, tenant_id, ruc, razon_social, version) VALUES
  ('49000000-0000-0000-0000-0000000000a1', '49000000-0000-0000-0000-00000000000a', '20601234561', 'FE A SAC', 1),
  ('49000000-0000-0000-0000-0000000000a2', '49000000-0000-0000-0000-00000000000a', '20601234562', 'FE A2 SAC', 1),
  ('49000000-0000-0000-0000-0000000000b1', '49000000-0000-0000-0000-00000000000b', '20512345678', 'FE B SAC', 1);

SET ROLE fe_test_app;

-- ---------------------------------------------------------------------
-- Tenant A: su emisor nace BORRADOR en BETA con régimen GENERAL.
-- ---------------------------------------------------------------------
SELECT set_config('app.tenant_id', '49000000-0000-0000-0000-00000000000a', false);

INSERT INTO fe.emisor (id, tenant_id, empresa_id, proveedor, creado_por)
VALUES ('49000000-0000-0000-0000-0000000e0a01', '49000000-0000-0000-0000-00000000000a', '49000000-0000-0000-0000-0000000000a1',
        'SIMULADO', '49000000-0000-0000-0000-0000000000f1');

DO $$ BEGIN
  IF (SELECT estado || '|' || ambiente || '|' || regimen_igv || '|' || version FROM fe.emisor) <> 'BORRADOR|BETA|GENERAL|1' THEN
    RAISE EXCEPTION 'el emisor debía nacer BORRADOR, BETA, GENERAL y en versión 1';
  END IF;
END $$;

-- CHECK de estado, ambiente y régimen; el estado ya admite VERIFICADO y PRODUCCION (spec 50).
SELECT fe_test.debe_fallar($$ UPDATE fe.emisor SET estado = 'ACTIVO' $$, '23514', 'estado desconocido');
SELECT fe_test.debe_fallar($$ UPDATE fe.emisor SET ambiente = 'PRUEBA' $$, '23514', 'ambiente desconocido');
SELECT fe_test.debe_fallar($$ UPDATE fe.emisor SET regimen_igv = 'MYPE' $$, '23514', 'régimen desconocido');
SELECT fe_test.debe_fallar($$ UPDATE fe.emisor SET version = 0 $$, '23514', 'versión cero');
UPDATE fe.emisor SET estado = 'VERIFICADO';
UPDATE fe.emisor SET estado = 'PRODUCCION', ambiente = 'PRODUCCION', regimen_igv = 'REDUCIDO_RESTAURANTES';
UPDATE fe.emisor SET estado = 'CONFIGURADO', ambiente = 'BETA', regimen_igv = 'GENERAL';

-- El certificado llega completo: secreto, clave, RUC, vencimiento y huella juntos.
SELECT fe_test.debe_fallar($$
  UPDATE fe.emisor SET certificado_huella_sha256 = repeat('a', 64) $$, '23514', 'huella sin secreto del certificado');
SELECT fe_test.debe_fallar($$
  UPDATE fe.emisor SET secreto_certificado_id = gen_random_uuid() $$, '23514', 'secreto del certificado sin huella');
SELECT fe_test.debe_fallar($$
  UPDATE fe.emisor SET secreto_certificado_id = gen_random_uuid(), certificado_huella_sha256 = repeat('a', 64) $$,
  '23514', 'certificado sin clave, RUC ni vencimiento');
SELECT fe_test.debe_fallar($$
  UPDATE fe.emisor SET secreto_certificado_id = gen_random_uuid(), secreto_clave_certificado_id = gen_random_uuid(),
         certificado_huella_sha256 = repeat('A', 64), certificado_ruc = '20601234561', certificado_vence_en = now() $$,
  '23514', 'huella en mayúsculas');
SELECT fe_test.debe_fallar($$
  UPDATE fe.emisor SET secreto_certificado_id = gen_random_uuid(), secreto_clave_certificado_id = gen_random_uuid(),
         certificado_huella_sha256 = repeat('a', 64), certificado_ruc = '30601234561', certificado_vence_en = now() $$,
  '23514', 'RUC del certificado con prefijo inválido');
UPDATE fe.emisor
   SET secreto_credencial_id = '49000000-0000-0000-0000-00000000c0a1',
       secreto_certificado_id = '49000000-0000-0000-0000-00000000c0a2',
       secreto_clave_certificado_id = '49000000-0000-0000-0000-00000000c0a3',
       certificado_ruc = '20601234561', certificado_vence_en = '2026-11-05T05:00:00Z', certificado_huella_sha256 = repeat('a', 64);

-- Un emisor por empresa.
SELECT fe_test.debe_fallar($$
  INSERT INTO fe.emisor (id, tenant_id, empresa_id, proveedor, creado_por)
  VALUES (gen_random_uuid(), '49000000-0000-0000-0000-00000000000a', '49000000-0000-0000-0000-0000000000a1', 'SIMULADO', gen_random_uuid()) $$,
  '23505', 'segundo emisor de la misma empresa');

-- La FK no cruza tenants: la empresa de B no existe para el par (tenant A, empresa).
SELECT fe_test.debe_fallar($$
  INSERT INTO fe.emisor (id, tenant_id, empresa_id, proveedor, creado_por)
  VALUES (gen_random_uuid(), '49000000-0000-0000-0000-00000000000a', '49000000-0000-0000-0000-0000000000b1', 'SIMULADO', gen_random_uuid()) $$,
  '23503', 'emisor del tenant A sobre la empresa del tenant B');

-- La segunda empresa de A, con un certificado que vence en 60 días.
INSERT INTO fe.emisor (id, tenant_id, empresa_id, proveedor, creado_por, secreto_certificado_id, secreto_clave_certificado_id,
                       certificado_ruc, certificado_vence_en, certificado_huella_sha256)
VALUES ('49000000-0000-0000-0000-0000000e0a02', '49000000-0000-0000-0000-00000000000a', '49000000-0000-0000-0000-0000000000a2',
        'SIMULADO', gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), '20601234562', '2026-12-05T05:00:00Z', repeat('c', 64));

-- El aviso: uno por certificado; dias_antes de 1 a 90; sin UPDATE ni DELETE.
INSERT INTO fe.aviso_certificado (id, tenant_id, emisor_id, huella_sha256, dias_antes, vence_en, fecha_ejecucion)
VALUES ('49000000-0000-0000-0000-0000000a0a01', '49000000-0000-0000-0000-00000000000a', '49000000-0000-0000-0000-0000000e0a01',
        repeat('a', 64), 30, '2026-11-05T05:00:00Z', '2026-10-06');
SELECT fe_test.debe_fallar($$
  INSERT INTO fe.aviso_certificado (id, tenant_id, emisor_id, huella_sha256, dias_antes, vence_en, fecha_ejecucion)
  VALUES (gen_random_uuid(), '49000000-0000-0000-0000-00000000000a', '49000000-0000-0000-0000-0000000e0a01',
          repeat('a', 64), 30, now(), current_date) $$, '23505', 'segundo aviso del mismo certificado');
SELECT fe_test.debe_fallar($$
  INSERT INTO fe.aviso_certificado (id, tenant_id, emisor_id, huella_sha256, dias_antes, vence_en, fecha_ejecucion)
  VALUES (gen_random_uuid(), '49000000-0000-0000-0000-00000000000a', '49000000-0000-0000-0000-0000000e0a02',
          repeat('c', 64), 91, now(), current_date) $$, '23514', 'aviso con 91 días');
SELECT fe_test.debe_fallar($$
  UPDATE fe.aviso_certificado SET dias_antes = 10 $$, '42501', 'UPDATE del aviso');
SELECT fe_test.debe_fallar($$ DELETE FROM fe.aviso_certificado $$, '42501', 'DELETE del aviso');
SELECT fe_test.debe_fallar($$ DELETE FROM fe.emisor $$, '42501', 'DELETE del emisor');

-- ---------------------------------------------------------------------
-- Tenant B: no ve lo de A ni escribe en su nombre; su emisor vence en 20 días y no tiene aviso.
-- ---------------------------------------------------------------------
SELECT set_config('app.tenant_id', '49000000-0000-0000-0000-00000000000b', false);

DO $$ BEGIN
  IF (SELECT count(*) FROM fe.emisor) <> 0 OR (SELECT count(*) FROM fe.aviso_certificado) <> 0 THEN
    RAISE EXCEPTION 'el tenant B no debía ver emisores ni avisos del tenant A';
  END IF;
END $$;
SELECT fe_test.debe_fallar($$
  INSERT INTO fe.emisor (id, tenant_id, empresa_id, proveedor, creado_por)
  VALUES (gen_random_uuid(), '49000000-0000-0000-0000-00000000000a', '49000000-0000-0000-0000-0000000000a2', 'SIMULADO', gen_random_uuid()) $$,
  '42501', 'emisor a nombre del tenant A desde el tenant B');
DO $$
DECLARE
  filas integer;
BEGIN
  UPDATE fe.emisor SET leyenda_pie = 'otra' WHERE id = '49000000-0000-0000-0000-0000000e0a01';
  GET DIAGNOSTICS filas = ROW_COUNT;
  IF filas <> 0 THEN
    RAISE EXCEPTION 'el tenant B no debía modificar el emisor del tenant A';
  END IF;
END $$;
SELECT fe_test.debe_fallar($$
  INSERT INTO fe.aviso_certificado (id, tenant_id, emisor_id, huella_sha256, dias_antes, vence_en, fecha_ejecucion)
  VALUES (gen_random_uuid(), '49000000-0000-0000-0000-00000000000a', '49000000-0000-0000-0000-0000000e0a02',
          repeat('c', 64), 30, now(), current_date) $$, '42501', 'aviso a nombre del tenant A desde el tenant B');

INSERT INTO fe.emisor (id, tenant_id, empresa_id, proveedor, creado_por, secreto_certificado_id, secreto_clave_certificado_id,
                       certificado_ruc, certificado_vence_en, certificado_huella_sha256)
VALUES ('49000000-0000-0000-0000-0000000e0b01', '49000000-0000-0000-0000-00000000000b', '49000000-0000-0000-0000-0000000000b1',
        'SIMULADO', gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), '20512345678', '2026-11-25T05:00:00Z', repeat('b', 64));

-- ---------------------------------------------------------------------
-- La función cruza tenants, omite los ya avisados por su huella, respeta p_hasta, el cursor y el límite.
-- ---------------------------------------------------------------------
SELECT set_config('app.tenant_id', '', false);
DO $$
DECLARE
  inicio CONSTANT uuid := '00000000-0000-0000-0000-000000000000';
  encontrados text;
BEGIN
  SELECT string_agg(emisor_id::text, ',' ORDER BY emisor_id) INTO encontrados
    FROM fe.certificados_con_aviso_pendiente('2027-02-01T00:00:00Z', inicio, 10);
  IF encontrados IS DISTINCT FROM '49000000-0000-0000-0000-0000000e0a02,49000000-0000-0000-0000-0000000e0b01' THEN
    RAISE EXCEPTION 'pendientes de los dos tenants sin el ya avisado: llegó %', encontrados;
  END IF;

  SELECT string_agg(emisor_id::text, ',') INTO encontrados
    FROM fe.certificados_con_aviso_pendiente('2026-12-01T00:00:00Z', inicio, 10);
  IF encontrados IS DISTINCT FROM '49000000-0000-0000-0000-0000000e0b01' THEN
    RAISE EXCEPTION 'p_hasta debía dejar fuera el que vence en diciembre: llegó %', encontrados;
  END IF;

  SELECT string_agg(emisor_id::text, ',') INTO encontrados
    FROM fe.certificados_con_aviso_pendiente('2027-02-01T00:00:00Z', inicio, 1);
  IF encontrados IS DISTINCT FROM '49000000-0000-0000-0000-0000000e0a02' THEN
    RAISE EXCEPTION 'el límite debía devolver solo el primero por id: llegó %', encontrados;
  END IF;

  SELECT string_agg(emisor_id::text, ',') INTO encontrados
    FROM fe.certificados_con_aviso_pendiente('2027-02-01T00:00:00Z', '49000000-0000-0000-0000-0000000e0a02', 10);
  IF encontrados IS DISTINCT FROM '49000000-0000-0000-0000-0000000e0b01' THEN
    RAISE EXCEPTION 'el cursor debía saltar los ids ya vistos: llegó %', encontrados;
  END IF;
END $$;

-- Un certificado nuevo (otra huella) del emisor ya avisado vuelve a quedar pendiente.
SELECT set_config('app.tenant_id', '49000000-0000-0000-0000-00000000000a', false);
UPDATE fe.emisor SET certificado_huella_sha256 = repeat('d', 64), certificado_vence_en = '2027-01-10T05:00:00Z'
 WHERE id = '49000000-0000-0000-0000-0000000e0a01';
SELECT set_config('app.tenant_id', '', false);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM fe.certificados_con_aviso_pendiente('2027-02-01T00:00:00Z', '00000000-0000-0000-0000-000000000000', 10)
                  WHERE emisor_id = '49000000-0000-0000-0000-0000000e0a01') THEN
    RAISE EXCEPTION 'el certificado nuevo del emisor avisado debía quedar pendiente';
  END IF;
END $$;

RESET ROLE;

-- ---------------------------------------------------------------------
-- Dueño org_lector, SECURITY DEFINER con search_path fijo, y nada para PUBLIC ni para la Data API.
-- ---------------------------------------------------------------------
DO $$
DECLARE
  rol text;
  tabla text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_roles r ON r.oid = p.proowner
     WHERE p.oid = 'fe.certificados_con_aviso_pendiente(timestamptz, uuid, integer)'::regprocedure
       AND r.rolname = 'org_lector' AND p.prosecdef AND p.proconfig @> ARRAY['search_path=""']
  ) THEN
    RAISE EXCEPTION 'la función debía ser SECURITY DEFINER de org_lector con search_path vacío';
  END IF;
  IF has_schema_privilege('public', 'fe', 'USAGE') THEN
    RAISE EXCEPTION 'PUBLIC no debía tener USAGE en fe';
  END IF;
  FOREACH rol IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    CONTINUE WHEN NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = rol);
    IF has_schema_privilege(rol, 'fe', 'USAGE') THEN
      RAISE EXCEPTION '% no debía tener USAGE en fe', rol;
    END IF;
    IF has_function_privilege(rol, 'fe.certificados_con_aviso_pendiente(timestamptz, uuid, integer)', 'EXECUTE') THEN
      RAISE EXCEPTION '% no debía ejecutar fe.certificados_con_aviso_pendiente', rol;
    END IF;
    FOREACH tabla IN ARRAY ARRAY['fe.emisor', 'fe.aviso_certificado'] LOOP
      IF has_table_privilege(rol, tabla, 'SELECT') OR has_table_privilege(rol, tabla, 'INSERT')
         OR has_table_privilege(rol, tabla, 'UPDATE') OR has_table_privilege(rol, tabla, 'DELETE') THEN
        RAISE EXCEPTION '% no debía tener acceso a %', rol, tabla;
      END IF;
    END LOOP;
  END LOOP;
END $$;

ROLLBACK;
