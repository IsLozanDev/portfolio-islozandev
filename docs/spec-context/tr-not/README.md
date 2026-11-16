# TR-NOT Notificaciones (MOD-10): paquetes de contexto

Paquetes de contexto para `/spec` (no son specs). Módulo MOD-10, proceso TR-P06, lib prevista `libs/plataforma/notificaciones` («(R2) correo · (R3) WhatsApp»). Proveedor de correo: Resend.

## Checklist de RF
| RF | Nombre | Prioridad | Fase SRS | Historia (plan) | Archivo | Estado |
|---|---|---|---|---|---|---|
| TR-RF-074 | Gestionar plantillas de notificación | Must | MVP | R2-09 (back), R2-11 (front) | `not-correo-plantillas-estados.md`, `not-plantillas-ui.md` | Pendiente |
| TR-RF-075 | Enviar notificación transaccional | Must | MVP | R2-09 | `not-correo-plantillas-estados.md` | Pendiente |
| TR-RF-076 | Programar recordatorios | Must | MVP | R2-10 | `not-recordatorios-preferencias.md` | Pendiente |
| TR-RF-077 | Gestionar preferencias y bajas del destinatario | Must | MVP | R2-10 | `not-recordatorios-preferencias.md` | Pendiente |
| TR-RF-078 | Enviar por WhatsApp con plantillas aprobadas | Should | MVP | R3-11 | `not-whatsapp.md` | Pendiente |
| TR-RF-079 | Registrar estado de entrega y conmutar canal | Must | MVP | R2-09 (correo), R3-11 (WhatsApp) | `not-correo-plantillas-estados.md`, `not-whatsapp.md` | Pendiente |

Fuera de esta carpeta: TR-RF-062 (entrega del CPE, R2-09) va con el paquete de TR-FE y consume `NotificacionPort`.
Sin RF: centro de notificaciones Socket.IO del shell (hoja Componentes); queda como ambigüedad en `not-correo-plantillas-estados.md` P9.

## Orden de construcción propuesto
| # | Slug | RF | h | Depende de | Release / sprint |
|---|---|---|---|---|---|
| 1 | not-envio-correo-resend | 075, 079 (correo) | 9 | 11, 21; R2-01 TR-PER (consentimiento) | R2 / S15 |
| 2 | not-plantillas-personalizacion | 074 back | 5 | 1, 07 | R2 / S15 |
| 3 | not-consumidores-plataforma | correos de `suscripcion.por_vencer`, `tenant.suspendido`, `aud.integridad.rota`, soporte | 3 | 1, 2 | R2 / S15-16 |
| 4 | not-recordatorios | 076 | 4 | 1 | R2 / S16 |
| 5 | not-preferencias-bajas | 077 | 6 | 4, R2-01 | R2 / S16 |
| 6 | not-plantillas-ui | 074 front | 4-5 | 2, 15, 17c, 19e | R2 / S16 |
| 7 | not-whatsapp-envio | 078, 079 (WhatsApp) | 8 | 1, 2, 4 | R3 / S24 |
| 8 | not-whatsapp-plantillas-meta | 078 (aprobación) | 5 | 7, 6 | R3 / S24 |

Plan: 6 + 5 + (parte de 5) + 6 = unas 19 h; la partición suma unas 44 h. La diferencia es la lib nueva, la cola, los webhooks firmados y el almacén de secretos, que el plan no contaba.
Paralelo: 4 y 6 tras 2; 3 en cualquier momento tras 2. Antes de 1: TR-PER (R2-01) o decidir el puerto nulo de consentimiento.
