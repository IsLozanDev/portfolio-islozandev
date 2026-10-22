-- Prueba de 01b_seg_membresias. La ejecuta tools/migrar/test/db-esquemas.test.mjs después de
-- 01b_seg_autorizacion.test.sql, sobre la misma base. Siembra como superusuario y evalúa con
-- seg_test_app (sin BYPASSRLS).

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'seg_test_app') THEN
    CREATE ROLE seg_test_app NOLOGIN;
  END IF;
END $$;
GRANT USAGE ON SCHEMA seg, org TO seg_test_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA seg TO seg_test_app;
GRANT SELECT ON ALL TABLES IN SCHEMA org TO seg_test_app;
GRANT EXECUTE ON FUNCTION seg.invitacion_por_token(char) TO seg_test_app;

CREATE SCHEMA seg_mem_test;
CREATE FUNCTION seg_mem_test.debe_fallar(sentencia text, esperado text, caso text) RETURNS void
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
CREATE FUNCTION seg_mem_test.pe(p_usuario uuid, p_sucursal uuid) RETURNS text[] LANGUAGE sql AS $$
  SELECT ARRAY(SELECT permiso_codigo::text FROM seg.permisos_efectivos(p_usuario,
                 'c1000000-0000-0000-0000-000000000001', p_sucursal) ORDER BY 1);
$$;
CREATE FUNCTION seg_mem_test.vt() RETURNS bigint LANGUAGE sql AS $$
  SELECT COALESCE((SELECT version FROM seg.version_seguridad
                    WHERE tenant_id = 'c1000000-0000-0000-0000-000000000001'), 0);
$$;
GRANT USAGE ON SCHEMA seg_mem_test TO seg_test_app;

-- ---------------------------------------------------------------------
-- Siembra (superusuario). Tenant C con una sucursal; tenant D con una invitación.
-- ---------------------------------------------------------------------
INSERT INTO org.tenant (id, codigo, nombre, estado, version) VALUES
  ('c1000000-0000-0000-0000-000000000001', 'mem-tenant-c', 'Mem tenant C', 'ACTIVO', 1),
  ('d1000000-0000-0000-0000-000000000002', 'mem-tenant-d', 'Mem tenant D', 'ACTIVO', 1);
INSERT INTO org.empresa (id, tenant_id, ruc, razon_social, version) VALUES
  ('c1000000-0000-0000-0000-000000000011', 'c1000000-0000-0000-0000-000000000001', '20200000001', 'Mem Empresa C SAC', 1);
INSERT INTO org.sucursal (id, tenant_id, empresa_id, codigo, nombre, codigo_establecimiento_sunat, es_principal, version) VALUES
  ('c1000000-0000-0000-0000-000000000101', 'c1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000011',
   'MIRA', 'Miraflores', '0000', true, 1);

INSERT INTO seg.producto (codigo, nombre) VALUES ('REST', 'Restaurantes') ON CONFLICT (codigo) DO NOTHING;
INSERT INTO seg.permiso (codigo, producto_codigo, descripcion, alcance_minimo, sensible) VALUES
  ('rest.mesa.abrir', 'REST', 'Abrir mesa', 'SUCURSAL', false) ON CONFLICT (codigo) DO NOTHING;
INSERT INTO org.suscripcion (id, tenant_id, producto_codigo, plan, estado, version) VALUES
  ('c1000000-0000-0000-0000-000000000c01', 'c1000000-0000-0000-0000-000000000001', 'REST', 'PRO', 'ACTIVA', 1);

INSERT INTO seg.usuario (id, email, nombre, tipo, estado) VALUES
  ('c1000000-0000-0000-0000-000000000901', 'rosa.mem@gmail.com', 'Rosa', 'INTERNO', 'ACTIVO'),
  ('c1000000-0000-0000-0000-000000000902', 'pedro.mem@gmail.com', 'Pedro', 'INTERNO', 'ACTIVO'),
  ('d1000000-0000-0000-0000-000000000901', 'dora.mem@gmail.com', 'Dora', 'INTERNO', 'ACTIVO');

INSERT INTO seg.rol (id, tenant_id, producto_codigo, codigo, nombre, editable) VALUES
  ('c1000000-0000-0000-0000-000000000d01', 'c1000000-0000-0000-0000-000000000001', 'REST', 'MOZO_MEM', 'Mozo', true);
INSERT INTO seg.rol_permiso (rol_id, permiso_codigo) VALUES ('c1000000-0000-0000-0000-000000000d01', 'rest.mesa.abrir');

