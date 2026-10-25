-- Prueba de 01d_seq. La ejecuta tools/migrar/test/db-esquemas.test.mjs después de
-- 01c_cfg.test.sql, sobre la misma base. Siembra como superusuario y evalúa con
-- seq_test_app (sin BYPASSRLS).

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'seq_test_app') THEN
    CREATE ROLE seq_test_app NOLOGIN;
  END IF;
END $$;
GRANT USAGE ON SCHEMA seq, org TO seq_test_app;
GRANT SELECT, INSERT, UPDATE ON seq.serie TO seq_test_app;
GRANT SELECT ON ALL TABLES IN SCHEMA org TO seq_test_app;
GRANT EXECUTE ON FUNCTION seq.siguiente(uuid, uuid, varchar, varchar, timestamptz),
  seq.periodo_de(varchar, varchar, timestamptz), seq.zona_de(uuid) TO seq_test_app;

CREATE SCHEMA seq_test;
CREATE FUNCTION seq_test.debe_fallar(sentencia text, esperado text, caso text) RETURNS void
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
-- Siguiente número de una serie de la empresa D1 como 'serie|numero', o NULL si no hay fila.
CREATE FUNCTION seq_test.sig(p_tipo text, p_serie text, p_instante timestamptz) RETURNS text LANGUAGE sql AS $$
  SELECT s.serie || '|' || s.numero
    FROM seq.siguiente('d3000000-0000-0000-0000-000000000001', 'd3000000-0000-0000-0000-000000000011',
                       p_tipo, p_serie, p_instante) s;
