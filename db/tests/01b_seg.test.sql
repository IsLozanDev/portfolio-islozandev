-- Prueba de seg. La ejecuta tools/migrar/test/db-esquemas.test.mjs sobre una base temporal con db/
-- aplicado. Corre como superusuario para sembrar org y el catálogo, y cambia a un rol sin BYPASSRLS.
-- DELETE se concede al rol para que el fallo sea del trigger, no de privilegios.

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'seg_test_app') THEN
    CREATE ROLE seg_test_app NOLOGIN;
  END IF;
END $$;
GRANT USAGE ON SCHEMA seg TO seg_test_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA seg TO seg_test_app;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA seg TO seg_test_app;

CREATE SCHEMA seg_test;
CREATE FUNCTION seg_test.debe_fallar(sentencia text, esperado text, caso text) RETURNS void
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
GRANT USAGE ON SCHEMA seg_test TO seg_test_app;

-- ---------------------------------------------------------------------
-- Siembra como superusuario (salta la RLS): dos tenants con su jerarquía, catálogo, usuarios,
-- un rol y un perfil predefinidos, y una membresía de B.
-- ---------------------------------------------------------------------
INSERT INTO org.tenant (id, codigo, nombre, estado, version) VALUES
  ('cccccccc-0000-0000-0000-000000000001', 'seg-tenant-a', 'Seg tenant A', 'ACTIVO', 1),
  ('dddddddd-0000-0000-0000-000000000002', 'seg-tenant-b', 'Seg tenant B', 'ACTIVO', 1);
INSERT INTO org.empresa (id, tenant_id, ruc, razon_social, version) VALUES
  ('c0000000-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001', '20601234565', 'Empresa A SAC', 1),
  ('d0000000-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000002', '20498765433', 'Empresa B SAC', 1);
INSERT INTO org.sucursal (id, tenant_id, empresa_id, codigo, nombre, codigo_establecimiento_sunat, es_principal, version) VALUES
  ('c0000000-0000-0000-0000-000000000101', 'cccccccc-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001',
   'PRINCIPAL', 'Principal A', '0000', true, 1),
  ('d0000000-0000-0000-0000-000000000101', 'dddddddd-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000001',
   'PRINCIPAL', 'Principal B', '0000', true, 1);
INSERT INTO org.unidad_operativa (id, tenant_id, empresa_id, sucursal_id, tipo, codigo, nombre, version) VALUES
  ('d0000000-0000-0000-0000-000000000201', 'dddddddd-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000001',
   'd0000000-0000-0000-0000-000000000101', 'CAJA', 'CAJA-01', 'Caja B', 1);

INSERT INTO seg.producto (codigo, nombre) VALUES ('PLAT', 'Plataforma'), ('REST', 'Restaurantes');
INSERT INTO seg.permiso (codigo, producto_codigo, descripcion, sensible) VALUES
  ('rest.venta.registrar', 'REST', 'Registrar venta', false),
  ('rest.venta.anular', 'REST', 'Anular venta', true);

INSERT INTO seg.usuario (id, email, nombre, tipo, estado) VALUES
  ('e0000000-0000-0000-0000-000000000001', 'maria.flores@gmail.com', 'Maria', 'EXTERNO', 'ACTIVO'),
  ('e0000000-0000-0000-0000-000000000002', 'luis.quispe@gmail.com', 'Luis', 'EXTERNO', 'ACTIVO');

INSERT INTO seg.rol (id, tenant_id, producto_codigo, codigo, nombre, editable) VALUES
  ('f0000000-0000-0000-0000-000000000001', NULL, 'REST', 'CAJERO', 'Cajero', false);
INSERT INTO seg.rol_permiso (rol_id, permiso_codigo) VALUES
  ('f0000000-0000-0000-0000-000000000001', 'rest.venta.registrar');
INSERT INTO seg.perfil (id, tenant_id, codigo, nombre) VALUES
  ('f0000000-0000-0000-0000-000000000101', NULL, 'CAJERO', 'Cajero');
INSERT INTO seg.perfil_rol (perfil_id, rol_id) VALUES
  ('f0000000-0000-0000-0000-000000000101', 'f0000000-0000-0000-0000-000000000001');

