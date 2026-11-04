-- Prueba de 01b_seg_soporte. La ejecuta tools/migrar/test/db-esquemas.test.mjs después de
-- 01b_seg_membresias.test.sql, sobre la misma base. Siembra como superusuario y evalúa con
-- seg_test_app (sin BYPASSRLS).

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'seg_test_app') THEN
    CREATE ROLE seg_test_app NOLOGIN;
  END IF;
END $$;
GRANT USAGE ON SCHEMA seg, org TO seg_test_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA seg TO seg_test_app;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA seg TO seg_test_app;
GRANT SELECT ON ALL TABLES IN SCHEMA org TO seg_test_app;
GRANT EXECUTE ON FUNCTION seg.accesos_soporte_de_agente(uuid), seg.accesos_soporte_por_vencer(timestamptz) TO seg_test_app;

CREATE SCHEMA seg_sop_test;
CREATE FUNCTION seg_sop_test.debe_fallar(sentencia text, esperado text, caso text) RETURNS void
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
GRANT USAGE ON SCHEMA seg_sop_test TO seg_test_app;

-- ---------------------------------------------------------------------
-- Siembra (superusuario). Tenant operador O con el agente; clientes E y F.
-- ---------------------------------------------------------------------
INSERT INTO org.tenant (id, codigo, nombre, estado, version) VALUES
  ('0e000000-0000-0000-0000-000000000001', 'sop-operador', 'Sop operador', 'ACTIVO', 1),
  ('e1000000-0000-0000-0000-000000000001', 'sop-tenant-e', 'Sop tenant E', 'ACTIVO', 1),
  ('f1000000-0000-0000-0000-000000000001', 'sop-tenant-f', 'Sop tenant F', 'ACTIVO', 1);

INSERT INTO seg.usuario (id, email, nombre, tipo, estado) VALUES
  ('0e000000-0000-0000-0000-000000000901', 'javier.sop@vitrina.pe', 'Javier', 'SOPORTE', 'ACTIVO'),
  ('e1000000-0000-0000-0000-000000000901', 'elena.sop@gmail.com', 'Elena', 'INTERNO', 'ACTIVO');

INSERT INTO seg.membresia (id, usuario_id, tenant_id, estado, desde, hasta) VALUES
  ('0e000000-0000-0000-0000-000000000f01', '0e000000-0000-0000-0000-000000000901', '0e000000-0000-0000-0000-000000000001', 'ACTIVO', now() - interval '30 days', NULL),
  ('e1000000-0000-0000-0000-000000000f01', 'e1000000-0000-0000-0000-000000000901', 'e1000000-0000-0000-0000-000000000001', 'ACTIVO', now() - interval '30 days', NULL),
  ('e1000000-0000-0000-0000-000000000f02', '0e000000-0000-0000-0000-000000000901', 'e1000000-0000-0000-0000-000000000001', 'ACTIVO',
   now() - interval '3 hours', now() - interval '1 hour');

-- E: un aprobado ya vencido (2 h desde hace 3 h). F: un pendiente caducado.
INSERT INTO seg.acceso_soporte (id, tenant_id, agente_id, ticket, motivo, modo, horas_solicitadas, estado,
                                solicitado_en, caduca_en, aprobado_por, horas_aprobadas, desde, hasta, membresia_id) VALUES
  ('e1000000-0000-0000-0000-00000000a001', 'e1000000-0000-0000-0000-000000000001', '0e000000-0000-0000-0000-000000000901',
   'SOP-000245', 'Revisar series de boletas', 'LECTURA', 2, 'APROBADO',
   now() - interval '4 hours', now() + interval '20 hours', 'e1000000-0000-0000-0000-000000000901', 2,
   now() - interval '3 hours', now() - interval '1 hour', 'e1000000-0000-0000-0000-000000000f02');
INSERT INTO seg.acceso_soporte (id, tenant_id, agente_id, ticket, motivo, modo, horas_solicitadas, estado,
                                solicitado_en, caduca_en) VALUES
  ('f1000000-0000-0000-0000-00000000a001', 'f1000000-0000-0000-0000-000000000001', '0e000000-0000-0000-0000-000000000901',
   'SOP-000300', 'Error al emitir factura', 'ESCRITURA', 1, 'PENDIENTE',
   now() - interval '25 hours', now() - interval '1 hour');

-- 100 000 eventos en E para el plan de la bitácora.
INSERT INTO seg.evento_seguridad (tenant_id, usuario_id, tipo, detalle, ocurrido_en)
SELECT 'e1000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000901',
       (ARRAY['ACCESO_DENEGADO', 'ASIGNACION_OTORGADA', 'ACCESO_SOPORTE'])[1 + n % 3],
       jsonb_build_object('permiso', 'plat.rol.gestionar'), now() - make_interval(mins => n)
  FROM generate_series(1, 100000) AS n;
