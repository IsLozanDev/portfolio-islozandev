-- 01r · Facturación electrónica TR-FE: prueba en beta, paso a producción y URL del proveedor (spec 50).
-- PostgreSQL 16. Reversible: rollback/01r_fe_prueba.sql.
-- La última prueba vive en el emisor (sin historial): la auditoría registra cada solicitud. El token del proveedor
-- sigue en la bóveda (fe.credencial); la URL no es secreta.

-- ---------------------------------------------------------------------
-- 1. Columnas nuevas. pruebas_enviadas es el correlativo de prueba propio del emisor (no usa SEQ) y el número
--    de la última prueba. ck_emisor_produccion: el estado PRODUCCION y el ambiente PRODUCCION van juntos.
--    Las políticas RLS de 01p cubren las columnas nuevas.
-- ---------------------------------------------------------------------
ALTER TABLE fe.emisor
  ADD COLUMN url_proveedor              varchar(255),
  ADD COLUMN pruebas_enviadas           integer NOT NULL DEFAULT 0 CHECK (pruebas_enviadas >= 0),
  ADD COLUMN prueba_estado              varchar(12)
                                          CHECK (prueba_estado IN ('EN_PROCESO','ACEPTADA','RECHAZADA','ERROR')),
  ADD COLUMN prueba_solicitada_en       timestamptz,
  ADD COLUMN prueba_resultado_en        timestamptz,
  ADD COLUMN prueba_codigo              varchar(20),
  ADD COLUMN prueba_descripcion         varchar(500),
  ADD COLUMN produccion_habilitada_en   timestamptz,
  ADD COLUMN produccion_habilitada_por  uuid,
  ADD CONSTRAINT ck_emisor_url_https CHECK (url_proveedor IS NULL OR url_proveedor LIKE 'https://%'),
  ADD CONSTRAINT ck_emisor_produccion CHECK ((estado = 'PRODUCCION') = (ambiente = 'PRODUCCION'));

-- ---------------------------------------------------------------------
-- 2. Catálogo PROVEEDOR_FE: Nubefact como PSE real y los atributos nuevos del simulador.
--    dominios_permitidos: hosts exactos a los que el worker puede llamar (anti-SSRF). serie_prueba: la serie de
--    la boleta de prueba en beta. Nubefact firma por su cuenta: no exige el .pfx del emisor.
--    El trigger sube la versión del catálogo con cada ítem tocado y así se invalida la caché de ítems (la clave
--    lleva la versión): no se devuelve a 1, a diferencia de 01p, que creaba el catálogo.
-- ---------------------------------------------------------------------
INSERT INTO cat.catalogo_item (id, catalogo_id, codigo, nombre, orden, atributos, vigente_desde) VALUES
  ('ca700000-0000-0000-0020-000000000002', 'ca700000-0000-0000-0000-000000000020', 'NUBEFACT', 'Nubefact (PSE)', 2,
   '{"requiere_certificado": false, "soporta_resumen": true, "url_beta": null, "serie_prueba": "BBB1", "dominios_permitidos": ["api.nubefact.com"]}',
   '2026-01-01');

UPDATE cat.catalogo_item
   SET atributos = atributos || '{"serie_prueba": "B999", "dominios_permitidos": ["simulador.invalid"]}'::jsonb
 WHERE id = 'ca700000-0000-0000-0020-000000000001';
