-- Prueba de 01b_seg_tipos_ingreso. La ejecuta tools/migrar/test/db-esquemas.test.mjs después de
-- 01b_seg_soporte.test.sql, sobre la misma base. Siembra como superusuario y evalúa con seg_test_app
-- (sin BYPASSRLS). Todo va en una transacción que se revierte: con filas LOGIN_FALLIDO o EXPORTACION
-- el inverso de la migración no corre, y la prueba de ida y vuelta lo ejecuta después.

BEGIN;

GRANT EXECUTE ON FUNCTION seg.usuario_para_ingreso(text),
                          seg.registrar_evento_ingreso(varchar, uuid, uuid, jsonb, inet) TO seg_test_app;

CREATE SCHEMA seg_ing_test;
CREATE FUNCTION seg_ing_test.debe_fallar(sentencia text, esperado text, caso text) RETURNS void
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
GRANT USAGE ON SCHEMA seg_ing_test TO seg_test_app;

-- ---------------------------------------------------------------------
-- Siembra (superusuario). Tenants G y H.
--   Gabriela: miembro de G (antigua) y de H (reciente), prefiere G.
--   Hugo: miembro de G (antigua) y de H (reciente), sin preferido.
--   Fermín: solo una membresía FINALIZADO en G.
--   Bruno: usuario BLOQUEADO con membresía activa en G.
-- ---------------------------------------------------------------------
INSERT INTO org.tenant (id, codigo, nombre, estado, version) VALUES
  ('a7000000-0000-0000-0000-000000000001', 'ing-tenant-g', 'Ing tenant G', 'ACTIVO', 1),
  ('a8000000-0000-0000-0000-000000000001', 'ing-tenant-h', 'Ing tenant H', 'ACTIVO', 1);

INSERT INTO seg.usuario (id, email, nombre, tipo, estado, tenant_preferido) VALUES
  ('a7000000-0000-0000-0000-000000000901', 'gabriela.ing@gmail.com', 'Gabriela', 'INTERNO', 'ACTIVO', 'a7000000-0000-0000-0000-000000000001'),
  ('a7000000-0000-0000-0000-000000000902', 'hugo.ing@gmail.com', 'Hugo', 'INTERNO', 'ACTIVO', NULL),
  ('a7000000-0000-0000-0000-000000000903', 'fermin.ing@gmail.com', 'Fermín', 'INTERNO', 'ACTIVO', NULL),
  ('a7000000-0000-0000-0000-000000000904', 'bruno.ing@gmail.com', 'Bruno', 'INTERNO', 'BLOQUEADO', NULL);

INSERT INTO seg.membresia (id, usuario_id, tenant_id, estado, desde, hasta) VALUES
  ('a7000000-0000-0000-0000-000000000f01', 'a7000000-0000-0000-0000-000000000901', 'a7000000-0000-0000-0000-000000000001', 'ACTIVO', now() - interval '60 days', NULL),
  ('a8000000-0000-0000-0000-000000000f01', 'a7000000-0000-0000-0000-000000000901', 'a8000000-0000-0000-0000-000000000001', 'ACTIVO', now() - interval '1 day', NULL),
  ('a7000000-0000-0000-0000-000000000f02', 'a7000000-0000-0000-0000-000000000902', 'a7000000-0000-0000-0000-000000000001', 'ACTIVO', now() - interval '60 days', NULL),
  ('a8000000-0000-0000-0000-000000000f02', 'a7000000-0000-0000-0000-000000000902', 'a8000000-0000-0000-0000-000000000001', 'ACTIVO', now() - interval '1 day', NULL),
  ('a7000000-0000-0000-0000-000000000f03', 'a7000000-0000-0000-0000-000000000903', 'a7000000-0000-0000-0000-000000000001', 'FINALIZADO', now() - interval '60 days', now() - interval '1 day'),
  ('a7000000-0000-0000-0000-000000000f04', 'a7000000-0000-0000-0000-000000000904', 'a7000000-0000-0000-0000-000000000001', 'ACTIVO', now() - interval '60 days', NULL);

SET ROLE seg_test_app;
SELECT set_config('app.tenant_id', 'a8000000-0000-0000-0000-000000000001', true);

-- ---------------------------------------------------------------------
-- usuario_para_ingreso: corre como org_lector, sin depender del tenant del contexto.
-- ---------------------------------------------------------------------
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM seg.usuario_para_ingreso('nadie.ing@gmail.com')) THEN
    RAISE EXCEPTION 'un correo inexistente no debía devolver fila';
  END IF;
  IF (SELECT tenant_id FROM seg.usuario_para_ingreso('gabriela.ing@gmail.com')) <> 'a7000000-0000-0000-0000-000000000001' THEN
    RAISE EXCEPTION 'con dos membresías debía ganar el tenant preferido (G)';
  END IF;
  IF (SELECT tenant_id FROM seg.usuario_para_ingreso('hugo.ing@gmail.com')) <> 'a8000000-0000-0000-0000-000000000001' THEN
    RAISE EXCEPTION 'sin preferido debía ganar la membresía más reciente (H)';
  END IF;
  IF (SELECT usuario_id FROM seg.usuario_para_ingreso('  Hugo.ING@gmail.com ')) <> 'a7000000-0000-0000-0000-000000000902' THEN
    RAISE EXCEPTION 'el correo se debía normalizar (espacios y mayúsculas)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM seg.usuario_para_ingreso('fermin.ing@gmail.com')
                  WHERE usuario_id = 'a7000000-0000-0000-0000-000000000903' AND tenant_id IS NULL) THEN
    RAISE EXCEPTION 'con solo una membresía FINALIZADO debía volver el usuario sin tenant';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM seg.usuario_para_ingreso('bruno.ing@gmail.com')
                  WHERE usuario_id = 'a7000000-0000-0000-0000-000000000904' AND tenant_id IS NULL) THEN
    RAISE EXCEPTION 'un usuario bloqueado debía volver sin tenant, como en el hook';
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- registrar_evento_ingreso: escribe sin tenant y en un tenant distinto del contexto; solo tipos de ingreso.
-- ---------------------------------------------------------------------
SELECT seg.registrar_evento_ingreso('LOGIN_FALLIDO', NULL, NULL,
  '{"etapa": "CLAVE", "motivo": "CREDENCIALES", "correo": "na****@gmail.com"}', '203.0.113.7');
