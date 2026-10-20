-- Prueba de org. La ejecuta tools/migrar/test/db-esquemas.test.mjs sobre una base temporal con db/
-- aplicado. Corre como superusuario y cambia a un rol sin BYPASSRLS.
-- DELETE se concede al rol para que el fallo sea del trigger, no de privilegios.

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'org_test_app') THEN
    CREATE ROLE org_test_app NOLOGIN;
  END IF;
END $$;
GRANT USAGE ON SCHEMA org TO org_test_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA org TO org_test_app;

-- Ejecuta la sentencia y exige que falle con el SQLSTATE esperado.
CREATE SCHEMA org_test;
CREATE FUNCTION org_test.debe_fallar(sentencia text, esperado text, caso text) RETURNS void
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
GRANT USAGE ON SCHEMA org_test TO org_test_app;

SET ROLE org_test_app;

-- ---------------------------------------------------------------------
-- Tenant A: jerarquía completa.
-- ---------------------------------------------------------------------
SELECT set_config('app.tenant_id', 'aaaaaaaa-0000-0000-0000-000000000001', false);

INSERT INTO org.tenant (id, codigo, nombre, estado, version)
VALUES ('aaaaaaaa-0000-0000-0000-000000000001', 'polleria-dona-rosa', 'Pollería Doña Rosa', 'PRUEBA', 1);
INSERT INTO org.suscripcion (id, tenant_id, producto_codigo, plan, estado, limite_sucursales, version)
VALUES ('a0000000-0000-0000-0000-000000000301', 'aaaaaaaa-0000-0000-0000-000000000001', 'REST', 'BASICO', 'PRUEBA', 2, 1);
INSERT INTO org.empresa (id, tenant_id, ruc, razon_social, ubigeo, version)
VALUES ('a0000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', '20512345671', 'Sabores del Sur SAC', '040101', 1);
INSERT INTO org.sucursal (id, tenant_id, empresa_id, codigo, nombre, codigo_establecimiento_sunat, es_principal, version)
VALUES ('a0000000-0000-0000-0000-000000000101', 'aaaaaaaa-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001',
        'PRINCIPAL', 'Centro', '0000', true, 1);
INSERT INTO org.sucursal (id, tenant_id, empresa_id, codigo, nombre, codigo_establecimiento_sunat, ubigeo, version)
VALUES ('a0000000-0000-0000-0000-000000000102', 'aaaaaaaa-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001',
        'CAYMA', 'Cayma', '0002', '040103', 1);
INSERT INTO org.unidad_operativa (id, tenant_id, empresa_id, sucursal_id, tipo, codigo, nombre, version)
VALUES ('a0000000-0000-0000-0000-000000000201', 'aaaaaaaa-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001',
        'a0000000-0000-0000-0000-000000000102', 'CAJA', 'CAJA-01', 'Caja 1', 1);
-- TR-RN-004: el almacén puede ser de la empresa, sin sucursal.
INSERT INTO org.unidad_operativa (id, tenant_id, empresa_id, tipo, codigo, nombre, version)
VALUES ('a0000000-0000-0000-0000-000000000202', 'aaaaaaaa-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001',
        'ALMACEN', 'ALM-CENTRAL', 'Almacén central', 1);
INSERT INTO org.tenant_estado_historial (id, tenant_id, estado_anterior, estado_nuevo, motivo, fecha_efectiva)
VALUES ('a0000000-0000-0000-0000-000000000401', 'aaaaaaaa-0000-0000-0000-000000000001', 'PRUEBA', 'ACTIVO',
        'Pago del primer mes recibido', now());

DO $$ BEGIN
  IF (SELECT count(*) FROM org.tenant) <> 1 THEN RAISE EXCEPTION 'tenant A debía verse a sí mismo'; END IF;
  IF (SELECT count(*) FROM org.sucursal) <> 2 THEN RAISE EXCEPTION 'tenant A debía ver 2 sucursales'; END IF;
  IF (SELECT count(*) FROM org.unidad_operativa) <> 2 THEN RAISE EXCEPTION 'tenant A debía ver 2 unidades'; END IF;
  IF (SELECT count(*) FROM org.tenant_estado_historial) <> 1 THEN RAISE EXCEPTION 'tenant A debía ver su historial'; END IF;
END $$;

