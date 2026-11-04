-- 01b · Seguridad: bitácora y acceso temporal de soporte (spec 18). PostgreSQL 16.
-- Reversible: rollback/01b_seg_soporte.sql. Ordena después de 01b_seg_membresias.sql. Usa org_lector y
-- su lectura de org.tenant, que crea 01a_org_alta.sql.

-- ---------------------------------------------------------------------
-- 1. Bitácora: catálogo de tipos e índices para la consulta por tenant y fecha (TR-RNF-002).
-- ---------------------------------------------------------------------
ALTER TABLE seg.evento_seguridad
  ADD CONSTRAINT ck_evento_seguridad_tipo CHECK (tipo IN
    ('LOGIN', 'ACCESO_DENEGADO', 'ASIGNACION_OTORGADA', 'ASIGNACION_REVOCADA', 'ACCESO_SOPORTE'));
CREATE INDEX ix_evento_seguridad_fecha      ON seg.evento_seguridad (tenant_id, ocurrido_en DESC, id DESC);
CREATE INDEX ix_evento_seguridad_tipo_fecha ON seg.evento_seguridad (tenant_id, tipo, ocurrido_en DESC);
CREATE INDEX ix_evento_seguridad_usuario    ON seg.evento_seguridad (tenant_id, usuario_id, ocurrido_en DESC);

-- ---------------------------------------------------------------------
-- 2. Acceso de soporte. Vive en el tenant del cliente; el agente es usuario del tenant operador.
--    caduca_en solo aplica a PENDIENTE. cerrado_por es NULL cuando vence o lo cierra TR-SOP.
-- ---------------------------------------------------------------------
CREATE TABLE seg.acceso_soporte (
  id                uuid         PRIMARY KEY,
  tenant_id         uuid         NOT NULL REFERENCES org.tenant (id),
  agente_id         uuid         NOT NULL REFERENCES seg.usuario (id),
  ticket            char(10)     NOT NULL CHECK (ticket ~ '^SOP-[0-9]{6}$'),
  motivo            varchar(300) NOT NULL CHECK (char_length(motivo) BETWEEN 10 AND 300),
  modo              varchar(10)  NOT NULL CHECK (modo IN ('LECTURA', 'ESCRITURA')),
  horas_solicitadas smallint     NOT NULL CHECK (horas_solicitadas BETWEEN 1 AND 4),
  estado            varchar(10)  NOT NULL CHECK (estado IN ('PENDIENTE', 'APROBADO', 'RECHAZADO', 'REVOCADO', 'EXPIRADO')),
  solicitado_en     timestamptz  NOT NULL,
  caduca_en         timestamptz  NOT NULL,
  aprobado_por      uuid         NULL REFERENCES seg.usuario (id),
  horas_aprobadas   smallint     NULL CHECK (horas_aprobadas BETWEEN 1 AND 4),
  desde             timestamptz  NULL,
  hasta             timestamptz  NULL,
  membresia_id      uuid         NULL,
  asignacion_id     uuid         NULL,
  cerrado_por       uuid         NULL REFERENCES seg.usuario (id),
  cerrado_en        timestamptz  NULL,
  motivo_cierre     varchar(300) NULL,
  causa_cierre      varchar(15)  NULL CHECK (causa_cierre IN ('RECHAZO', 'ADMINISTRADOR', 'TICKET_CERRADO', 'VENCIMIENTO')),
  version           bigint       NOT NULL DEFAULT 0,
  FOREIGN KEY (tenant_id, membresia_id) REFERENCES seg.membresia (tenant_id, id),
  CONSTRAINT ck_soporte_caducidad CHECK (caduca_en > solicitado_en),
  -- Aprobado, revocado o vencido tras aprobarse: todos los datos de la aprobación y hasta = desde + horas.
  CONSTRAINT ck_soporte_aprobado CHECK (
    estado IN ('PENDIENTE', 'RECHAZADO')
    OR (aprobado_por IS NOT NULL AND horas_aprobadas IS NOT NULL AND desde IS NOT NULL
        AND hasta = desde + make_interval(hours => horas_aprobadas) AND membresia_id IS NOT NULL)
    OR (estado = 'EXPIRADO' AND aprobado_por IS NULL)),
  CONSTRAINT ck_soporte_cierre CHECK ((estado IN ('PENDIENTE', 'APROBADO')) = (cerrado_en IS NULL))
);
-- Una sola solicitud abierta (PENDIENTE o APROBADO) por agente y tenant.
CREATE UNIQUE INDEX ux_soporte_abierto ON seg.acceso_soporte (tenant_id, agente_id)
  WHERE estado IN ('PENDIENTE', 'APROBADO');