INSERT INTO seg.membresia (id, usuario_id, tenant_id, estado) VALUES
  ('d0000000-0000-0000-0000-000000000301', 'e0000000-0000-0000-0000-000000000002', 'dddddddd-0000-0000-0000-000000000002', 'ACTIVO');

-- CHECK de usuario (tabla global).
SELECT seg_test.debe_fallar(
  $q$INSERT INTO seg.usuario (id, email, nombre, tipo, estado)
     VALUES (gen_random_uuid(), 'Maria.Flores@Gmail.com', 'Maria', 'EXTERNO', 'ACTIVO')$q$,
  '23514', 'correo con mayúsculas');
SELECT seg_test.debe_fallar(
  $q$INSERT INTO seg.usuario (id, email, nombre, tipo, estado)
     VALUES (gen_random_uuid(), 'otro@gmail.com', 'Otro', 'ADMIN', 'ACTIVO')$q$,
  '23514', 'tipo inválido');
SELECT seg_test.debe_fallar(
  $q$INSERT INTO seg.usuario (id, email, nombre, tipo, estado)
     VALUES (gen_random_uuid(), 'maria.flores@gmail.com', 'Maria bis', 'EXTERNO', 'ACTIVO')$q$,
  '23505', 'correo repetido');
SELECT seg_test.debe_fallar(
  $q$INSERT INTO seg.usuario (id, email, nombre) VALUES (gen_random_uuid(), 'sin-tipo@gmail.com', 'Sin tipo')$q$,
  '23502', 'tipo y estado sin default');

SET ROLE seg_test_app;

-- ---------------------------------------------------------------------
-- Tenant A
-- ---------------------------------------------------------------------
SELECT set_config('app.tenant_id', 'cccccccc-0000-0000-0000-000000000001', false);

INSERT INTO seg.membresia (id, usuario_id, tenant_id, estado) VALUES
  ('c0000000-0000-0000-0000-000000000301', 'e0000000-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001', 'ACTIVO');
INSERT INTO seg.asignacion (id, tenant_id, membresia_id, rol_id, alcance) VALUES
  ('c0000000-0000-0000-0000-000000000401', 'cccccccc-0000-0000-0000-000000000001',
   'c0000000-0000-0000-0000-000000000301', 'f0000000-0000-0000-0000-000000000001', 'TENANT');
INSERT INTO seg.asignacion (id, tenant_id, membresia_id, perfil_id, alcance, sucursal_id) VALUES
  ('c0000000-0000-0000-0000-000000000402', 'cccccccc-0000-0000-0000-000000000001',
   'c0000000-0000-0000-0000-000000000301', 'f0000000-0000-0000-0000-000000000101', 'SUCURSAL',
   'c0000000-0000-0000-0000-000000000101');
INSERT INTO seg.rol (id, tenant_id, producto_codigo, codigo, nombre) VALUES
  ('c0000000-0000-0000-0000-000000000501', 'cccccccc-0000-0000-0000-000000000001', 'REST', 'SUPERVISOR', 'Supervisor');
INSERT INTO seg.rol_permiso (rol_id, permiso_codigo) VALUES
  ('c0000000-0000-0000-0000-000000000501', 'rest.venta.registrar'),
  ('c0000000-0000-0000-0000-000000000501', 'rest.venta.anular');
INSERT INTO seg.perfil (id, tenant_id, codigo, nombre) VALUES
  ('c0000000-0000-0000-0000-000000000601', 'cccccccc-0000-0000-0000-000000000001', 'JEFE', 'Jefe de turno');
INSERT INTO seg.perfil_rol (perfil_id, rol_id) VALUES
  ('c0000000-0000-0000-0000-000000000601', 'c0000000-0000-0000-0000-000000000501');
INSERT INTO seg.evento_seguridad (tenant_id, usuario_id, tipo) VALUES
  ('cccccccc-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001', 'ASIGNACION_OTORGADA');