INSERT INTO seg.membresia (id, usuario_id, tenant_id, estado) VALUES
  ('c1000000-0000-0000-0000-000000000f01', 'c1000000-0000-0000-0000-000000000901', 'c1000000-0000-0000-0000-000000000001', 'INVITADO'),
  ('c1000000-0000-0000-0000-000000000f02', 'c1000000-0000-0000-0000-000000000902', 'c1000000-0000-0000-0000-000000000001', 'ACTIVO'),
  ('d1000000-0000-0000-0000-000000000f01', 'd1000000-0000-0000-0000-000000000901', 'd1000000-0000-0000-0000-000000000002', 'INVITADO');

-- Pedro: dos asignaciones del mismo rol en la sucursal (una se revoca abajo).
INSERT INTO seg.asignacion (id, tenant_id, membresia_id, rol_id, alcance, sucursal_id) VALUES
  ('c1000000-0000-0000-0000-000000001001', 'c1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000f02',
   'c1000000-0000-0000-0000-000000000d01', 'SUCURSAL', 'c1000000-0000-0000-0000-000000000101'),
  ('c1000000-0000-0000-0000-000000001002', 'c1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000f02',
   'c1000000-0000-0000-0000-000000000d01', 'TENANT', NULL);

INSERT INTO seg.invitacion (id, tenant_id, membresia_id, token_hash, expira_en, creada_por) VALUES
  ('d1000000-0000-0000-0000-00000000aa01', 'd1000000-0000-0000-0000-000000000002', 'd1000000-0000-0000-0000-000000000f01',
   repeat('d', 64), now() + interval '72 hours', 'd1000000-0000-0000-0000-000000000901');

SET ROLE seg_test_app;
SELECT set_config('app.tenant_id', 'c1000000-0000-0000-0000-000000000001', false);

-- ---------------------------------------------------------------------
-- Membresía: FINALIZADO y versión.
-- ---------------------------------------------------------------------
DO $$ BEGIN
  IF (SELECT version FROM seg.membresia WHERE id = 'c1000000-0000-0000-0000-000000000f02') <> 0 THEN
    RAISE EXCEPTION 'la membresía debía nacer con version 0';
  END IF;
END $$;
SELECT seg_mem_test.debe_fallar(
  $q$UPDATE seg.membresia SET estado = 'BORRADO' WHERE id = 'c1000000-0000-0000-0000-000000000f01'$q$,
  '23514', 'estado fuera del CHECK');

-- ---------------------------------------------------------------------
-- Invitaciones: una pendiente por membresía, uso exclusivo, RLS y sin borrado.
-- ---------------------------------------------------------------------
INSERT INTO seg.invitacion (id, tenant_id, membresia_id, token_hash, expira_en, creada_por) VALUES
  ('c1000000-0000-0000-0000-00000000aa01', 'c1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000f01',
   repeat('a', 64), now() + interval '72 hours', 'c1000000-0000-0000-0000-000000000902');
SELECT seg_mem_test.debe_fallar(
  $q$INSERT INTO seg.invitacion (id, tenant_id, membresia_id, token_hash, expira_en, creada_por) VALUES
     ('c1000000-0000-0000-0000-00000000aa02', 'c1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000f01',
      repeat('b', 64), now() + interval '72 hours', 'c1000000-0000-0000-0000-000000000902')$q$,
  '23505', 'segunda invitación pendiente');
UPDATE seg.invitacion SET anulada_en = now() WHERE id = 'c1000000-0000-0000-0000-00000000aa01';
INSERT INTO seg.invitacion (id, tenant_id, membresia_id, token_hash, expira_en, creada_por) VALUES
  ('c1000000-0000-0000-0000-00000000aa02', 'c1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000f01',
   repeat('b', 64), now() + interval '72 hours', 'c1000000-0000-0000-0000-000000000902');
SELECT seg_mem_test.debe_fallar(
  $q$UPDATE seg.invitacion SET usada_en = now() WHERE id = 'c1000000-0000-0000-0000-00000000aa01'$q$,
  '23514', 'usada y anulada a la vez');
SELECT seg_mem_test.debe_fallar(
  $q$DELETE FROM seg.invitacion WHERE id = 'c1000000-0000-0000-0000-00000000aa01'$q$,
  '42501', 'borrar una invitación');
SELECT seg_mem_test.debe_fallar(
  $q$INSERT INTO seg.invitacion (id, tenant_id, membresia_id, token_hash, expira_en, creada_por) VALUES
     ('c1000000-0000-0000-0000-00000000aa09', 'd1000000-0000-0000-0000-000000000002', 'd1000000-0000-0000-0000-000000000f01',
      repeat('9', 64), now(), 'd1000000-0000-0000-0000-000000000901')$q$,
  '42501', 'invitación en otro tenant');
