-- 01v · Facturación electrónica TR-FE: SUNAT directo (SEE-Del Contribuyente) como proveedor (spec 51c).
-- PostgreSQL 16. Reversible: rollback/01v_fe_sunat_directo.sql.
-- La URL del billService es fija por ambiente y la misma para todos los tenants: vive en el ítem, no en el emisor
-- (url_proveedor queda en null). El usuario secundario SOL va en fe.emisor.usuario_proveedor y la clave SOL en la
-- bóveda (fe.credencial). El emisor firma con su propio .pfx: requiere_certificado.
-- URL según «Servicios Web disponibles» de SUNAT (orientacion.sunat.gob.pe); si cambian, se corrige esta semilla.
-- El trigger sube la versión de PROVEEDOR_FE y así se invalida la caché de ítems.

INSERT INTO cat.catalogo_item (id, catalogo_id, codigo, nombre, orden, atributos, vigente_desde) VALUES
  ('ca700000-0000-0000-0020-000000000003', 'ca700000-0000-0000-0000-000000000020', 'SUNAT', 'SUNAT directo (SEE-Del Contribuyente)', 3,
   '{"requiere_certificado": true, "soporta_resumen": true, "serie_prueba": "BP01",
     "url_beta": "https://e-beta.sunat.gob.pe/ol-ti-itcpfegem-beta/billService",
     "url_produccion": "https://e-factura.sunat.gob.pe/ol-ti-itcpfegem/billService",
     "dominios_permitidos": ["e-beta.sunat.gob.pe", "e-factura.sunat.gob.pe"]}',
   '2026-01-01');