-- RLS: no se escribe en nombre de otro tenant.
SELECT org_test.debe_fallar(
  $q$INSERT INTO org.tenant (id, codigo, nombre, estado, version)
     VALUES ('bbbbbbbb-0000-0000-0000-000000000002', 'otro-tenant', 'Otro tenant', 'ACTIVO', 1)$q$,
  '42501', 'crear otro tenant');
SELECT org_test.debe_fallar(
  $q$INSERT INTO org.empresa (id, tenant_id, ruc, razon_social, version)
     VALUES (gen_random_uuid(), 'bbbbbbbb-0000-0000-0000-000000000002', '20601234565', 'Ajena SAC', 1)$q$,
  '42501', 'empresa con tenant ajeno');
SELECT org_test.debe_fallar(
  $q$UPDATE org.empresa SET tenant_id = 'bbbbbbbb-0000-0000-0000-000000000002'$q$,
  '42501', 'mover empresa a otro tenant');

-- CHECK de tenant.
SELECT org_test.debe_fallar($q$UPDATE org.tenant SET codigo = 'Polleria'$q$, '23514', 'código con mayúsculas');
SELECT org_test.debe_fallar($q$UPDATE org.tenant SET codigo = 'ab'$q$, '23514', 'código corto');
SELECT org_test.debe_fallar($q$UPDATE org.tenant SET estado = 'BAJA'$q$, '23514', 'BAJA sin baja_en');
SELECT org_test.debe_fallar($q$UPDATE org.tenant SET baja_en = now()$q$, '23514', 'baja_en sin BAJA');
SELECT org_test.debe_fallar($q$UPDATE org.tenant SET estado = 'CERRADO'$q$, '23514', 'estado inválido');

-- CHECK de suscripción.
SELECT org_test.debe_fallar($q$UPDATE org.suscripcion SET plan = 'GOLD'$q$, '23514', 'plan inválido');
SELECT org_test.debe_fallar($q$UPDATE org.suscripcion SET limite_sucursales = 0$q$, '23514', 'límite de sucursales 0');
SELECT org_test.debe_fallar($q$UPDATE org.suscripcion SET limite_usuarios = 0$q$, '23514', 'límite de usuarios 0');
SELECT org_test.debe_fallar($q$UPDATE org.suscripcion SET producto_codigo = 'XXX'$q$, '23514', 'producto inválido');
SELECT org_test.debe_fallar($q$UPDATE org.suscripcion SET estado = 'ACTIVO'$q$, '23514', 'estado de suscripción inválido');
SELECT org_test.debe_fallar(
  $q$INSERT INTO org.suscripcion (id, tenant_id, producto_codigo, plan, estado, version)
     VALUES (gen_random_uuid(), 'aaaaaaaa-0000-0000-0000-000000000001', 'REST', 'PRO', 'ACTIVA', 1)$q$,
  '23505', 'producto repetido en el tenant');

-- CHECK de empresa (TR-RN-002).
SELECT org_test.debe_fallar($q$UPDATE org.empresa SET ruc = '30512345678'$q$, '23514', 'RUC con prefijo inválido');
SELECT org_test.debe_fallar($q$UPDATE org.empresa SET ruc = '2051234567'$q$, '23514', 'RUC de 10 dígitos');
SELECT org_test.debe_fallar($q$UPDATE org.empresa SET ubigeo = '04010A'$q$, '23514', 'ubigeo inválido');
SELECT org_test.debe_fallar($q$UPDATE org.empresa SET razon_social = ''$q$, '23514', 'razón social vacía');
SELECT org_test.debe_fallar(
  $q$INSERT INTO org.empresa (id, tenant_id, ruc, razon_social, version)
     VALUES (gen_random_uuid(), 'aaaaaaaa-0000-0000-0000-000000000001', '20512345671', 'Duplicada SAC', 1)$q$,
  '23505', 'RUC repetido en el tenant');

-- Sucursal principal (TR-RN-003).
SELECT org_test.debe_fallar(
  $q$UPDATE org.sucursal SET codigo_establecimiento_sunat = '0001' WHERE es_principal$q$,
  '23514', 'principal sin 0000');
SELECT org_test.debe_fallar(
  $q$UPDATE org.sucursal SET codigo_establecimiento_sunat = '0000' WHERE NOT es_principal$q$,
  '23514', '0000 en no principal');
