-- 01q · Plantillas de notificación personalizadas por tenant (spec 43). PostgreSQL 16. Reversible: rollback/01q_not_plantillas.sql.
-- Cada personalización es una fila nueva del tenant; solo cambia `activa`. Las políticas RLS de 01o no cambian.

ALTER TABLE ntf.plantilla
  ADD COLUMN creado_por uuid;                                  -- NULL en las base (semilla)

-- Una sola versión activa por tenant, código, canal e idioma: resuelve la carrera de dos personalizaciones.
CREATE UNIQUE INDEX uq_plantilla_activa_tenant
  ON ntf.plantilla (tenant_id, codigo, canal, idioma)
  WHERE tenant_id IS NOT NULL AND activa;

-- Ejemplos para la vista previa en la base existente. Sin FORCE para que el dueño escriba la fila base
-- (la política de escritura solo deja filas del tenant); se repone enseguida.
ALTER TABLE ntf.plantilla NO FORCE ROW LEVEL SECURITY;
UPDATE ntf.plantilla
   SET variables = '[{"nombre":"nombre","tipo":"texto","ejemplo":"María Quispe"},
                     {"nombre":"producto","tipo":"texto","ejemplo":"SazónPOS"}]'
 WHERE tenant_id IS NULL AND codigo = 'PRUEBA_CORREO';
ALTER TABLE ntf.plantilla FORCE ROW LEVEL SECURITY;