DO $$ BEGIN
  IF (SELECT count(*) FROM seg.membresia) <> 1 THEN RAISE EXCEPTION 'A debía ver solo su membresía'; END IF;
  IF (SELECT count(*) FROM seg.asignacion) <> 2 THEN RAISE EXCEPTION 'A debía ver sus 2 asignaciones'; END IF;
  IF (SELECT count(*) FROM seg.rol) <> 2 THEN RAISE EXCEPTION 'A debía ver el rol predefinido y el propio'; END IF;
  IF (SELECT count(*) FROM seg.perfil) <> 2 THEN RAISE EXCEPTION 'A debía ver el perfil predefinido y el propio'; END IF;
  IF (SELECT count(*) FROM seg.rol_permiso) <> 3 THEN RAISE EXCEPTION 'A debía ver 3 rol_permiso'; END IF;
  IF (SELECT count(*) FROM seg.perfil_rol) <> 2 THEN RAISE EXCEPTION 'A debía ver 2 perfil_rol'; END IF;
  IF (SELECT count(*) FROM seg.evento_seguridad) <> 1 THEN RAISE EXCEPTION 'A debía ver su evento'; END IF;
END $$;

-- RLS: no se escribe en nombre de otro tenant.
SELECT seg_test.debe_fallar(
  $q$INSERT INTO seg.membresia (id, usuario_id, tenant_id) VALUES
     (gen_random_uuid(), 'e0000000-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000002')$q$,
  '42501', 'membresía en otro tenant');
SELECT seg_test.debe_fallar(
  $q$INSERT INTO seg.rol (id, tenant_id, producto_codigo, codigo, nombre)
     VALUES (gen_random_uuid(), NULL, 'REST', 'MOZO', 'Mozo')$q$,
  '42501', 'crear rol predefinido');
SELECT seg_test.debe_fallar(
  $q$INSERT INTO seg.rol_permiso (rol_id, permiso_codigo)
     VALUES ('f0000000-0000-0000-0000-000000000001', 'rest.venta.anular')$q$,
  '42501', 'agregar permiso a rol predefinido');
SELECT seg_test.debe_fallar(
  $q$INSERT INTO seg.perfil_rol (perfil_id, rol_id)
     VALUES ('f0000000-0000-0000-0000-000000000101', 'c0000000-0000-0000-0000-000000000501')$q$,
  '42501', 'agregar rol a perfil predefinido');
SELECT seg_test.debe_fallar(
  $q$INSERT INTO seg.evento_seguridad (tenant_id, tipo) VALUES (NULL, 'LOGIN')$q$,
  '42501', 'evento sin tenant');

-- El rol y el perfil predefinidos no se modifican desde un tenant.
DO $$
DECLARE
  n int;
BEGIN
  UPDATE seg.rol SET nombre = 'Tomado' WHERE id = 'f0000000-0000-0000-0000-000000000001';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION 'A modificó el rol predefinido'; END IF;
  UPDATE seg.perfil SET nombre = 'Tomado' WHERE id = 'f0000000-0000-0000-0000-000000000101';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION 'A modificó el perfil predefinido'; END IF;
  DELETE FROM seg.rol_permiso WHERE rol_id = 'f0000000-0000-0000-0000-000000000001';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION 'A quitó permisos del rol predefinido'; END IF;
END $$;

-- FK compuestas: nada de otro tenant.
SELECT seg_test.debe_fallar(
  $q$INSERT INTO seg.asignacion (id, tenant_id, membresia_id, rol_id, alcance)
     VALUES (gen_random_uuid(), 'cccccccc-0000-0000-0000-000000000001',
             'd0000000-0000-0000-0000-000000000301', 'f0000000-0000-0000-0000-000000000001', 'TENANT')$q$,
  '23503', 'membresía de otro tenant');
SELECT seg_test.debe_fallar(
  $q$INSERT INTO seg.asignacion (id, tenant_id, membresia_id, rol_id, alcance, empresa_id)
     VALUES (gen_random_uuid(), 'cccccccc-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000301',
             'f0000000-0000-0000-0000-000000000001', 'EMPRESA', 'd0000000-0000-0000-0000-000000000001')$q$,
  '23503', 'empresa de otro tenant');