SELECT org_test.debe_fallar($q$UPDATE org.sucursal SET activo = false WHERE es_principal$q$, '23514', 'principal inactiva');
SELECT org_test.debe_fallar(
  $q$UPDATE org.sucursal SET es_principal = true WHERE NOT es_principal$q$,
  '23514', 'segunda principal sin 0000');
SELECT org_test.debe_fallar(
  $q$INSERT INTO org.sucursal (id, tenant_id, empresa_id, codigo, nombre, codigo_establecimiento_sunat, es_principal, version)
     VALUES (gen_random_uuid(), 'aaaaaaaa-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001',
             'OTRA', 'Otra principal', '0000', true, 1)$q$,
  '23505', 'dos principales en la empresa');
SELECT org_test.debe_fallar(
  $q$INSERT INTO org.sucursal (id, tenant_id, empresa_id, codigo, nombre, codigo_establecimiento_sunat, version)
     VALUES (gen_random_uuid(), 'aaaaaaaa-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001',
             'YANAHUARA', 'Yanahuara', '0002', 1)$q$,
  '23505', 'establecimiento repetido');
SELECT org_test.debe_fallar(
  $q$INSERT INTO org.sucursal (id, tenant_id, empresa_id, codigo, nombre, version)
     VALUES (gen_random_uuid(), 'aaaaaaaa-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001',
             'CAYMA', 'Cayma bis', 1)$q$,
  '23505', 'código de sucursal repetido');

-- Traslado de principal (TR-CA-009): se quita la marca a la anterior y luego se pone a la nueva.
UPDATE org.sucursal SET es_principal = false, codigo_establecimiento_sunat = NULL
 WHERE id = 'a0000000-0000-0000-0000-000000000101';
UPDATE org.sucursal SET es_principal = true, codigo_establecimiento_sunat = '0000'
 WHERE id = 'a0000000-0000-0000-0000-000000000102';
DO $$ BEGIN
  IF (SELECT count(*) FROM org.sucursal WHERE es_principal) <> 1 THEN RAISE EXCEPTION 'debía quedar una sola principal'; END IF;
  IF (SELECT codigo FROM org.sucursal WHERE es_principal) <> 'CAYMA' THEN RAISE EXCEPTION 'Cayma debía ser la principal'; END IF;
END $$;

-- Unidades (TR-RN-004).
SELECT org_test.debe_fallar(
  $q$INSERT INTO org.unidad_operativa (id, tenant_id, empresa_id, tipo, codigo, nombre, version)
     VALUES (gen_random_uuid(), 'aaaaaaaa-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001',
             'CONSULTORIO', 'CONS-01', 'Consultorio 1', 1)$q$,
  '23514', 'consultorio sin sucursal');
SELECT org_test.debe_fallar(
  $q$UPDATE org.unidad_operativa SET padre_id = id WHERE codigo = 'CAJA-01'$q$,
  '23514', 'unidad padre de sí misma');
SELECT org_test.debe_fallar(
  $q$UPDATE org.unidad_operativa SET padre_id = gen_random_uuid() WHERE codigo = 'CAJA-01'$q$,
  '23503', 'padre inexistente');
SELECT org_test.debe_fallar(
  $q$INSERT INTO org.unidad_operativa (id, tenant_id, empresa_id, sucursal_id, tipo, codigo, nombre, version)
     VALUES (gen_random_uuid(), 'aaaaaaaa-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001',
             'a0000000-0000-0000-0000-000000000101', 'CAJA', 'CAJA-01', 'Caja repetida', 1)$q$,
  '23505', 'unidad repetida en empresa+tipo+código');

-- Historial: motivo de 10 caracteres y solo inserción.
SELECT org_test.debe_fallar(
  $q$INSERT INTO org.tenant_estado_historial (id, tenant_id, estado_anterior, estado_nuevo, motivo, fecha_efectiva)
     VALUES (gen_random_uuid(), 'aaaaaaaa-0000-0000-0000-000000000001', 'ACTIVO', 'SUSPENDIDO', 'Deuda', now())$q$,
  '23514', 'motivo corto');
SELECT org_test.debe_fallar($q$UPDATE org.tenant_estado_historial SET motivo = 'Otro motivo largo'$q$, '42501', 'UPDATE del historial');

