-- Prueba de 01b_seg_autorizacion. La ejecuta tools/migrar/test/db-esquemas.test.mjs después de
-- 01b_seg.test.sql, sobre la misma base. Siembra como superusuario y evalúa con seg_test_app
-- (sin BYPASSRLS), que es como corren las funciones en la aplicación.

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'seg_test_app') THEN
    CREATE ROLE seg_test_app NOLOGIN;
  END IF;
END $$;
GRANT USAGE ON SCHEMA seg, org TO seg_test_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA seg TO seg_test_app;
GRANT SELECT ON ALL TABLES IN SCHEMA org TO seg_test_app;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA seg TO seg_test_app;

CREATE SCHEMA seg_aut_test;
CREATE FUNCTION seg_aut_test.debe_fallar(sentencia text, esperado text, caso text) RETURNS void
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
CREATE FUNCTION seg_aut_test.pe(p_usuario uuid, p_tenant uuid, p_sucursal uuid, p_unidad uuid DEFAULT NULL)
RETURNS text[] LANGUAGE sql AS $$
  SELECT ARRAY(SELECT permiso_codigo::text FROM seg.permisos_efectivos(p_usuario, p_tenant, p_sucursal, p_unidad) ORDER BY 1);
$$;
CREATE FUNCTION seg_aut_test.esperar(obtenido text[], esperado text[], caso text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF obtenido IS DISTINCT FROM esperado THEN
    RAISE EXCEPTION '%: se esperaba % y llegó %', caso, esperado, obtenido;
  END IF;
END
$$;
-- Versión de seguridad del tenant A (0 si no tiene fila).
CREATE FUNCTION seg_aut_test.vt() RETURNS bigint LANGUAGE sql AS $$
  SELECT COALESCE((SELECT version FROM seg.version_seguridad
                    WHERE tenant_id = 'a1000000-0000-0000-0000-000000000001'), 0);
$$;
GRANT USAGE ON SCHEMA seg_aut_test TO seg_test_app;

-- ---------------------------------------------------------------------
-- Siembra (superusuario). Tenant A: empresa «Sabores del Sur SAC» con Cayma (S11, unidad CAJA-02)
-- y S12 (unidad CAJA-03); otra empresa con S21. Tenant B: una sucursal.
-- ---------------------------------------------------------------------
INSERT INTO org.tenant (id, codigo, nombre, estado, version) VALUES
  ('a1000000-0000-0000-0000-000000000001', 'aut-tenant-a', 'Aut tenant A', 'ACTIVO', 1),
  ('b1000000-0000-0000-0000-000000000002', 'aut-tenant-b', 'Aut tenant B', 'ACTIVO', 1);
INSERT INTO org.empresa (id, tenant_id, ruc, razon_social, version) VALUES
  ('a1000000-0000-0000-0000-000000000011', 'a1000000-0000-0000-0000-000000000001', '20100000001', 'Sabores del Sur SAC', 1),
  ('a1000000-0000-0000-0000-000000000012', 'a1000000-0000-0000-0000-000000000001', '20100000002', 'Otra Empresa SAC', 1),
  ('b1000000-0000-0000-0000-000000000011', 'b1000000-0000-0000-0000-000000000002', '20100000003', 'Empresa B SAC', 1);
INSERT INTO org.sucursal (id, tenant_id, empresa_id, codigo, nombre, codigo_establecimiento_sunat, es_principal, version) VALUES
  ('a1000000-0000-0000-0000-000000000101', 'a1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000011',
   'CAYMA', 'Cayma', '0000', true, 1),
  ('a1000000-0000-0000-0000-000000000102', 'a1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000011',
   'YANAH', 'Yanahuara', NULL, false, 1),
  ('a1000000-0000-0000-0000-000000000103', 'a1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000012',
   'CENTRO', 'Centro', '0000', true, 1),
  ('b1000000-0000-0000-0000-000000000101', 'b1000000-0000-0000-0000-000000000002', 'b1000000-0000-0000-0000-000000000011',
   'PRINCIPAL', 'Principal B', '0000', true, 1);
INSERT INTO org.unidad_operativa (id, tenant_id, empresa_id, sucursal_id, tipo, codigo, nombre, version) VALUES
  ('a1000000-0000-0000-0000-000000000201', 'a1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000011',
   'a1000000-0000-0000-0000-000000000101', 'CAJA', 'CAJA-02', 'Caja 02', 1),
  ('a1000000-0000-0000-0000-000000000202', 'a1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000011',
   'a1000000-0000-0000-0000-000000000102', 'CAJA', 'CAJA-03', 'Caja 03', 1);

INSERT INTO seg.producto (codigo, nombre) VALUES ('PLAT', 'Plataforma'), ('REST', 'Restaurantes'), ('GYM', 'Gimnasios')
  ON CONFLICT (codigo) DO NOTHING;
INSERT INTO seg.permiso (codigo, producto_codigo, descripcion, alcance_minimo, sensible, obsoleto) VALUES
  ('rest.caja.abrir', 'REST', 'Abrir caja', 'UNIDAD', false, false),
  ('rest.caja.cerrar', 'REST', 'Cerrar caja', 'UNIDAD', false, false),
  ('rest.retirado.ver', 'REST', 'Retirado por manifiesto', 'SUCURSAL', false, true),
  ('gym.acceso.registrar', 'GYM', 'Registrar acceso', 'SUCURSAL', false, false),
  ('plat.rol.gestionar', 'PLAT', 'Gestionar roles', 'TENANT', false, false);
INSERT INTO seg.modulo (id, producto_codigo, codigo, nombre) VALUES
  ('a1000000-0000-0000-0000-000000000a01', 'REST', 'caja-aut', 'Caja');
INSERT INTO seg.opcion (id, modulo_id, padre_id, codigo, nombre, ruta, icono, orden) VALUES
  ('a1000000-0000-0000-0000-000000000b01', 'a1000000-0000-0000-0000-000000000a01', NULL, 'rest.caja', 'Caja', NULL, 'point_of_sale', 1),
  ('a1000000-0000-0000-0000-000000000b02', 'a1000000-0000-0000-0000-000000000a01', 'a1000000-0000-0000-0000-000000000b01',
   'rest.caja.apertura', 'Apertura', '/caja/apertura', NULL, 1),
  ('a1000000-0000-0000-0000-000000000b03', 'a1000000-0000-0000-0000-000000000a01', 'a1000000-0000-0000-0000-000000000b01',
   'rest.caja.cierre', 'Cierre', '/caja/cierre', NULL, 2);
INSERT INTO seg.opcion_permiso (opcion_id, permiso_codigo) VALUES
  ('a1000000-0000-0000-0000-000000000b02', 'rest.caja.abrir'),
  ('a1000000-0000-0000-0000-000000000b03', 'rest.caja.cerrar');

-- A: REST activa y GYM vencida (TR-CA-042). B: REST activa.
INSERT INTO org.suscripcion (id, tenant_id, producto_codigo, plan, estado, version) VALUES
  ('a1000000-0000-0000-0000-000000000c01', 'a1000000-0000-0000-0000-000000000001', 'REST', 'PRO', 'ACTIVA', 1),
  ('a1000000-0000-0000-0000-000000000c02', 'a1000000-0000-0000-0000-000000000001', 'GYM', 'PRO', 'VENCIDA', 1),
  ('b1000000-0000-0000-0000-000000000c01', 'b1000000-0000-0000-0000-000000000002', 'REST', 'PRO', 'ACTIVA', 1);

INSERT INTO seg.usuario (id, email, nombre, tipo, estado) VALUES
  ('a1000000-0000-0000-0000-000000000901', 'maria.aut@gmail.com', 'María', 'EXTERNO', 'ACTIVO'),
  ('a1000000-0000-0000-0000-000000000902', 'luis.aut@gmail.com', 'Luis', 'EXTERNO', 'ACTIVO'),
  ('a1000000-0000-0000-0000-000000000903', 'jorge.aut@gmail.com', 'Jorge', 'EXTERNO', 'ACTIVO'),
  ('b1000000-0000-0000-0000-000000000901', 'beto.aut@gmail.com', 'Beto', 'EXTERNO', 'ACTIVO');

INSERT INTO seg.rol (id, tenant_id, producto_codigo, codigo, nombre, editable) VALUES
  ('a1000000-0000-0000-0000-000000000d01', 'a1000000-0000-0000-0000-000000000001', 'REST', 'SUPERVISOR_AUT', 'Supervisor', true),
  ('a1000000-0000-0000-0000-000000000d02', 'a1000000-0000-0000-0000-000000000001', 'REST', 'CAJERO_AUT', 'Cajero', true),
  ('a1000000-0000-0000-0000-000000000d03', 'a1000000-0000-0000-0000-000000000001', 'GYM', 'GYM_RECEP_AUT', 'Recepción', true),
  ('a1000000-0000-0000-0000-000000000d04', 'a1000000-0000-0000-0000-000000000001', 'PLAT', 'PLAT_ADMIN_AUT', 'Admin', true),
  ('a1000000-0000-0000-0000-000000000d09', NULL, 'REST', 'PRE_AUT', 'Predefinido', false);
INSERT INTO seg.rol_permiso (rol_id, permiso_codigo) VALUES
  ('a1000000-0000-0000-0000-000000000d01', 'rest.caja.abrir'),
  ('a1000000-0000-0000-0000-000000000d01', 'rest.retirado.ver'),
  ('a1000000-0000-0000-0000-000000000d02', 'rest.caja.cerrar'),
  ('a1000000-0000-0000-0000-000000000d03', 'gym.acceso.registrar'),
  ('a1000000-0000-0000-0000-000000000d04', 'plat.rol.gestionar'),
  ('a1000000-0000-0000-0000-000000000d09', 'rest.caja.abrir');
INSERT INTO seg.perfil (id, tenant_id, codigo, nombre) VALUES
  ('a1000000-0000-0000-0000-000000000e01', 'a1000000-0000-0000-0000-000000000001', 'ENCARGADO_AUT', 'Encargado');
INSERT INTO seg.perfil_rol (perfil_id, rol_id) VALUES
  ('a1000000-0000-0000-0000-000000000e01', 'a1000000-0000-0000-0000-000000000d02');

INSERT INTO seg.membresia (id, usuario_id, tenant_id, estado) VALUES
  ('a1000000-0000-0000-0000-000000000f01', 'a1000000-0000-0000-0000-000000000901', 'a1000000-0000-0000-0000-000000000001', 'ACTIVO'),
  ('a1000000-0000-0000-0000-000000000f02', 'a1000000-0000-0000-0000-000000000902', 'a1000000-0000-0000-0000-000000000001', 'ACTIVO'),
  ('a1000000-0000-0000-0000-000000000f03', 'a1000000-0000-0000-0000-000000000903', 'a1000000-0000-0000-0000-000000000001', 'INVITADO'),
  ('b1000000-0000-0000-0000-000000000f01', 'b1000000-0000-0000-0000-000000000901', 'b1000000-0000-0000-0000-000000000002', 'ACTIVO');

INSERT INTO seg.asignacion (id, tenant_id, membresia_id, rol_id, perfil_id, alcance, empresa_id, sucursal_id, unidad_id,
                            vigente_desde, vigente_hasta) VALUES
  -- María: Supervisor en la empresa (TR-CA-041), GYM y PLAT en el tenant, perfil en Yanahuara.
  ('a1000000-0000-0000-0000-000000001001', 'a1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000f01',
   'a1000000-0000-0000-0000-000000000d01', NULL, 'EMPRESA', 'a1000000-0000-0000-0000-000000000011', NULL, NULL, current_date, NULL),
  ('a1000000-0000-0000-0000-000000001002', 'a1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000f01',
   'a1000000-0000-0000-0000-000000000d03', NULL, 'TENANT', NULL, NULL, NULL, current_date, NULL),
  ('a1000000-0000-0000-0000-000000001003', 'a1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000f01',
   'a1000000-0000-0000-0000-000000000d04', NULL, 'TENANT', NULL, NULL, NULL, current_date, NULL),
  ('a1000000-0000-0000-0000-000000001004', 'a1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000f01',
   NULL, 'a1000000-0000-0000-0000-000000000e01', 'SUCURSAL', NULL, 'a1000000-0000-0000-0000-000000000102', NULL, current_date, NULL),
  -- Luis: Cajero en CAJA-02 que vence hoy (TR-CA-043) y uno vencido ayer en Yanahuara.
  ('a1000000-0000-0000-0000-000000001005', 'a1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000f02',
   'a1000000-0000-0000-0000-000000000d02', NULL, 'UNIDAD', NULL, NULL, 'a1000000-0000-0000-0000-000000000201', current_date, current_date),
  ('a1000000-0000-0000-0000-000000001006', 'a1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000f02',
   'a1000000-0000-0000-0000-000000000d02', NULL, 'SUCURSAL', NULL, 'a1000000-0000-0000-0000-000000000102', NULL,
   current_date - 10, current_date - 1),
  -- Jorge: invitado, todavía sin permisos.
  ('a1000000-0000-0000-0000-000000001007', 'a1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000f03',
   'a1000000-0000-0000-0000-000000000d01', NULL, 'TENANT', NULL, NULL, NULL, current_date, NULL),
  -- Beto (tenant B) con el rol predefinido.
  ('b1000000-0000-0000-0000-000000001001', 'b1000000-0000-0000-0000-000000000002', 'b1000000-0000-0000-0000-000000000f01',
   'a1000000-0000-0000-0000-000000000d09', NULL, 'TENANT', NULL, NULL, NULL, current_date, NULL);

SET ROLE seg_test_app;
SELECT set_config('app.tenant_id', 'a1000000-0000-0000-0000-000000000001', false);

-- ---------------------------------------------------------------------
-- Permisos efectivos (TR-RN-006, TR-RN-007)
-- ---------------------------------------------------------------------
-- TR-CA-041: EMPRESA cubre Cayma. GYM vencida no da gym.* (TR-CA-042). Lo obsoleto no cuenta. PLAT sin suscripción.
SELECT seg_aut_test.esperar(
  seg_aut_test.pe('a1000000-0000-0000-0000-000000000901', 'a1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000101'),
  ARRAY['plat.rol.gestionar', 'rest.caja.abrir'], 'María en Cayma');
-- El perfil en Yanahuara suma el rol Cajero.
SELECT seg_aut_test.esperar(
  seg_aut_test.pe('a1000000-0000-0000-0000-000000000901', 'a1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000102'),
  ARRAY['plat.rol.gestionar', 'rest.caja.abrir', 'rest.caja.cerrar'], 'María en Yanahuara (perfil)');
-- Otra empresa: solo lo de alcance TENANT.
SELECT seg_aut_test.esperar(
  seg_aut_test.pe('a1000000-0000-0000-0000-000000000901', 'a1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000103'),
  ARRAY['plat.rol.gestionar'], 'María en otra empresa');
-- TR-CA-043: vence hoy y sigue vigente, solo con la unidad.
SELECT seg_aut_test.esperar(
  seg_aut_test.pe('a1000000-0000-0000-0000-000000000902', 'a1000000-0000-0000-0000-000000000001',
                  'a1000000-0000-0000-0000-000000000101', 'a1000000-0000-0000-0000-000000000201'),
  ARRAY['rest.caja.cerrar'], 'Luis en CAJA-02 el último día');
SELECT seg_aut_test.esperar(
  seg_aut_test.pe('a1000000-0000-0000-0000-000000000902', 'a1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000101'),
  ARRAY[]::text[], 'Luis en Cayma sin unidad');
-- La unidad no pertenece a la sucursal pedida.
SELECT seg_aut_test.esperar(
  seg_aut_test.pe('a1000000-0000-0000-0000-000000000902', 'a1000000-0000-0000-0000-000000000001',
                  'a1000000-0000-0000-0000-000000000102', 'a1000000-0000-0000-0000-000000000201'),
  ARRAY[]::text[], 'Luis con CAJA-02 en otra sucursal');
SELECT seg_aut_test.esperar(
  seg_aut_test.pe('a1000000-0000-0000-0000-000000000902', 'a1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000102'),
  ARRAY[]::text[], 'Luis con asignación vencida ayer');
-- Membresía INVITADO no da permisos.
SELECT seg_aut_test.esperar(
  seg_aut_test.pe('a1000000-0000-0000-0000-000000000903', 'a1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000101'),
  ARRAY[]::text[], 'Jorge invitado');

-- ---------------------------------------------------------------------
-- Menú y sucursales accesibles
-- ---------------------------------------------------------------------
DO $$ BEGIN
  IF ARRAY(SELECT codigo::text FROM seg.menu_usuario('a1000000-0000-0000-0000-000000000901',
             'a1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000101') ORDER BY 1)
     IS DISTINCT FROM ARRAY['rest.caja', 'rest.caja.apertura'] THEN
    RAISE EXCEPTION 'menú de María en Cayma: debía traer la apertura y su carpeta';
  END IF;
  IF ARRAY(SELECT codigo::text FROM seg.sucursales_accesibles('a1000000-0000-0000-0000-000000000901',
             'a1000000-0000-0000-0000-000000000001') ORDER BY 1)
     IS DISTINCT FROM ARRAY['CAYMA', 'CENTRO', 'YANAH'] THEN
    RAISE EXCEPTION 'María debía acceder a las 3 sucursales (tiene alcance TENANT)';
  END IF;
  IF ARRAY(SELECT codigo::text FROM seg.sucursales_accesibles('a1000000-0000-0000-0000-000000000902',
             'a1000000-0000-0000-0000-000000000001') ORDER BY 1)
     IS DISTINCT FROM ARRAY['CAYMA'] THEN
    RAISE EXCEPTION 'Luis debía acceder solo a Cayma (por la unidad)';
  END IF;
  IF EXISTS (SELECT 1 FROM seg.sucursales_accesibles('a1000000-0000-0000-0000-000000000903', 'a1000000-0000-0000-0000-000000000001')) THEN
    RAISE EXCEPTION 'Jorge invitado no debía tener sucursales';
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- Aislamiento: p_tenant distinto de app.tenant_id no devuelve nada.
-- ---------------------------------------------------------------------
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM seg.permisos_efectivos('b1000000-0000-0000-0000-000000000901', 'b1000000-0000-0000-0000-000000000002',
                                                  'b1000000-0000-0000-0000-000000000101'))
     OR EXISTS (SELECT 1 FROM seg.menu_usuario('b1000000-0000-0000-0000-000000000901', 'b1000000-0000-0000-0000-000000000002',
                                               'b1000000-0000-0000-0000-000000000101'))
     OR EXISTS (SELECT 1 FROM seg.sucursales_accesibles('b1000000-0000-0000-0000-000000000901', 'b1000000-0000-0000-0000-000000000002'))
     OR EXISTS (SELECT 1 FROM seg.versiones_seguridad('b1000000-0000-0000-0000-000000000002')) THEN
    RAISE EXCEPTION 'desde A se leyeron datos de B';
  END IF;
  IF (SELECT count(*) FROM seg.versiones_seguridad('a1000000-0000-0000-0000-000000000001')) <> 1 THEN
    RAISE EXCEPTION 'versiones_seguridad de A debía devolver una fila';
  END IF;
  IF (SELECT count(*) FROM seg.version_seguridad) <> 1 THEN
    RAISE EXCEPTION 'A debía ver solo su versión de seguridad';
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- Triggers de versión (TR-RNF-101)
-- ---------------------------------------------------------------------
CREATE TEMP TABLE vt_previa (v bigint);
CREATE FUNCTION pg_temp.marcar() RETURNS void LANGUAGE sql AS $$
  DELETE FROM vt_previa; INSERT INTO vt_previa SELECT seg_aut_test.vt();
