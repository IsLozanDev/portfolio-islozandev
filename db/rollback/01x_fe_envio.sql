-- Deja fe como lo dejó 01v. Se niega si hay intentos de envío o comprobantes con respuesta: son la constancia del
-- envío a SUNAT. FORCE ROW LEVEL SECURITY se quita para contar los de todos los tenants y se repone antes de seguir.
ALTER TABLE fe.comprobante NO FORCE ROW LEVEL SECURITY;
ALTER TABLE fe.envio NO FORCE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM fe.envio) OR EXISTS (SELECT 1 FROM fe.comprobante WHERE respondido_en IS NOT NULL) THEN
    RAISE EXCEPTION 'Hay envíos o respuestas de SUNAT registrados: no se puede revertir 01x_fe_envio'
      USING ERRCODE = 'object_in_use';
  END IF;
END
$$;
ALTER TABLE fe.comprobante FORCE ROW LEVEL SECURITY;

DROP TABLE fe.envio;
DROP FUNCTION fe.proteger_envio();

-- La función de 01u: solo estado, version y modificado_en cambian.
CREATE OR REPLACE FUNCTION fe.proteger_comprobante() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  columnas_mutables CONSTANT text[] := ARRAY['estado', 'version', 'modificado_en'];
BEGIN
  IF TG_OP = 'UPDATE' AND TG_TABLE_NAME = 'comprobante'
     AND (to_jsonb(NEW) - columnas_mutables) = (to_jsonb(OLD) - columnas_mutables) THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'El comprobante electrónico es inmutable: % sobre fe.% no está permitido', TG_OP, TG_TABLE_NAME
    USING ERRCODE = 'restrict_violation';
END
$$;

ALTER TABLE fe.comprobante
  DROP COLUMN respondido_en,
  DROP COLUMN observaciones,
  DROP COLUMN descripcion_respuesta,
  DROP COLUMN codigo_respuesta,
  DROP COLUMN cdr_archivo_id,
  DROP COLUMN xml_archivo_id,
  DROP COLUMN hash;
