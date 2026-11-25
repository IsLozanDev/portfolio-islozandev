-- Prueba de 01v_fe_sunat_directo (spec 51c). La ejecuta tools/migrar/test/db-esquemas.test.mjs sobre una base
-- temporal con db/ aplicado. El inverso con un emisor SUNAT se prueba allí. Todo en una transacción que se revierte.

BEGIN;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM cat.catalogo c JOIN cat.catalogo_item i ON i.catalogo_id = c.id
     WHERE c.codigo = 'PROVEEDOR_FE' AND i.codigo = 'SUNAT' AND i.tenant_id IS NULL AND i.activo
       AND i.atributos = '{"requiere_certificado": true, "soporta_resumen": true, "serie_prueba": "BP01",
                           "url_beta": "https://e-beta.sunat.gob.pe/ol-ti-itcpfegem-beta/billService",
                           "url_produccion": "https://e-factura.sunat.gob.pe/ol-ti-itcpfegem/billService",
                           "dominios_permitidos": ["e-beta.sunat.gob.pe", "e-factura.sunat.gob.pe"]}'::jsonb
  ) THEN
    RAISE EXCEPTION 'PROVEEDOR_FE debía tener SUNAT con sus atributos';
  END IF;
END $$;

-- Cada URL apunta a un host de dominios_permitidos.
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM cat.catalogo_item i, LATERAL (VALUES (i.atributos->>'url_beta'), (i.atributos->>'url_produccion')) AS u(url)
     WHERE i.id = 'ca700000-0000-0000-0020-000000000003'
       AND NOT (i.atributos->'dominios_permitidos') ? substring(u.url FROM '^https://([^/]+)/')
  ) THEN
    RAISE EXCEPTION 'las URL de SUNAT debían estar en dominios_permitidos';
  END IF;
END $$;

ROLLBACK;