$$;
CREATE FUNCTION seq_test.espera(obtenido text, esperado text, caso text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF obtenido IS DISTINCT FROM esperado THEN
    RAISE EXCEPTION '%: se esperaba % y llegó %', caso, esperado, obtenido;
  END IF;
END
$$;
CREATE FUNCTION seq_test.periodo(p_serie text) RETURNS text LANGUAGE sql AS $$
  SELECT s.periodo FROM seq.serie s
   WHERE s.tenant_id = 'd3000000-0000-0000-0000-000000000001' AND s.serie = p_serie;
$$;
GRANT USAGE ON SCHEMA seq_test TO seq_test_app;

-- ---------------------------------------------------------------------
-- Siembra (superusuario). Tenant D: empresa D1 con «Central» (0000) y «Cayma» (0002), y la
-- ventanilla «Ventanilla 1» en Cayma. Tenant H: una empresa con una sucursal y una serie.
-- ---------------------------------------------------------------------
INSERT INTO org.tenant (id, codigo, nombre, estado, version) VALUES
  ('d3000000-0000-0000-0000-000000000001', 'seq-tenant-d', 'Seq tenant D', 'ACTIVO', 1),
  ('d4000000-0000-0000-0000-000000000002', 'seq-tenant-h', 'Seq tenant H', 'ACTIVO', 1);
INSERT INTO org.empresa (id, tenant_id, ruc, razon_social, version) VALUES
  ('d3000000-0000-0000-0000-000000000011', 'd3000000-0000-0000-0000-000000000001', '20400000001', 'Seq Arequipa SAC', 1),
  ('d4000000-0000-0000-0000-000000000011', 'd4000000-0000-0000-0000-000000000002', '20400000002', 'Seq H SAC', 1);
INSERT INTO org.sucursal (id, tenant_id, empresa_id, codigo, nombre, codigo_establecimiento_sunat, es_principal, version) VALUES
  ('d3000000-0000-0000-0000-000000000101', 'd3000000-0000-0000-0000-000000000001', 'd3000000-0000-0000-0000-000000000011',
   'CENT', 'Central', '0000', true, 1),
  ('d3000000-0000-0000-0000-000000000102', 'd3000000-0000-0000-0000-000000000001', 'd3000000-0000-0000-0000-000000000011',
   'CAYM', 'Cayma', '0002', false, 1),
  ('d4000000-0000-0000-0000-000000000101', 'd4000000-0000-0000-0000-000000000002', 'd4000000-0000-0000-0000-000000000011',
   'HSUC', 'Sucursal H', '0000', true, 1);
INSERT INTO org.unidad_operativa (id, tenant_id, empresa_id, sucursal_id, tipo, codigo, nombre, version) VALUES
  ('d3000000-0000-0000-0000-000000000201', 'd3000000-0000-0000-0000-000000000001', 'd3000000-0000-0000-0000-000000000011',
   'd3000000-0000-0000-0000-000000000102', 'VENTANILLA', 'VEN-01', 'Ventanilla 1', 1);
INSERT INTO seg.usuario (id, email, nombre, tipo, estado) VALUES
  ('d3000000-0000-0000-0000-000000000901', 'ana.seq@gmail.com', 'Ana', 'INTERNO', 'ACTIVO');

INSERT INTO seq.serie (id, tenant_id, empresa_id, sucursal_id, tipo, serie, digitos, reinicio, ultimo_numero,
                       creado_por, modificado_por) VALUES
  ('d4000000-0000-0000-0000-00000000a001', 'd4000000-0000-0000-0000-000000000002', 'd4000000-0000-0000-0000-000000000011',
   'd4000000-0000-0000-0000-000000000101', 'BOLETA', 'B001', 8, 'NUNCA', 10,
   'd3000000-0000-0000-0000-000000000901', 'd3000000-0000-0000-0000-000000000901');

SET ROLE seq_test_app;
SELECT set_config('app.tenant_id', 'd3000000-0000-0000-0000-000000000001', false);

-- ---------------------------------------------------------------------
-- Numeración consecutiva (TR-CA-090, 093) y transacción revertida (TR-CA-095).
-- ---------------------------------------------------------------------
INSERT INTO seq.serie (id, tenant_id, empresa_id, sucursal_id, tipo, serie, digitos, reinicio, ultimo_numero,
                       creado_por, modificado_por) VALUES
  ('d3000000-0000-0000-0000-00000000a001', 'd3000000-0000-0000-0000-000000000001', 'd3000000-0000-0000-0000-000000000011',
   'd3000000-0000-0000-0000-000000000102', 'BOLETA', 'B002', 8, 'NUNCA', 124,
   'd3000000-0000-0000-0000-000000000901', 'd3000000-0000-0000-0000-000000000901'),
  ('d3000000-0000-0000-0000-00000000a002', 'd3000000-0000-0000-0000-000000000001', 'd3000000-0000-0000-0000-000000000011',
   'd3000000-0000-0000-0000-000000000102', 'FACTURA', 'F001', 8, 'NUNCA', 80,
   'd3000000-0000-0000-0000-000000000901', 'd3000000-0000-0000-0000-000000000901');
SELECT seq_test.espera(seq_test.periodo('B002'), NULL, 'NUNCA sin periodo');
SELECT seq_test.espera(seq_test.sig('BOLETA', 'B002', now()), 'B002|125', 'TR-CA-093');
SELECT seq_test.espera(seq_test.sig('BOLETA', 'B002', now()), 'B002|126', 'consecutivo');

DO $$
BEGIN
  BEGIN
    PERFORM seq_test.sig('FACTURA', 'F001', now());
    RAISE EXCEPTION 'la venta falla';
  EXCEPTION WHEN raise_exception THEN
    NULL;
  END;
END $$;
SELECT seq_test.espera(seq_test.sig('FACTURA', 'F001', now()), 'F001|81', 'TR-CA-095 revertir no consume');

-- ---------------------------------------------------------------------
-- Reinicio diario en la zona de la sucursal (TR-CA-092, 096, 097). La serie es de la ventanilla y
-- guarda la sucursal de la ventanilla. Terminó el 09/10/2026 (hora de Lima) en 342.
-- ---------------------------------------------------------------------
INSERT INTO seq.serie (id, tenant_id, empresa_id, sucursal_id, unidad_id, tipo, serie, digitos, reinicio,
                       ultimo_numero, creado_por, creado_en, modificado_por) VALUES
  ('d3000000-0000-0000-0000-00000000a003', 'd3000000-0000-0000-0000-000000000001', 'd3000000-0000-0000-0000-000000000011',
   'd3000000-0000-0000-0000-000000000102', 'd3000000-0000-0000-0000-000000000201', 'TICKET', 'A', 3, 'DIARIO', 342,
   'd3000000-0000-0000-0000-000000000901', '2026-10-09 12:00:00-05', 'd3000000-0000-0000-0000-000000000901');
SELECT seq_test.espera(seq_test.periodo('A'), '2026-10-09', 'periodo inicial del día de creación');
SELECT seq_test.espera(seq_test.sig('TICKET', 'A', '2026-10-10 04:30:00+00'), 'A|343', 'TR-CA-097 23:30 de Lima continúa');
SELECT seq_test.espera(seq_test.sig('TICKET', 'A', '2026-10-10 13:01:00+00'), 'A|1', 'TR-CA-096 08:01 de Lima reinicia');
SELECT seq_test.espera(seq_test.periodo('A'), '2026-10-10', 'periodo del nuevo día');
SELECT seq_test.espera(seq_test.sig('TICKET', 'A', '2026-10-10 13:02:00+00'), 'A|2', 'un solo reinicio por día');

-- Una serie migrada hoy con último 342 no reinicia en su primer número.
INSERT INTO seq.serie (id, tenant_id, empresa_id, sucursal_id, tipo, serie, digitos, reinicio, ultimo_numero,
                       creado_por, modificado_por) VALUES
  ('d3000000-0000-0000-0000-00000000a004', 'd3000000-0000-0000-0000-000000000001', 'd3000000-0000-0000-0000-000000000011',
   'd3000000-0000-0000-0000-000000000102', 'TICKET', 'M', 3, 'DIARIO', 342,
   'd3000000-0000-0000-0000-000000000901', 'd3000000-0000-0000-0000-000000000901');
SELECT seq_test.espera(seq_test.sig('TICKET', 'M', now()), 'M|343', 'serie migrada continúa');

-- ---------------------------------------------------------------------
-- Reinicio anual, serie de empresa sin sucursal: usa America/Lima.
-- ---------------------------------------------------------------------
INSERT INTO seq.serie (id, tenant_id, empresa_id, tipo, serie, digitos, reinicio, ultimo_numero,
                       creado_por, creado_en, modificado_por) VALUES
  ('d3000000-0000-0000-0000-00000000a005', 'd3000000-0000-0000-0000-000000000001', 'd3000000-0000-0000-0000-000000000011',
   'KARDEX', 'K', 8, 'ANUAL', 57, 'd3000000-0000-0000-0000-000000000901', '2026-12-31 20:00:00-05',
   'd3000000-0000-0000-0000-000000000901');
SELECT seq_test.espera(seq_test.periodo('K'), '2026', 'periodo inicial del año');
SELECT seq_test.espera(seq_test.sig('KARDEX', 'K', '2027-01-01 04:59:00+00'), 'K|58', 'aún 2026 en Lima');
SELECT seq_test.espera(seq_test.sig('KARDEX', 'K', '2027-01-01 05:00:00+00'), 'K|1', 'año nuevo en Lima reinicia');
SELECT seq_test.espera(seq_test.periodo('K'), '2027', 'periodo del año nuevo');

-- ---------------------------------------------------------------------
-- Inactiva, inexistente y agotada.
-- ---------------------------------------------------------------------
UPDATE seq.serie SET activa = false WHERE id = 'd3000000-0000-0000-0000-00000000a004';
SELECT seq_test.espera(seq_test.sig('TICKET', 'M', now()), NULL, 'inactiva sin filas');
SELECT seq_test.espera(seq_test.sig('TICKET', 'NOEXISTE', now()), NULL, 'inexistente sin filas');

INSERT INTO seq.serie (id, tenant_id, empresa_id, tipo, serie, digitos, reinicio, ultimo_numero,
                       creado_por, modificado_por) VALUES
  ('d3000000-0000-0000-0000-00000000a006', 'd3000000-0000-0000-0000-000000000001', 'd3000000-0000-0000-0000-000000000011',
   'TICKET', 'Z', 1, 'NUNCA', 9, 'd3000000-0000-0000-0000-000000000901', 'd3000000-0000-0000-0000-000000000901');
SELECT seq_test.debe_fallar($q$SELECT seq_test.sig('TICKET', 'Z', now())$q$, '23514', 'agotada');

-- ---------------------------------------------------------------------
-- Restricciones.
-- ---------------------------------------------------------------------
SELECT seq_test.debe_fallar(
  $q$INSERT INTO seq.serie (id, tenant_id, empresa_id, sucursal_id, tipo, serie, digitos, reinicio, ultimo_numero,
                            creado_por, modificado_por) VALUES
     ('d3000000-0000-0000-0000-00000000a0f1', 'd3000000-0000-0000-0000-000000000001', 'd3000000-0000-0000-0000-000000000011',
      'd3000000-0000-0000-0000-000000000102', 'FACTURA', 'B001', 8, 'NUNCA', 0,
      'd3000000-0000-0000-0000-000000000901', 'd3000000-0000-0000-0000-000000000901')$q$,
  '23514', 'TR-CA-091 B001 como factura');
SELECT seq_test.debe_fallar(
  $q$INSERT INTO seq.serie (id, tenant_id, empresa_id, tipo, serie, digitos, reinicio, ultimo_numero,
                            creado_por, modificado_por) VALUES
     ('d3000000-0000-0000-0000-00000000a0f2', 'd3000000-0000-0000-0000-000000000001', 'd3000000-0000-0000-0000-000000000011',
      'BOLETA', 'B003', 8, 'NUNCA', 0,
      'd3000000-0000-0000-0000-000000000901', 'd3000000-0000-0000-0000-000000000901')$q$,
  '23514', 'boleta sin sucursal');
SELECT seq_test.debe_fallar(
  $q$INSERT INTO seq.serie (id, tenant_id, empresa_id, sucursal_id, tipo, serie, digitos, reinicio, ultimo_numero,
                            creado_por, modificado_por) VALUES
     ('d3000000-0000-0000-0000-00000000a0f3', 'd3000000-0000-0000-0000-000000000001', 'd3000000-0000-0000-0000-000000000011',
      'd3000000-0000-0000-0000-000000000102', 'NOTA_CREDITO', 'BC01', 3, 'NUNCA', 0,
      'd3000000-0000-0000-0000-000000000901', 'd3000000-0000-0000-0000-000000000901')$q$,
  '23514', 'nota con 3 dígitos');
SELECT seq_test.debe_fallar(
  $q$INSERT INTO seq.serie (id, tenant_id, empresa_id, tipo, serie, digitos, reinicio, ultimo_numero,
                            creado_por, modificado_por) VALUES
     ('d3000000-0000-0000-0000-00000000a0f4', 'd3000000-0000-0000-0000-000000000001', 'd3000000-0000-0000-0000-000000000011',
      'TICKET', 'T', 3, 'NUNCA', 1000,
      'd3000000-0000-0000-0000-000000000901', 'd3000000-0000-0000-0000-000000000901')$q$,
  '23514', 'último que no cabe en sus dígitos');
SELECT seq_test.debe_fallar(
  $q$UPDATE seq.serie SET periodo = NULL WHERE id = 'd3000000-0000-0000-0000-00000000a003'$q$,
  '23514', 'DIARIO sin periodo');
SELECT seq_test.debe_fallar(
  $q$INSERT INTO seq.serie (id, tenant_id, empresa_id, sucursal_id, tipo, serie, digitos, reinicio, ultimo_numero,
                            creado_por, modificado_por) VALUES
     ('d3000000-0000-0000-0000-00000000a0f5', 'd3000000-0000-0000-0000-000000000001', 'd3000000-0000-0000-0000-000000000011',
      'd3000000-0000-0000-0000-000000000101', 'BOLETA', 'B002', 8, 'NUNCA', 0,
      'd3000000-0000-0000-0000-000000000901', 'd3000000-0000-0000-0000-000000000901')$q$,
  '23505', 'empresa, tipo y serie repetidos');
SELECT seq_test.debe_fallar(
  $q$INSERT INTO seq.serie (id, tenant_id, empresa_id, sucursal_id, tipo, serie, digitos, reinicio, ultimo_numero,
                            creado_por, modificado_por) VALUES
     ('d3000000-0000-0000-0000-00000000a0f6', 'd3000000-0000-0000-0000-000000000001', 'd3000000-0000-0000-0000-000000000011',
      'd4000000-0000-0000-0000-000000000101', 'BOLETA', 'B009', 8, 'NUNCA', 0,
      'd3000000-0000-0000-0000-000000000901', 'd3000000-0000-0000-0000-000000000901')$q$,
  '23503', 'sucursal de otro tenant');
SELECT seq_test.debe_fallar(
  $q$INSERT INTO seq.serie (id, tenant_id, empresa_id, sucursal_id, tipo, serie, digitos, reinicio, ultimo_numero,
                            creado_por, modificado_por) VALUES
     ('d4000000-0000-0000-0000-00000000a0f7', 'd4000000-0000-0000-0000-000000000002', 'd4000000-0000-0000-0000-000000000011',
      'd4000000-0000-0000-0000-000000000101', 'BOLETA', 'B002', 8, 'NUNCA', 0,
      'd3000000-0000-0000-0000-000000000901', 'd3000000-0000-0000-0000-000000000901')$q$,
  '42501', 'serie en otro tenant');
SELECT seq_test.debe_fallar(
  $q$DELETE FROM seq.serie WHERE id = 'd3000000-0000-0000-0000-00000000a001'$q$,
  '42501', 'las series no se borran');

-- ---------------------------------------------------------------------
-- Aislamiento: D no ve ni toca la serie de H; seq.siguiente con H no devuelve filas.
-- ---------------------------------------------------------------------
DO $$
DECLARE
  n int;
BEGIN
  IF EXISTS (SELECT 1 FROM seq.serie WHERE tenant_id <> 'd3000000-0000-0000-0000-000000000001') THEN
    RAISE EXCEPTION 'D no debía ver series de H';
  END IF;
  UPDATE seq.serie SET activa = false WHERE id = 'd4000000-0000-0000-0000-00000000a001';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION 'D no debía actualizar series de H'; END IF;
  IF EXISTS (SELECT 1 FROM seq.siguiente('d4000000-0000-0000-0000-000000000002', 'd4000000-0000-0000-0000-000000000011',
                                         'BOLETA', 'B001')) THEN
    RAISE EXCEPTION 'seq.siguiente con el tenant de H debía dar 0 filas';
  END IF;
  IF EXISTS (SELECT 1 FROM seq.siguiente('d3000000-0000-0000-0000-000000000001', 'd4000000-0000-0000-0000-000000000011',
                                         'BOLETA', 'B001')) THEN
    RAISE EXCEPTION 'seq.siguiente con la empresa de H debía dar 0 filas';
  END IF;
END $$;

RESET ROLE;
DO $$ BEGIN
  IF (SELECT ultimo_numero FROM seq.serie WHERE id = 'd4000000-0000-0000-0000-00000000a001') <> 10 THEN
    RAISE EXCEPTION 'la serie de H no debía avanzar';
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- Zona horaria inválida en la sucursal: la numeración falla y no consume (riesgo documentado).
-- ---------------------------------------------------------------------
UPDATE org.sucursal SET zona_horaria = 'Marte/Base' WHERE id = 'd3000000-0000-0000-0000-000000000102';
SET ROLE seq_test_app;
SELECT seq_test.debe_fallar($q$SELECT seq_test.sig('TICKET', 'A', now())$q$, '22023', 'zona horaria inválida');
RESET ROLE;
UPDATE org.sucursal SET zona_horaria = 'America/Lima' WHERE id = 'd3000000-0000-0000-0000-000000000102';

SELECT set_config('app.tenant_id', '', false);
DROP SCHEMA seq_test CASCADE;