SELECT seg_test.debe_fallar(
  $q$INSERT INTO seg.asignacion (id, tenant_id, membresia_id, rol_id, alcance, sucursal_id)
     VALUES (gen_random_uuid(), 'cccccccc-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000301',
             'f0000000-0000-0000-0000-000000000001', 'SUCURSAL', 'd0000000-0000-0000-0000-000000000101')$q$,
  '23503', 'sucursal de otro tenant');
SELECT seg_test.debe_fallar(
  $q$INSERT INTO seg.asignacion (id, tenant_id, membresia_id, rol_id, alcance, unidad_id)
     VALUES (gen_random_uuid(), 'cccccccc-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000301',
             'f0000000-0000-0000-0000-000000000001', 'UNIDAD', 'd0000000-0000-0000-0000-000000000201')$q$,
  '23503', 'unidad de otro tenant');

-- TR-RN-008: rol o perfil (nunca ambos ni ninguno), alcance coherente, hasta no anterior a desde.
SELECT seg_test.debe_fallar(
  $q$UPDATE seg.asignacion SET perfil_id = 'f0000000-0000-0000-0000-000000000101'
      WHERE id = 'c0000000-0000-0000-0000-000000000401'$q$,
  '23514', 'rol y perfil');
SELECT seg_test.debe_fallar(
  $q$UPDATE seg.asignacion SET rol_id = NULL WHERE id = 'c0000000-0000-0000-0000-000000000401'$q$,
  '23514', 'ni rol ni perfil');
SELECT seg_test.debe_fallar(
  $q$UPDATE seg.asignacion SET alcance = 'SUCURSAL' WHERE id = 'c0000000-0000-0000-0000-000000000401'$q$,
  '23514', 'SUCURSAL sin sucursal');
SELECT seg_test.debe_fallar(
  $q$UPDATE seg.asignacion SET empresa_id = 'c0000000-0000-0000-0000-000000000001'
      WHERE id = 'c0000000-0000-0000-0000-000000000401'$q$,
  '23514', 'TENANT con empresa');
SELECT seg_test.debe_fallar(
  $q$UPDATE seg.asignacion SET vigente_desde = '2026-11-10', vigente_hasta = '2026-11-01'
      WHERE id = 'c0000000-0000-0000-0000-000000000401'$q$,
  '23514', 'vigencia invertida');
SELECT seg_test.debe_fallar(
  $q$UPDATE seg.membresia SET hasta = desde$q$, '23514', 'membresía con hasta = desde');
SELECT seg_test.debe_fallar(
  $q$UPDATE seg.membresia SET estado = 'BAJA'$q$, '23514', 'estado de membresía inválido');
SELECT seg_test.debe_fallar(
  $q$INSERT INTO seg.membresia (id, usuario_id, tenant_id) VALUES
     (gen_random_uuid(), 'e0000000-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001')$q$,
  '23505', 'membresía repetida');

-- Editar los permisos de un rol propio sí borra filas.
DELETE FROM seg.rol_permiso
 WHERE rol_id = 'c0000000-0000-0000-0000-000000000501' AND permiso_codigo = 'rest.venta.anular';
DO $$ BEGIN
  IF (SELECT count(*) FROM seg.rol_permiso WHERE rol_id = 'c0000000-0000-0000-0000-000000000501') <> 1 THEN
    RAISE EXCEPTION 'debía quitarse un permiso del rol propio';
  END IF;
END $$;

-- Nada más se borra; la bitácora no se modifica.
SELECT seg_test.debe_fallar($q$DELETE FROM seg.asignacion$q$, '42501', 'DELETE asignación');
SELECT seg_test.debe_fallar($q$DELETE FROM seg.membresia$q$, '42501', 'DELETE membresía');
SELECT seg_test.debe_fallar($q$DELETE FROM seg.rol WHERE tenant_id IS NOT NULL$q$, '42501', 'DELETE rol');
SELECT seg_test.debe_fallar($q$DELETE FROM seg.perfil WHERE tenant_id IS NOT NULL$q$, '42501', 'DELETE perfil');
SELECT seg_test.debe_fallar($q$UPDATE seg.evento_seguridad SET tipo = 'OTRO'$q$, '42501', 'UPDATE evento');
SELECT seg_test.debe_fallar($q$DELETE FROM seg.evento_seguridad$q$, '42501', 'DELETE evento');