$$;
CREATE FUNCTION pg_temp.subio(n bigint, caso text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  previa bigint := (SELECT v FROM vt_previa);
BEGIN
  IF seg_aut_test.vt() - previa <> n THEN
    RAISE EXCEPTION '%: la versión debía subir % y subió %', caso, n, seg_aut_test.vt() - previa;
  END IF;
  PERFORM pg_temp.marcar();
END
$$;

SELECT pg_temp.marcar();
INSERT INTO seg.rol_permiso (rol_id, permiso_codigo) VALUES ('a1000000-0000-0000-0000-000000000d01', 'rest.caja.cerrar');
SELECT pg_temp.subio(1, 'alta en rol_permiso');
DELETE FROM seg.rol_permiso WHERE rol_id = 'a1000000-0000-0000-0000-000000000d01' AND permiso_codigo = 'rest.caja.cerrar';
SELECT pg_temp.subio(1, 'baja en rol_permiso');

UPDATE seg.rol SET nombre = 'Supervisor general' WHERE id = 'a1000000-0000-0000-0000-000000000d01';
SELECT pg_temp.subio(0, 'cambio de nombre del rol');
UPDATE seg.rol SET activo = false WHERE id = 'a1000000-0000-0000-0000-000000000d01';
SELECT pg_temp.subio(1, 'rol inactivado');
SELECT seg_aut_test.esperar(
  seg_aut_test.pe('a1000000-0000-0000-0000-000000000901', 'a1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000101'),
  ARRAY['plat.rol.gestionar'], 'rol inactivo no da permisos');
UPDATE seg.rol SET activo = true WHERE id = 'a1000000-0000-0000-0000-000000000d01';
SELECT pg_temp.subio(1, 'rol reactivado');
UPDATE seg.rol SET obsoleto = true WHERE id = 'a1000000-0000-0000-0000-000000000d01';
SELECT pg_temp.subio(1, 'rol obsoleto');
SELECT seg_aut_test.esperar(
  seg_aut_test.pe('a1000000-0000-0000-0000-000000000901', 'a1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000101'),
  ARRAY['plat.rol.gestionar'], 'rol obsoleto no da permisos');
UPDATE seg.rol SET obsoleto = false WHERE id = 'a1000000-0000-0000-0000-000000000d01';
SELECT pg_temp.subio(1, 'rol vigente otra vez');

INSERT INTO seg.perfil_rol (perfil_id, rol_id) VALUES ('a1000000-0000-0000-0000-000000000e01', 'a1000000-0000-0000-0000-000000000d01');
SELECT pg_temp.subio(1, 'alta en perfil_rol');

UPDATE seg.asignacion SET vigente_hasta = current_date + 30 WHERE id = 'a1000000-0000-0000-0000-000000001006';
SELECT pg_temp.subio(1, 'cambio de asignación');

UPDATE seg.membresia SET ultima_sucursal_id = 'a1000000-0000-0000-0000-000000000101' WHERE id = 'a1000000-0000-0000-0000-000000000f01';
SELECT pg_temp.subio(0, 'última sucursal');
UPDATE seg.membresia SET estado = 'SUSPENDIDO' WHERE id = 'a1000000-0000-0000-0000-000000000f02';
SELECT pg_temp.subio(1, 'membresía suspendida');
SELECT seg_aut_test.esperar(
  seg_aut_test.pe('a1000000-0000-0000-0000-000000000902', 'a1000000-0000-0000-0000-000000000001',
                  'a1000000-0000-0000-0000-000000000101', 'a1000000-0000-0000-0000-000000000201'),
  ARRAY[]::text[], 'membresía suspendida no da permisos');
UPDATE seg.membresia SET estado = 'ACTIVO' WHERE id = 'a1000000-0000-0000-0000-000000000f02';
SELECT pg_temp.subio(1, 'membresía reactivada');

SELECT seg_aut_test.debe_fallar(
  $q$UPDATE seg.membresia SET ultima_sucursal_id = 'b1000000-0000-0000-0000-000000000101'
      WHERE id = 'a1000000-0000-0000-0000-000000000f01'$q$,
  '23503', 'última sucursal de otro tenant');
SELECT seg_aut_test.debe_fallar(
  $q$INSERT INTO seg.version_seguridad (tenant_id) VALUES ('a1000000-0000-0000-0000-000000000001')$q$,
  '42501', 'escribir la versión a mano');

-- ---------------------------------------------------------------------
-- Como superusuario: suscripción, rol predefinido y versión de catálogo.
-- ---------------------------------------------------------------------
RESET ROLE;

UPDATE org.suscripcion SET estado = 'ACTIVA' WHERE id = 'a1000000-0000-0000-0000-000000000c02';
SELECT pg_temp.subio(1, 'suscripción GYM reactivada');
SELECT seg_aut_test.esperar(
  seg_aut_test.pe('a1000000-0000-0000-0000-000000000901', 'a1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000101'),
  ARRAY['gym.acceso.registrar', 'plat.rol.gestionar', 'rest.caja.abrir'], 'GYM activa da gym.*');
UPDATE org.suscripcion SET estado = 'VENCIDA' WHERE id = 'a1000000-0000-0000-0000-000000000c02';
SELECT pg_temp.subio(1, 'suscripción GYM vencida');
UPDATE org.suscripcion SET limite_usuarios = 10 WHERE id = 'a1000000-0000-0000-0000-000000000c02';
SELECT pg_temp.subio(0, 'cambio de límite de la suscripción');

INSERT INTO seg.rol_permiso (rol_id, permiso_codigo) VALUES ('a1000000-0000-0000-0000-000000000d09', 'rest.caja.cerrar');
SELECT pg_temp.subio(0, 'rol predefinido (lo cubre la versión de catálogo)');

DO $$
DECLARE
  previa bigint;
BEGIN
  PERFORM set_config('app.tenant_id', 'a1000000-0000-0000-0000-000000000001', true);
  previa := (SELECT vc FROM seg.versiones_seguridad('a1000000-0000-0000-0000-000000000001'));
  INSERT INTO seg.manifiesto_aplicado (producto_codigo, version, hash, cambios)
    VALUES ('REST', '9.9.9', repeat('0', 64), '{}');
  IF (SELECT vc FROM seg.versiones_seguridad('a1000000-0000-0000-0000-000000000001')) <= previa THEN
    RAISE EXCEPTION 'un manifiesto aplicado debía subir la versión de catálogo';
  END IF;
END $$;
SELECT seg_aut_test.debe_fallar(
  $q$INSERT INTO seg.manifiesto_aplicado (producto_codigo, version, hash, cambios)
     VALUES ('REST', '9.9.9', repeat('1', 64), '{}')$q$,
  '23505', 'misma versión de manifiesto dos veces');

DROP SCHEMA seg_aut_test CASCADE;
