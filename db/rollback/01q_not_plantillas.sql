-- Deja ntf.plantilla como la dejó 01o_not. Se niega si hay plantillas de tenants: quitar creado_por perdería
-- el autor de cada versión personalizada.
-- FORCE ROW LEVEL SECURITY se quita para contar las de todos los tenants y escribir la base; se repone al final.
ALTER TABLE ntf.plantilla NO FORCE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM ntf.plantilla WHERE tenant_id IS NOT NULL) THEN
    RAISE EXCEPTION 'Hay plantillas personalizadas por tenants en ntf.plantilla: revertir 01q_not_plantillas perdería su autor'
      USING ERRCODE = 'object_in_use';
  END IF;
END
$$;

UPDATE ntf.plantilla
   SET variables = '[{"nombre":"nombre","tipo":"texto"},{"nombre":"producto","tipo":"texto"}]'
 WHERE tenant_id IS NULL AND codigo = 'PRUEBA_CORREO';
ALTER TABLE ntf.plantilla FORCE ROW LEVEL SECURITY;

DROP INDEX ntf.uq_plantilla_activa_tenant;
ALTER TABLE ntf.plantilla DROP COLUMN creado_por;
