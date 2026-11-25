-- 01w · Archivos TR-ARC: carga desde el servidor (spec 52). PostgreSQL 16. Reversible: rollback/01w_arc_carga_sistema.sql.
-- Un archivo SISTEMA lo genera la plataforma o lo devuelve un tercero de confianza (el XML firmado y el CDR de FE):
-- nace DISPONIBLE, sin antivirus y sin actor. Los archivos CARGA siguen exigiendo quién los subió.
-- version_archivo.subido_por solo queda nulo en la versión de un archivo SISTEMA: lo cumple el caso de uso
-- (un CHECK no puede mirar arc.archivo) y lo comprueba la prueba SQL.

ALTER TABLE arc.archivo
  ADD COLUMN origen varchar(8) NOT NULL DEFAULT 'CARGA' CHECK (origen IN ('CARGA','SISTEMA')),
  ALTER COLUMN creado_por DROP NOT NULL,
  ADD CONSTRAINT ck_archivo_actor CHECK (origen = 'SISTEMA' OR creado_por IS NOT NULL);

ALTER TABLE arc.version_archivo
  ALTER COLUMN subido_por DROP NOT NULL;
