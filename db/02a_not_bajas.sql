-- 02a · Notificaciones TR-NOT: bajas del destinatario por enlace firmado (spec 46). PostgreSQL 16.
-- Reversible: rollback/02a_not_bajas.sql.
-- La baja se guarda por destino_hash (HashearDestino, 01o): el correo en claro nunca llega a esta tabla.
-- persona_id solo sirve para reflejar la baja en per.consentimiento; sin FK a per (TR-RNF-119).

-- ---------------------------------------------------------------------
-- 1. Baja. Una por tenant, canal, alcance y destino: la segunda vez el repositorio devuelve la existente.
-- ---------------------------------------------------------------------
CREATE TABLE ntf.baja (
  id            uuid PRIMARY KEY,
  tenant_id     uuid        NOT NULL,
  canal         varchar(10) NOT NULL CHECK (canal IN ('CORREO')),
  alcance       varchar(12) NOT NULL CHECK (alcance IN ('PROMOCIONAL','CANAL')),
  destino_hash  varchar(80) NOT NULL,
  persona_id    uuid,
  origen        varchar(10) NOT NULL DEFAULT 'ENLACE' CHECK (origen IN ('ENLACE')),
  registrada_en timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_baja UNIQUE (tenant_id, canal, alcance, destino_hash)
);

-- ---------------------------------------------------------------------
-- 2. Solo inserción: la baja es evidencia de la decisión del titular (TR-RNF-016). Volver a suscribirse se
--    registra como consentimiento nuevo en PER, nunca borrando la baja.
-- ---------------------------------------------------------------------
CREATE FUNCTION ntf.baja_solo_insercion() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  RAISE EXCEPTION 'ntf.baja solo admite inserciones' USING ERRCODE = 'check_violation';
END
$$;

CREATE TRIGGER baja_solo_insercion BEFORE UPDATE OR DELETE ON ntf.baja
  FOR EACH ROW EXECUTE FUNCTION ntf.baja_solo_insercion();

-- ---------------------------------------------------------------------
-- 3. RLS por app.tenant_id, como el resto de ntf (01o).
-- ---------------------------------------------------------------------
ALTER TABLE ntf.baja ENABLE ROW LEVEL SECURITY;
ALTER TABLE ntf.baja FORCE ROW LEVEL SECURITY;

CREATE POLICY baja_select ON ntf.baja FOR SELECT
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY baja_insert ON ntf.baja FOR INSERT
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

-- ---------------------------------------------------------------------
-- 4. Privilegios: el rol de la aplicación es el que corre la migración (en dev, postgres).
-- ---------------------------------------------------------------------
REVOKE ALL ON ntf.baja FROM PUBLIC;

DO $$
BEGIN
  EXECUTE format('GRANT SELECT, INSERT ON ntf.baja TO %I', current_user);
  EXECUTE format('REVOKE UPDATE, DELETE, TRUNCATE ON ntf.baja FROM %I', current_user);
END
$$;

-- Los esquemas de plataforma no se exponen por la Data API (regla 8). En PostgreSQL plano (CI) los roles de
-- Supabase no existen.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
     AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON ntf.baja FROM anon, authenticated;
  END IF;
END
$$;