-- Nada se borra, ni siquiera las filas propias.
SELECT org_test.debe_fallar($q$DELETE FROM org.tenant_estado_historial$q$, '42501', 'DELETE historial');
SELECT org_test.debe_fallar($q$DELETE FROM org.unidad_operativa$q$, '42501', 'DELETE unidad');
SELECT org_test.debe_fallar($q$DELETE FROM org.sucursal$q$, '42501', 'DELETE sucursal');
SELECT org_test.debe_fallar($q$DELETE FROM org.empresa$q$, '42501', 'DELETE empresa');
SELECT org_test.debe_fallar($q$DELETE FROM org.suscripcion$q$, '42501', 'DELETE suscripción');
SELECT org_test.debe_fallar($q$DELETE FROM org.tenant$q$, '42501', 'DELETE tenant');

-- ---------------------------------------------------------------------
-- Tenant B: no ve ni toca nada de A.
-- ---------------------------------------------------------------------
SELECT set_config('app.tenant_id', 'bbbbbbbb-0000-0000-0000-000000000002', false);

INSERT INTO org.tenant (id, codigo, nombre, estado, version)
VALUES ('bbbbbbbb-0000-0000-0000-000000000002', 'grupo-sabores', 'Grupo Sabores', 'ACTIVO', 1);
-- El mismo RUC puede existir en otro tenant.
INSERT INTO org.empresa (id, tenant_id, ruc, razon_social, version)
VALUES ('b0000000-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000002', '20512345671', 'Sabores del Sur SAC', 1);

DO $$
DECLARE
  n int;
BEGIN
  IF (SELECT count(*) FROM org.tenant) <> 1 THEN RAISE EXCEPTION 'tenant B solo debía verse a sí mismo'; END IF;
  IF (SELECT count(*) FROM org.empresa) <> 1 THEN RAISE EXCEPTION 'tenant B solo debía ver su empresa'; END IF;
  IF (SELECT count(*) FROM org.suscripcion) <> 0 THEN RAISE EXCEPTION 'tenant B vio suscripciones de A'; END IF;
  IF (SELECT count(*) FROM org.sucursal) <> 0 THEN RAISE EXCEPTION 'tenant B vio sucursales de A'; END IF;
  IF (SELECT count(*) FROM org.unidad_operativa) <> 0 THEN RAISE EXCEPTION 'tenant B vio unidades de A'; END IF;
  IF (SELECT count(*) FROM org.tenant_estado_historial) <> 0 THEN RAISE EXCEPTION 'tenant B vio el historial de A'; END IF;

  UPDATE org.tenant SET nombre = 'Tomado' WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION 'tenant B modificó el tenant A'; END IF;
  UPDATE org.sucursal SET nombre = 'Tomada';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION 'tenant B modificó sucursales de A'; END IF;
END $$;

-- La FK compuesta impide colgar una sucursal de B de una empresa de A.
SELECT org_test.debe_fallar(
  $q$INSERT INTO org.sucursal (id, tenant_id, empresa_id, codigo, nombre, version)
     VALUES (gen_random_uuid(), 'bbbbbbbb-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001',
             'INTRUSA', 'Sucursal intrusa', 1)$q$,
  '23503', 'sucursal de B en empresa de A');

-- Sin tenant en el contexto ('' tras un SET LOCAL previo): nada visible, nada se inserta.
SELECT set_config('app.tenant_id', '', false);
DO $$ BEGIN
  IF (SELECT count(*) FROM org.tenant) + (SELECT count(*) FROM org.empresa) <> 0 THEN
    RAISE EXCEPTION 'sin tenant no debía verse nada';
  END IF;
END $$;
SELECT org_test.debe_fallar(
  $q$INSERT INTO org.tenant (id, codigo, nombre, estado, version)
     VALUES (gen_random_uuid(), 'sin-contexto', 'Sin contexto', 'ACTIVO', 1)$q$,
  '42501', 'tenant sin contexto');

RESET ROLE;
DROP SCHEMA org_test CASCADE;

-- anon y authenticated no tienen acceso (solo si existen: PostgreSQL plano no los trae).
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    IF has_schema_privilege('anon', 'org', 'USAGE') OR has_schema_privilege('authenticated', 'org', 'USAGE') THEN
      RAISE EXCEPTION 'anon/authenticated no deben tener USAGE sobre org';
    END IF;
    IF has_table_privilege('anon', 'org.tenant', 'SELECT') OR has_table_privilege('authenticated', 'org.empresa', 'INSERT') THEN
      RAISE EXCEPTION 'anon/authenticated no deben tener privilegios sobre org';
    END IF;
  END IF;
END $$;
