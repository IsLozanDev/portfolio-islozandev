-- Prueba de 01m_arc_categoria_fk (hallazgo del spec 36). La ejecuta tools/migrar/test/db-esquemas.test.mjs sobre
-- una base temporal con db/ aplicado. En CI migra un superusuario, que no necesita privilegios para la FK; aquí
-- arc.categoria pasa a un dueño sin superusuario, como en Supabase, y hereda los privilegios que dejó la migración.
-- Todo en una transacción que se revierte.

BEGIN;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'arc_fk_test_dueno') THEN
    CREATE ROLE arc_fk_test_dueno NOLOGIN;
  END IF;
END $$;
GRANT USAGE ON SCHEMA arc TO arc_fk_test_dueno;
ALTER TABLE arc.categoria OWNER TO arc_fk_test_dueno;

CREATE SCHEMA arc_fk_test;
CREATE FUNCTION arc_fk_test.insertar(sufijo text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO arc.archivo (id, tenant_id, categoria, entidad_tipo, entidad_id, nombre_original, estado, creado_por)
  VALUES (('36000000-0000-0000-0000-0000000000' || sufijo)::uuid, '36000000-0000-0000-0000-00000000000a', 'DOCUMENTO', 'PRUEBA_DEV',
          'E-1', 'contrato.pdf', 'PENDIENTE_CARGA', '36000000-0000-0000-0000-0000000000f1');
END
$$;

-- Con UPDATE sobre `codigo`, el chequeo de la FK (como dueño de arc.categoria) pasa.
SELECT arc_fk_test.insertar('a1');

-- El dueño sigue sin poder cambiar el resto de la categoría.
DO $$ BEGIN
  IF has_column_privilege('arc_fk_test_dueno', 'arc.categoria', 'sensible', 'UPDATE')
     OR has_column_privilege('arc_fk_test_dueno', 'arc.categoria', 'mimes_permitidos', 'UPDATE')
     OR has_column_privilege('arc_fk_test_dueno', 'arc.categoria', 'tamano_max_bytes', 'UPDATE') THEN
    RAISE EXCEPTION 'el dueño de arc.categoria solo debía tener UPDATE sobre codigo';
  END IF;
END $$;

-- Sin ese UPDATE, el mismo INSERT falla con 42501: el error que daba Supabase antes de la migración.
REVOKE UPDATE (codigo) ON arc.categoria FROM arc_fk_test_dueno;
DO $$ BEGIN
  PERFORM arc_fk_test.insertar('a2');
  RAISE EXCEPTION 'no falló';
EXCEPTION WHEN OTHERS THEN
  IF SQLSTATE <> '42501' THEN
    RAISE EXCEPTION 'sin UPDATE en arc.categoria se esperaba 42501 y llegó % (%)', SQLSTATE, SQLERRM;
  END IF;
END $$;

ROLLBACK;
