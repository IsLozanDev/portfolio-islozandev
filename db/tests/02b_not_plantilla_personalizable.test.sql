-- Prueba de 02b_not_plantilla_personalizable (spec 47). La ejecuta tools/migrar/test/db-esquemas.test.mjs sobre una
-- base temporal con db/ aplicado. Corre como superusuario y evalúa con not_personalizable_test_app, sin BYPASSRLS y con
-- los mismos privilegios que la aplicación. Todo en una transacción que se revierte. La desactivación de una
-- personalización previa de INTEGRIDAD_ROTA se prueba en el .mjs, que revierte y reaplica la migración.

BEGIN;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'not_personalizable_test_app') THEN
    CREATE ROLE not_personalizable_test_app NOLOGIN;
  END IF;
END $$;
GRANT USAGE ON SCHEMA ntf TO not_personalizable_test_app;
GRANT SELECT, INSERT, UPDATE ON ntf.plantilla TO not_personalizable_test_app;

CREATE SCHEMA not_personalizable_test;
CREATE FUNCTION not_personalizable_test.debe_fallar(sentencia text, esperado text, caso text) RETURNS void
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
GRANT USAGE ON SCHEMA not_personalizable_test TO not_personalizable_test_app;

-- ---------------------------------------------------------------------
-- Bases: INTEGRIDAD_ROTA no es personalizable; las otras cuatro sí. Cada una con su nombre.
-- ---------------------------------------------------------------------
DO $$ BEGIN
  IF (SELECT array_agg(codigo ORDER BY codigo) FROM ntf.plantilla WHERE tenant_id IS NULL AND NOT personalizable)
     <> ARRAY['INTEGRIDAD_ROTA']::varchar[] THEN
    RAISE EXCEPTION 'solo INTEGRIDAD_ROTA debía quedar no personalizable';
  END IF;
  IF (SELECT count(*) FROM ntf.plantilla WHERE tenant_id IS NULL AND personalizable) <> 4 THEN
    RAISE EXCEPTION 'las otras cuatro bases debían quedar personalizables';
  END IF;
  IF (SELECT nombre FROM ntf.plantilla WHERE tenant_id IS NULL AND codigo = 'SUSCRIPCION_POR_VENCER')
     <> 'Aviso de suscripción por vencer' THEN
    RAISE EXCEPTION 'SUSCRIPCION_POR_VENCER debía tener su nombre';
  END IF;
  IF EXISTS (SELECT 1 FROM ntf.plantilla WHERE nombre IS NULL) THEN
    RAISE EXCEPTION 'toda plantilla debía tener nombre';
  END IF;
END $$;

SET ROLE not_personalizable_test_app;

-- ---------------------------------------------------------------------
-- Tenant A: una versión propia lleva nombre; sin él o con uno muy corto, falla.
-- ---------------------------------------------------------------------
SELECT set_config('app.tenant_id', '47000000-0000-0000-0000-00000000000a', false);

INSERT INTO ntf.plantilla (id, tenant_id, codigo, canal, version, asunto, cuerpo, plantilla_base_id, nombre)
VALUES ('47000000-0000-0000-0000-0000000000a1', '47000000-0000-0000-0000-00000000000a', 'PRUEBA_CORREO', 'CORREO', 1,
        'Prueba de A', '<p>Hola {{nombre}}</p>', '42000000-0000-0000-0000-000000000001', 'Correo de prueba');

DO $$ BEGIN
  IF NOT (SELECT personalizable FROM ntf.plantilla WHERE id = '47000000-0000-0000-0000-0000000000a1') THEN
    RAISE EXCEPTION 'una versión nueva debía quedar personalizable por defecto';
  END IF;
END $$;

SELECT not_personalizable_test.debe_fallar($$
  INSERT INTO ntf.plantilla (id, tenant_id, codigo, canal, version, asunto, cuerpo)
  VALUES (gen_random_uuid(), '47000000-0000-0000-0000-00000000000a', 'PRUEBA_CORREO', 'CORREO', 2, 'x', 'x')$$,
  '23502', 'versión sin nombre');
SELECT not_personalizable_test.debe_fallar($$
  INSERT INTO ntf.plantilla (id, tenant_id, codigo, canal, version, asunto, cuerpo, nombre)
  VALUES (gen_random_uuid(), '47000000-0000-0000-0000-00000000000a', 'PRUEBA_CORREO', 'CORREO', 2, 'x', 'x', 'ab')$$,
  '23514', 'nombre de menos de 3 caracteres');

RESET ROLE;

ROLLBACK;
