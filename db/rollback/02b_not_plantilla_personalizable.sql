-- Deja ntf.plantilla como la dejó 02a_not_bajas: sin personalizable ni nombre. No reactiva las personalizaciones de
-- INTEGRIDAD_ROTA que desactivó la migración: no se sabe cuáles estaban activas.
ALTER TABLE ntf.plantilla
  DROP CONSTRAINT ck_plantilla_nombre,
  DROP COLUMN nombre,
  DROP COLUMN personalizable;