CREATE INDEX ix_soporte_estado ON seg.acceso_soporte (tenant_id, estado, solicitado_en DESC);
CREATE INDEX ix_soporte_ticket ON seg.acceso_soporte (tenant_id, ticket) WHERE estado IN ('PENDIENTE', 'APROBADO');
CREATE INDEX ix_soporte_vence  ON seg.acceso_soporte (hasta)     WHERE estado = 'APROBADO';
CREATE INDEX ix_soporte_caduca ON seg.acceso_soporte (caduca_en) WHERE estado = 'PENDIENTE';
CREATE INDEX ix_soporte_agente ON seg.acceso_soporte (agente_id, solicitado_en DESC);

CREATE TRIGGER acceso_soporte_sin_borrado BEFORE DELETE ON seg.acceso_soporte
  FOR EACH STATEMENT EXECUTE FUNCTION seg.sin_borrado();

ALTER TABLE seg.acceso_soporte ENABLE ROW LEVEL SECURITY;
ALTER TABLE seg.acceso_soporte FORCE ROW LEVEL SECURITY;
CREATE POLICY acceso_soporte_select ON seg.acceso_soporte FOR SELECT
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY acceso_soporte_insert ON seg.acceso_soporte FOR INSERT
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY acceso_soporte_update ON seg.acceso_soporte FOR UPDATE
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

-- ---------------------------------------------------------------------
-- 3. Lecturas entre tenants. Dueño org_lector (spec 12): sin login ni BYPASSRLS, con una política
--    de lectura propia. Sin motivo ni datos personales.
-- ---------------------------------------------------------------------
DO $$
BEGIN
  EXECUTE format('GRANT org_lector TO %I', current_user);
END
$$;
GRANT USAGE, CREATE ON SCHEMA seg TO org_lector;
GRANT SELECT ON seg.acceso_soporte TO org_lector;
CREATE POLICY acceso_soporte_lector ON seg.acceso_soporte FOR SELECT TO org_lector USING (true);

-- Accesos de un agente en todos los tenants, los 50 más recientes.
CREATE FUNCTION seg.accesos_soporte_de_agente(p_agente uuid)
RETURNS TABLE (id uuid, tenant_id uuid, tenant_nombre varchar, ticket char(10), modo varchar,
               estado varchar, horas_solicitadas smallint, solicitado_en timestamptz,
               desde timestamptz, hasta timestamptz, motivo_cierre varchar, causa_cierre varchar)
LANGUAGE sql STABLE STRICT SECURITY DEFINER SET search_path = '' AS $$
  SELECT a.id, a.tenant_id, t.nombre, a.ticket, a.modo, a.estado, a.horas_solicitadas, a.solicitado_en,
         a.desde, a.hasta, a.motivo_cierre, a.causa_cierre
    FROM seg.acceso_soporte a
    JOIN org.tenant t ON t.id = a.tenant_id
   WHERE a.agente_id = p_agente
   ORDER BY a.solicitado_en DESC, a.id
   LIMIT 50;
$$;

-- Aprobados con la vigencia cumplida y pendientes caducados, en todos los tenants. Solo ids.
CREATE FUNCTION seg.accesos_soporte_por_vencer(p_ahora timestamptz)
RETURNS TABLE (id uuid, tenant_id uuid)
LANGUAGE sql STABLE STRICT SECURITY DEFINER SET search_path = '' AS $$
  SELECT a.id, a.tenant_id FROM seg.acceso_soporte a WHERE a.estado = 'APROBADO' AND a.hasta <= p_ahora
  UNION ALL
  SELECT a.id, a.tenant_id FROM seg.acceso_soporte a WHERE a.estado = 'PENDIENTE' AND a.caduca_en <= p_ahora
  ORDER BY 2, 1;
$$;

ALTER FUNCTION seg.accesos_soporte_de_agente(uuid) OWNER TO org_lector;
ALTER FUNCTION seg.accesos_soporte_por_vencer(timestamptz) OWNER TO org_lector;
REVOKE EXECUTE ON FUNCTION seg.accesos_soporte_de_agente(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION seg.accesos_soporte_por_vencer(timestamptz) FROM PUBLIC;

-- Solo el rol que corre la migración (en dev, postgres: el mismo de la api y del worker).
DO $$
BEGIN
  EXECUTE format('GRANT EXECUTE ON FUNCTION seg.accesos_soporte_de_agente(uuid) TO %I', current_user);
  EXECUTE format('GRANT EXECUTE ON FUNCTION seg.accesos_soporte_por_vencer(timestamptz) TO %I', current_user);
END
$$;

-- Los esquemas de plataforma no se exponen por la Data API (regla 8). En PostgreSQL plano
-- (CI) los roles de Supabase no existen.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
     AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON seg.acceso_soporte FROM anon, authenticated;
    REVOKE ALL ON FUNCTION seg.accesos_soporte_de_agente(uuid) FROM anon, authenticated;
    REVOKE ALL ON FUNCTION seg.accesos_soporte_por_vencer(timestamptz) FROM anon, authenticated;
  END IF;
END
$$;