-- ---------------------------------------------------------------------
-- Tenant B: no ve ni toca nada de A.
-- ---------------------------------------------------------------------
SELECT set_config('app.tenant_id', 'dddddddd-0000-0000-0000-000000000002', false);

DO $$
DECLARE
  n int;
BEGIN
  IF (SELECT count(*) FROM seg.membresia) <> 1 THEN RAISE EXCEPTION 'B debía ver solo su membresía'; END IF;
  IF (SELECT count(*) FROM seg.asignacion) <> 0 THEN RAISE EXCEPTION 'B vio asignaciones de A'; END IF;
  IF (SELECT count(*) FROM seg.rol) <> 1 THEN RAISE EXCEPTION 'B debía ver solo el rol predefinido'; END IF;
  IF (SELECT count(*) FROM seg.perfil) <> 1 THEN RAISE EXCEPTION 'B debía ver solo el perfil predefinido'; END IF;
  IF (SELECT count(*) FROM seg.rol_permiso) <> 1 THEN RAISE EXCEPTION 'B vio rol_permiso de A'; END IF;
  IF (SELECT count(*) FROM seg.perfil_rol) <> 1 THEN RAISE EXCEPTION 'B vio perfil_rol de A'; END IF;
  IF (SELECT count(*) FROM seg.evento_seguridad) <> 0 THEN RAISE EXCEPTION 'B vio eventos de A'; END IF;

  UPDATE seg.membresia SET estado = 'SUSPENDIDO' WHERE id = 'c0000000-0000-0000-0000-000000000301';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION 'B modificó una membresía de A'; END IF;
  UPDATE seg.rol SET nombre = 'Tomado' WHERE id = 'c0000000-0000-0000-0000-000000000501';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION 'B modificó un rol de A'; END IF;
  DELETE FROM seg.rol_permiso WHERE rol_id = 'c0000000-0000-0000-0000-000000000501';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION 'B quitó permisos de un rol de A'; END IF;
END $$;

SELECT seg_test.debe_fallar(
  $q$INSERT INTO seg.rol_permiso (rol_id, permiso_codigo)
     VALUES ('c0000000-0000-0000-0000-000000000501', 'rest.venta.anular')$q$,
  '42501', 'agregar permiso a rol de A');

-- Sin tenant en el contexto: solo lo predefinido.
SELECT set_config('app.tenant_id', '', false);
DO $$ BEGIN
  IF (SELECT count(*) FROM seg.membresia) + (SELECT count(*) FROM seg.asignacion)
     + (SELECT count(*) FROM seg.evento_seguridad) <> 0 THEN
    RAISE EXCEPTION 'sin tenant no debía verse nada';
  END IF;
  IF (SELECT count(*) FROM seg.rol) <> 1 THEN RAISE EXCEPTION 'sin tenant solo debía verse el rol predefinido'; END IF;
END $$;

RESET ROLE;
DROP SCHEMA seg_test CASCADE;

-- anon y authenticated no tienen acceso (solo si existen: PostgreSQL plano no los trae).
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    IF has_schema_privilege('anon', 'seg', 'USAGE') OR has_schema_privilege('authenticated', 'seg', 'USAGE') THEN
      RAISE EXCEPTION 'anon/authenticated no deben tener USAGE sobre seg';
    END IF;
    IF has_table_privilege('anon', 'seg.usuario', 'SELECT') OR has_table_privilege('authenticated', 'seg.membresia', 'INSERT') THEN
      RAISE EXCEPTION 'anon/authenticated no deben tener privilegios sobre seg';
    END IF;
  END IF;
END $$;

-- Las funciones de permisos son del spec 07.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
              WHERE n.nspname = 'seg' AND p.proname IN ('permisos_efectivos', 'menu_usuario', 'sucursales_accesibles')) THEN
    RAISE EXCEPTION 'seg no debe definir las funciones de permisos';
  END IF;
END $$;
