-- 01t · Notificaciones TR-NOT: recordatorios programados por referencia (spec 45). PostgreSQL 16.
-- Reversible: rollback/01t_not_programacion.sql.
-- La tabla es la fuente de verdad del recordatorio; BullMQ solo dispara (Redis puede perder un trabajo, la base
-- no). El destinatario y las variables se guardan para renderizar a la hora con la plantilla vigente; nunca van
-- a logs ni a eventos (TR-RNF-026).

-- ---------------------------------------------------------------------
-- 1. Programación. Una sola viva (PROGRAMADA) por tenant, referencia y plantilla: reprogramar actualiza esa fila.
--    version es el bloqueo optimista y va en el jobId de la cola: un trabajo de una versión vieja no envía.
-- ---------------------------------------------------------------------
CREATE TABLE ntf.programacion (
  id                uuid PRIMARY KEY,
  tenant_id         uuid         NOT NULL,
  referencia_tipo   varchar(40)  NOT NULL CHECK (referencia_tipo ~ '^[a-z][a-z0-9_.]{1,39}$'),
  referencia_id     varchar(100) NOT NULL CHECK (char_length(referencia_id) >= 1),
  plantilla_codigo  varchar(60)  NOT NULL CHECK (plantilla_codigo ~ '^[A-Z][A-Z0-9_]{1,59}$'),
  -- { personaId } | { correo }
  destinatario      jsonb        NOT NULL CHECK (jsonb_typeof(destinatario) = 'object'),
  variables         jsonb        NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(variables) = 'object'),
  finalidad         varchar(14)  NOT NULL CHECK (finalidad IN ('TRANSACCIONAL','PROMOCIONAL')),
  enviar_en         timestamptz  NOT NULL,
  estado            varchar(12)  NOT NULL CHECK (estado IN ('PROGRAMADA','ENVIADA','CANCELADA','DESCARTADA')),
  -- Estado del mensaje cuando la programación quedó DESCARTADA.
  motivo            varchar(40),
  mensaje_id        uuid REFERENCES ntf.mensaje(id),
  version           integer      NOT NULL DEFAULT 1 CHECK (version >= 1),
  creado_por        uuid,
  creado_en         timestamptz  NOT NULL DEFAULT now(),
  modificado_en     timestamptz,
  CHECK (estado <> 'ENVIADA' OR mensaje_id IS NOT NULL),
  CHECK (estado <> 'DESCARTADA' OR motivo IS NOT NULL)
);
CREATE UNIQUE INDEX uq_programacion_viva
  ON ntf.programacion (tenant_id, referencia_tipo, referencia_id, plantilla_codigo)
  WHERE estado = 'PROGRAMADA';
CREATE INDEX ix_programacion_pendiente ON ntf.programacion (enviar_en) WHERE estado = 'PROGRAMADA';

-- ---------------------------------------------------------------------
-- 2. RLS por app.tenant_id, como el resto de ntf (01o). Sin DELETE: una cancelación es un estado.
-- ---------------------------------------------------------------------
ALTER TABLE ntf.programacion ENABLE ROW LEVEL SECURITY;
ALTER TABLE ntf.programacion FORCE ROW LEVEL SECURITY;

CREATE POLICY programacion_select ON ntf.programacion FOR SELECT
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY programacion_insert ON ntf.programacion FOR INSERT
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY programacion_update ON ntf.programacion FOR UPDATE
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

-- ---------------------------------------------------------------------
-- 3. Barrido entre tenants: el worker vuelve a encolar las PROGRAMADA vencidas que Redis perdió. Devuelve solo
--    (id, tenant_id, version); la ejecución relee la fila con el contexto del tenant y la RLS.
--    Dueño org_lector, como ntf.mensaje_por_id_externo (01o).
-- ---------------------------------------------------------------------
GRANT SELECT ON ntf.programacion TO org_lector;
CREATE POLICY programacion_lector ON ntf.programacion FOR SELECT TO org_lector USING (true);

CREATE FUNCTION ntf.programaciones_atrasadas(p_antes timestamptz, p_limite integer)
RETURNS TABLE (id uuid, tenant_id uuid, version integer)
LANGUAGE sql STABLE STRICT SECURITY DEFINER SET search_path = ntf, pg_temp AS $$
  SELECT p.id, p.tenant_id, p.version
    FROM ntf.programacion p
   WHERE p.estado = 'PROGRAMADA'
     AND p.enviar_en < p_antes
   ORDER BY p.enviar_en
   LIMIT p_limite;
$$;

ALTER FUNCTION ntf.programaciones_atrasadas(timestamptz, integer) OWNER TO org_lector;
REVOKE EXECUTE ON FUNCTION ntf.programaciones_atrasadas(timestamptz, integer) FROM PUBLIC;

-- ---------------------------------------------------------------------
-- 4. Privilegios: el rol de la aplicación es el que corre la migración (en dev, postgres).
-- ---------------------------------------------------------------------
REVOKE ALL ON ntf.programacion FROM PUBLIC;

DO $$
BEGIN
  EXECUTE format('GRANT SELECT, INSERT, UPDATE ON ntf.programacion TO %I', current_user);
  EXECUTE format('REVOKE DELETE, TRUNCATE ON ntf.programacion FROM %I', current_user);
  EXECUTE format('GRANT EXECUTE ON FUNCTION ntf.programaciones_atrasadas(timestamptz, integer) TO %I', current_user);
END
$$;

-- Los esquemas de plataforma no se exponen por la Data API (regla 8). En PostgreSQL plano (CI) los roles de
-- Supabase no existen.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
     AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON ntf.programacion FROM anon, authenticated;
    REVOKE ALL ON FUNCTION ntf.programaciones_atrasadas(timestamptz, integer) FROM anon, authenticated;
  END IF;
END
$$;
