-- 01s · Plantillas base de los avisos de plataforma (spec 44). PostgreSQL 16. Reversible: rollback/01s_not_avisos_plataforma.sql.
-- Solo semilla: los correos de suscripcion.por_vencer, tenant.suspendido, soporte.solicitado y aud.integridad.rota.
-- Cada tenant las personaliza con la API del spec 43; las variables son las finales (cambiarlas rompe personalizaciones).

-- Sin FORCE para que el dueño escriba filas base (la política de escritura solo deja filas del tenant); se repone enseguida.
ALTER TABLE ntf.plantilla NO FORCE ROW LEVEL SECURITY;

INSERT INTO ntf.plantilla (id, tenant_id, codigo, canal, idioma, version, asunto, cuerpo, variables)
VALUES
(
  '44000000-0000-0000-0000-000000000001', NULL, 'SUSCRIPCION_POR_VENCER', 'CORREO', 'es', 1,
  'Tu suscripción a {{producto}} vence en {{dias}} días',
  '<p>Hola:</p><p>La suscripción de <strong>{{tenant}}</strong> a {{producto}} vence el {{vigente_hasta}}, dentro de {{dias}} días.</p><p>Renuévala antes de esa fecha para seguir usando el servicio sin interrupciones.</p>',
  '[{"nombre":"tenant","tipo":"texto","ejemplo":"Restaurante El Buen Sabor"},
    {"nombre":"producto","tipo":"texto","ejemplo":"REST"},
    {"nombre":"vigente_hasta","tipo":"fecha","ejemplo":"30/11/2026"},
    {"nombre":"dias","tipo":"numero","ejemplo":"3"}]'
),
(
  '44000000-0000-0000-0000-000000000002', NULL, 'TENANT_SUSPENDIDO', 'CORREO', 'es', 1,
  'La cuenta de {{tenant}} fue suspendida',
  '<p>Hola:</p><p>La cuenta de <strong>{{tenant}}</strong> quedó suspendida desde el {{fecha_efectiva}}.</p><p>Motivo: {{motivo}}.</p><p>Comunícate con nosotros para reactivarla.</p>',
  '[{"nombre":"tenant","tipo":"texto","ejemplo":"Restaurante El Buen Sabor"},
    {"nombre":"motivo","tipo":"texto","ejemplo":"Fin del periodo de gracia"},
    {"nombre":"fecha_efectiva","tipo":"fecha","ejemplo":"24/11/2026"}]'
),
(
  '44000000-0000-0000-0000-000000000003', NULL, 'SOPORTE_SOLICITADO', 'CORREO', 'es', 1,
  'Soporte pide acceso a {{tenant}} (ticket {{ticket}})',
  '<p>Hola:</p><p>Un agente de soporte pidió acceso a <strong>{{tenant}}</strong> por el ticket {{ticket}}.</p><p>Modo: {{modo}}. Horas solicitadas: {{horas}}.</p><p>Revisa la solicitud en la consola para aprobarla o rechazarla.</p>',
  '[{"nombre":"tenant","tipo":"texto","ejemplo":"Restaurante El Buen Sabor"},
    {"nombre":"ticket","tipo":"texto","ejemplo":"SOP-1024"},
    {"nombre":"modo","tipo":"texto","ejemplo":"LECTURA"},
    {"nombre":"horas","tipo":"numero","ejemplo":"4"}]'
),
(
  '44000000-0000-0000-0000-000000000004', NULL, 'INTEGRIDAD_ROTA', 'CORREO', 'es', 1,
  'Integridad de auditoría rota en el tenant {{tenant_id}}',
  '<p>La verificación {{modo}} de la cadena de auditoría encontró una rotura.</p><p>Tenant: {{tenant_id}}. Número roto: {{numero_roto}}. Motivo: {{motivo}}.</p><p>Revisa el incidente antes de la siguiente verificación.</p>',
  '[{"nombre":"tenant_id","tipo":"texto","ejemplo":"0190c6f2-7a3b-7c4d-8e5f-1a2b3c4d5e6f"},
    {"nombre":"numero_roto","tipo":"texto","ejemplo":"1532"},
    {"nombre":"motivo","tipo":"texto","ejemplo":"HASH"},
    {"nombre":"modo","tipo":"texto","ejemplo":"INCREMENTAL"}]'
);

ALTER TABLE ntf.plantilla FORCE ROW LEVEL SECURITY;