ANALYZE seg.evento_seguridad;

-- Plan (superusuario, filtro explícito): la página más reciente sale de un índice, no de un barrido.
CREATE FUNCTION seg_sop_test.plan(consulta text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE
  linea text;
  plan text := '';
BEGIN
  FOR linea IN EXECUTE 'EXPLAIN (FORMAT TEXT) ' || consulta LOOP
    plan := plan || linea || chr(10);
  END LOOP;
  RETURN plan;
END
$$;
DO $$
DECLARE
  plan text;
BEGIN
  plan := seg_sop_test.plan($q$
    SELECT id FROM seg.evento_seguridad
     WHERE tenant_id = 'e1000000-0000-0000-0000-000000000001'
       AND ocurrido_en >= now() - interval '7 days' AND ocurrido_en < now()
     ORDER BY ocurrido_en DESC, id DESC LIMIT 20$q$);
  IF plan NOT LIKE '%ix_evento_seguridad_fecha%' THEN
    RAISE EXCEPTION 'la lista de la bitácora no usa ix_evento_seguridad_fecha: %', plan;
  END IF;
  plan := seg_sop_test.plan($q$
    SELECT id FROM seg.evento_seguridad
     WHERE tenant_id = 'e1000000-0000-0000-0000-000000000001' AND tipo = 'ACCESO_DENEGADO'
       AND ocurrido_en >= now() - interval '7 days' AND ocurrido_en < now()
     ORDER BY ocurrido_en DESC, id DESC LIMIT 20$q$);
  IF plan LIKE '%Seq Scan%' THEN
    RAISE EXCEPTION 'el filtro por tipo no debía barrer la tabla: %', plan;
  END IF;
END $$;

-- Funciones entre tenants, sin tenant en contexto.
DO $$ BEGIN
  IF (SELECT count(*) FROM seg.accesos_soporte_de_agente('0e000000-0000-0000-0000-000000000901')) <> 2 THEN
    RAISE EXCEPTION 'el agente debía ver sus dos accesos';
  END IF;
  IF (SELECT tenant_nombre FROM seg.accesos_soporte_de_agente('0e000000-0000-0000-0000-000000000901')
       WHERE ticket = 'SOP-000245') <> 'Sop tenant E' THEN
    RAISE EXCEPTION 'faltó el nombre del tenant';
  END IF;
  IF (SELECT count(*) FROM seg.accesos_soporte_por_vencer(now())) <> 2 THEN
    RAISE EXCEPTION 'debían vencer el aprobado de E y el pendiente de F';
  END IF;
  IF (SELECT count(*) FROM seg.accesos_soporte_por_vencer(now() - interval '2 hours')) <> 0 THEN
    RAISE EXCEPTION 'hace 2 h no había nada por vencer';
  END IF;
END $$;

SET ROLE seg_test_app;

-- Las funciones corren como org_lector: la RLS del llamador no las limita.
SELECT set_config('app.tenant_id', 'f1000000-0000-0000-0000-000000000001', false);
DO $$ BEGIN
  IF (SELECT count(*) FROM seg.accesos_soporte_de_agente('0e000000-0000-0000-0000-000000000901')) <> 2 THEN
    RAISE EXCEPTION 'la función no debía depender del tenant del contexto';
  END IF;
END $$;

-- RLS: F solo ve su acceso y ningún evento de E.
DO $$ BEGIN
  IF (SELECT count(*) FROM seg.acceso_soporte) <> 1 THEN RAISE EXCEPTION 'F debía ver solo su acceso'; END IF;
  IF EXISTS (SELECT 1 FROM seg.evento_seguridad) THEN RAISE EXCEPTION 'F vio eventos de E'; END IF;
END $$;
SELECT seg_sop_test.debe_fallar(
  $q$INSERT INTO seg.acceso_soporte (id, tenant_id, agente_id, ticket, motivo, modo, horas_solicitadas, estado, solicitado_en, caduca_en)
     VALUES ('f1000000-0000-0000-0000-00000000a0ff', 'e1000000-0000-0000-0000-000000000001', '0e000000-0000-0000-0000-000000000901',
             'SOP-000999', 'Intento cruzado', 'LECTURA', 1, 'PENDIENTE', now(), now() + interval '24 hours')$q$,
  '42501', 'insertar en otro tenant');

-- Catálogo de tipos de la bitácora.
SELECT seg_sop_test.debe_fallar(
  $q$INSERT INTO seg.evento_seguridad (tenant_id, tipo) VALUES ('f1000000-0000-0000-0000-000000000001', 'OTRO')$q$,
  '23514', 'tipo fuera del catálogo');
INSERT INTO seg.evento_seguridad (tenant_id, usuario_id, tipo, detalle)
VALUES ('f1000000-0000-0000-0000-000000000001', '0e000000-0000-0000-0000-000000000901', 'ACCESO_SOPORTE', '{"accion": "SOLICITADO"}');

-- Una sola solicitud abierta por agente y tenant.
SELECT seg_sop_test.debe_fallar(
  $q$INSERT INTO seg.acceso_soporte (id, tenant_id, agente_id, ticket, motivo, modo, horas_solicitadas, estado, solicitado_en, caduca_en)
     VALUES ('f1000000-0000-0000-0000-00000000a002', 'f1000000-0000-0000-0000-000000000001', '0e000000-0000-0000-0000-000000000901',
             'SOP-000301', 'Otra solicitud abierta', 'LECTURA', 1, 'PENDIENTE', now(), now() + interval '24 hours')$q$,
  '23505', 'segunda solicitud abierta');

-- Formatos y límites.
SELECT seg_sop_test.debe_fallar(
  $q$UPDATE seg.acceso_soporte SET ticket = 'SOP-12' WHERE id = 'f1000000-0000-0000-0000-00000000a001'$q$, '23514', 'ticket');
SELECT seg_sop_test.debe_fallar(
  $q$UPDATE seg.acceso_soporte SET motivo = 'Corto' WHERE id = 'f1000000-0000-0000-0000-00000000a001'$q$, '23514', 'motivo');
SELECT seg_sop_test.debe_fallar(
  $q$UPDATE seg.acceso_soporte SET horas_solicitadas = 5 WHERE id = 'f1000000-0000-0000-0000-00000000a001'$q$, '23514', 'horas 5');

-- Aprobar exige la membresía y hasta = desde + horas; más de 4 h no entra.
SELECT seg_sop_test.debe_fallar(
  $q$UPDATE seg.acceso_soporte SET estado = 'APROBADO', aprobado_por = '0e000000-0000-0000-0000-000000000901',
         horas_aprobadas = 1, desde = now(), hasta = now() + interval '1 hour'
      WHERE id = 'f1000000-0000-0000-0000-00000000a001'$q$, '23514', 'aprobado sin membresía');

-- Cerrar exige cerrado_en; pasar a EXPIRADO un pendiente queda sin datos de aprobación.
SELECT seg_sop_test.debe_fallar(
  $q$UPDATE seg.acceso_soporte SET estado = 'EXPIRADO' WHERE id = 'f1000000-0000-0000-0000-00000000a001'$q$, '23514', 'cierre sin fecha');
UPDATE seg.acceso_soporte SET estado = 'EXPIRADO', cerrado_en = now(), causa_cierre = 'VENCIMIENTO'
 WHERE id = 'f1000000-0000-0000-0000-00000000a001';

-- Cerrado el anterior, el agente puede volver a solicitar.
INSERT INTO seg.acceso_soporte (id, tenant_id, agente_id, ticket, motivo, modo, horas_solicitadas, estado, solicitado_en, caduca_en)
VALUES ('f1000000-0000-0000-0000-00000000a003', 'f1000000-0000-0000-0000-000000000001', '0e000000-0000-0000-0000-000000000901',
        'SOP-000302', 'Nueva solicitud tras caducar', 'LECTURA', 3, 'PENDIENTE', now(), now() + interval '24 hours');

SELECT seg_sop_test.debe_fallar($q$DELETE FROM seg.acceso_soporte$q$, '42501', 'DELETE acceso');

-- E: vencer el aprobado deja los datos de la aprobación.
SELECT set_config('app.tenant_id', 'e1000000-0000-0000-0000-000000000001', false);
SELECT seg_sop_test.debe_fallar(
  $q$UPDATE seg.acceso_soporte SET horas_aprobadas = 5, hasta = desde + interval '5 hours'
      WHERE id = 'e1000000-0000-0000-0000-00000000a001'$q$, '23514', 'aprobado por 5 h');
SELECT seg_sop_test.debe_fallar(
  $q$UPDATE seg.acceso_soporte SET hasta = desde + interval '3 hours'
      WHERE id = 'e1000000-0000-0000-0000-00000000a001'$q$, '23514', 'hasta distinto de desde + horas');
UPDATE seg.acceso_soporte SET estado = 'EXPIRADO', cerrado_en = now(), causa_cierre = 'VENCIMIENTO'
 WHERE id = 'e1000000-0000-0000-0000-00000000a001';
DO $$ BEGIN
  IF (SELECT count(*) FROM seg.evento_seguridad) <> 100000 THEN RAISE EXCEPTION 'E debía ver sus 100 000 eventos'; END IF;
END $$;

RESET ROLE;
SELECT set_config('app.tenant_id', '', false);
DROP SCHEMA seg_sop_test CASCADE;