SELECT seg.registrar_evento_ingreso('LOGIN_FALLIDO', 'a7000000-0000-0000-0000-000000000001', 'a7000000-0000-0000-0000-000000000902',
  '{"etapa": "CLAVE", "motivo": "CREDENCIALES"}', '203.0.113.7');
SELECT seg.registrar_evento_ingreso('LOGIN', 'a8000000-0000-0000-0000-000000000001', 'a7000000-0000-0000-0000-000000000901',
  '{"sesion_id": "s-1", "metodo": "password", "aal": "aal1"}', NULL);
SELECT seg_ing_test.debe_fallar(
  $q$SELECT seg.registrar_evento_ingreso('EXPORTACION', 'a8000000-0000-0000-0000-000000000001', NULL, '{}', NULL)$q$,
  '22023', 'tipo no permitido en la función');
SELECT seg_ing_test.debe_fallar(
  $q$SELECT seg.registrar_evento_ingreso(NULL, NULL, NULL, '{}', NULL)$q$, '22023', 'tipo NULL');

-- El rol de la aplicación no escribe filas sin tenant por su cuenta.
SELECT seg_ing_test.debe_fallar(
  $q$INSERT INTO seg.evento_seguridad (tenant_id, tipo) VALUES (NULL, 'LOGIN_FALLIDO')$q$, '42501', 'insertar sin tenant');

-- ---------------------------------------------------------------------
-- Catálogo de tipos, con el tenant del contexto (H).
-- ---------------------------------------------------------------------
INSERT INTO seg.evento_seguridad (tenant_id, usuario_id, tipo, detalle)
VALUES ('a8000000-0000-0000-0000-000000000001', 'a7000000-0000-0000-0000-000000000901', 'EXPORTACION',
        '{"recurso": "bitacora", "filas": 3}'),
       ('a8000000-0000-0000-0000-000000000001', 'a7000000-0000-0000-0000-000000000901', 'LOGIN_FALLIDO',
        '{"etapa": "MFA", "motivo": "CODIGO_MFA", "factor": "totp"}');
SELECT seg_ing_test.debe_fallar(
  $q$INSERT INTO seg.evento_seguridad (tenant_id, tipo) VALUES ('a8000000-0000-0000-0000-000000000001', 'OTRO')$q$,
  '23514', 'tipo fuera del catálogo');

-- ---------------------------------------------------------------------
-- RLS: cada tenant ve solo lo suyo; la fila sin tenant no la ve ninguno.
-- ---------------------------------------------------------------------
DO $$ BEGIN
  IF (SELECT count(*) FROM seg.evento_seguridad WHERE tenant_id IS NULL) <> 0 THEN
    RAISE EXCEPTION 'H vio la fila sin tenant';
  END IF;
  IF (SELECT count(*) FROM seg.evento_seguridad WHERE tipo IN ('LOGIN', 'LOGIN_FALLIDO', 'EXPORTACION')) <> 3 THEN
    RAISE EXCEPTION 'H debía ver su LOGIN, su LOGIN_FALLIDO de MFA y su EXPORTACION';
  END IF;
END $$;

SELECT set_config('app.tenant_id', 'a7000000-0000-0000-0000-000000000001', true);
DO $$ BEGIN
  IF (SELECT count(*) FROM seg.evento_seguridad WHERE tipo = 'LOGIN_FALLIDO') <> 1 THEN
    RAISE EXCEPTION 'G debía ver solo el fallo de Hugo';
  END IF;
  IF EXISTS (SELECT 1 FROM seg.evento_seguridad WHERE tenant_id IS NULL) THEN
    RAISE EXCEPTION 'G vio la fila sin tenant';
  END IF;
END $$;

SELECT set_config('app.tenant_id', '', true);
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM seg.evento_seguridad) THEN
    RAISE EXCEPTION 'sin tenant en el contexto no se debía ver ningún evento';
  END IF;
END $$;

RESET ROLE;

-- Superusuario: la fila sin tenant existe con el correo enmascarado y la IP.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM seg.evento_seguridad
                  WHERE tenant_id IS NULL AND usuario_id IS NULL AND tipo = 'LOGIN_FALLIDO'
                    AND detalle ->> 'correo' = 'na****@gmail.com' AND ip = '203.0.113.7') THEN
    RAISE EXCEPTION 'faltó la fila sin tenant';
  END IF;
END $$;

ROLLBACK;
