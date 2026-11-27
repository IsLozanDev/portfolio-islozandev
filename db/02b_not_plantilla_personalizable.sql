-- 02b · Notificaciones TR-NOT: plantillas personalizables y su nombre legible (spec 47). PostgreSQL 16.
-- Reversible: rollback/02b_not_plantilla_personalizable.sql.
-- personalizable = false saca la plantilla de la API de plantillas del tenant; el envío no la mira.
-- nombre lo siembra la migración de cada base y la versión del tenant lo copia de su base: el tenant no lo edita.

-- Sin FORCE para que el dueño escriba las filas base y las de todos los tenants; se repone al final.
ALTER TABLE ntf.plantilla NO FORCE ROW LEVEL SECURITY;

ALTER TABLE ntf.plantilla
  ADD COLUMN personalizable boolean NOT NULL DEFAULT true,
  ADD COLUMN nombre varchar(120);

UPDATE ntf.plantilla SET nombre = CASE codigo
    WHEN 'PRUEBA_CORREO'          THEN 'Correo de prueba'
    WHEN 'SUSCRIPCION_POR_VENCER' THEN 'Aviso de suscripción por vencer'
    WHEN 'TENANT_SUSPENDIDO'      THEN 'Aviso de cuenta suspendida'
    WHEN 'SOPORTE_SOLICITADO'     THEN 'Solicitud de acceso de soporte'
    WHEN 'INTEGRIDAD_ROTA'        THEN 'Alerta de integridad de la auditoría'
  END
 WHERE tenant_id IS NULL;

-- Las versiones del tenant toman el nombre de su base.
UPDATE ntf.plantilla AS propia
   SET nombre = base.nombre
  FROM ntf.plantilla AS base
 WHERE propia.tenant_id IS NOT NULL AND base.id = propia.plantilla_base_id;

-- Una base sin nombre hace fallar el SET NOT NULL: así se detecta una base olvidada.
ALTER TABLE ntf.plantilla
  ALTER COLUMN nombre SET NOT NULL,
  ADD CONSTRAINT ck_plantilla_nombre CHECK (char_length(nombre) BETWEEN 3 AND 120);

-- INTEGRIDAD_ROTA va a la operación de la plataforma, aunque lleve el tenant del evento.
UPDATE ntf.plantilla
   SET personalizable = false
 WHERE tenant_id IS NULL AND codigo = 'INTEGRIDAD_ROTA';

-- Una personalización previa de una plantilla de operación deja de regir.
UPDATE ntf.plantilla
   SET activa = false
 WHERE tenant_id IS NOT NULL AND codigo = 'INTEGRIDAD_ROTA';

ALTER TABLE ntf.plantilla FORCE ROW LEVEL SECURITY;