DO $$ BEGIN
  IF (SELECT count(*) FROM seg.invitacion) <> 2 THEN
    RAISE EXCEPTION 'C debía ver solo sus 2 invitaciones';
  END IF;
END $$;

-- invitacion_por_token: sin tenant en el contexto, solo la fila del hash.
SELECT set_config('app.tenant_id', '', false);
DO $$
DECLARE
  f record;
BEGIN
  SELECT * INTO f FROM seg.invitacion_por_token(repeat('d', 64));
  IF f.tenant_id IS DISTINCT FROM 'd1000000-0000-0000-0000-000000000002'::uuid
     OR f.usuario_id IS DISTINCT FROM 'd1000000-0000-0000-0000-000000000901'::uuid
     OR f.tenant_nombre IS DISTINCT FROM 'Mem tenant D' THEN
    RAISE EXCEPTION 'invitacion_por_token no devolvió la invitación de D: %', f;
  END IF;
  IF EXISTS (SELECT 1 FROM seg.invitacion_por_token(repeat('e', 64))) THEN
    RAISE EXCEPTION 'un hash inexistente no debía devolver filas';
  END IF;
  IF EXISTS (SELECT 1 FROM seg.invitacion) THEN
    RAISE EXCEPTION 'sin tenant no debía leerse seg.invitacion directo';
  END IF;
END $$;
SELECT set_config('app.tenant_id', 'c1000000-0000-0000-0000-000000000001', false);

-- ---------------------------------------------------------------------
-- Asignación revocada: CHECK, fuera de permisos y sucursales, sube la versión.
-- ---------------------------------------------------------------------
SELECT seg_mem_test.debe_fallar(
  $q$UPDATE seg.asignacion SET revocada_en = now() WHERE id = 'c1000000-0000-0000-0000-000000001001'$q$,
  '23514', 'revocada sin motivo');

DO $$
DECLARE
  previa bigint := seg_mem_test.vt();
BEGIN
  UPDATE seg.asignacion SET revocada_en = now(), revocada_por = 'c1000000-0000-0000-0000-000000000902',
         motivo_revocacion = 'Cambio de puesto'
   WHERE id = 'c1000000-0000-0000-0000-000000001002';
  IF seg_mem_test.vt() <> previa + 1 THEN
    RAISE EXCEPTION 'revocar debía subir la versión de seguridad';
  END IF;
END $$;
DO $$ BEGIN
  IF seg_mem_test.pe('c1000000-0000-0000-0000-000000000902', 'c1000000-0000-0000-0000-000000000101')
     IS DISTINCT FROM ARRAY['rest.mesa.abrir'] THEN
    RAISE EXCEPTION 'la asignación vigente debía seguir dando su permiso';
  END IF;
END $$;
UPDATE seg.asignacion SET revocada_en = now(), motivo_revocacion = 'Cese'
 WHERE id = 'c1000000-0000-0000-0000-000000001001';
DO $$ BEGIN
  IF seg_mem_test.pe('c1000000-0000-0000-0000-000000000902', 'c1000000-0000-0000-0000-000000000101')
     IS DISTINCT FROM ARRAY[]::text[] THEN
    RAISE EXCEPTION 'las asignaciones revocadas no debían dar permisos';
  END IF;
  IF EXISTS (SELECT 1 FROM seg.sucursales_accesibles('c1000000-0000-0000-0000-000000000902',
                                                     'c1000000-0000-0000-0000-000000000001')) THEN
    RAISE EXCEPTION 'las asignaciones revocadas no debían dar sucursales';
  END IF;
END $$;

-- Motivo y actor no invalidan; el paso a FINALIZADO sí.
DO $$
DECLARE
  previa bigint := seg_mem_test.vt();
BEGIN
  UPDATE seg.membresia SET motivo = 'Cese', cambiado_por = 'c1000000-0000-0000-0000-000000000902',
         cambiado_en = now(), version = version + 1
   WHERE id = 'c1000000-0000-0000-0000-000000000f02';
  IF seg_mem_test.vt() <> previa THEN
    RAISE EXCEPTION 'motivo y actor no debían subir la versión';
  END IF;
  -- clock_timestamp: en la misma transacción now() es igual a `desde` y rompería ck_membresia_vigencia.
  UPDATE seg.membresia SET estado = 'FINALIZADO', hasta = clock_timestamp() WHERE id = 'c1000000-0000-0000-0000-000000000f02';
  IF seg_mem_test.vt() <> previa + 1 THEN
    RAISE EXCEPTION 'finalizar debía subir la versión';
  END IF;
END $$;

RESET ROLE;
SELECT set_config('app.tenant_id', '', false);
DROP SCHEMA seg_mem_test CASCADE;
