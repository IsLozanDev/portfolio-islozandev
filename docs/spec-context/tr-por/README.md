# TR-POR · Portal del cliente final (MOD-19)

Paquetes de contexto para `/spec`. Release R3 (plan: sprint 22, historia R3-07). El cliente final es un usuario `EXTERNO` de Supabase Auth sin membresía ni roles de backoffice; accede solo a sus datos mediante su vínculo con TR-PER.

## Checklist de RF
| RF | Nombre | Prioridad | Fase SRS | Historia | Archivo | Estado |
|---|---|---|---|---|---|---|
| TR-RF-125 | Registrar cliente final en el portal | Must | MVP | R3-07 | `por-registro-ingreso-otp.md` | Contexto listo |
| TR-RF-126 | Ingresar al portal con OTP | Must | MVP | R3-07 | `por-registro-ingreso-otp.md` | Contexto listo |
| TR-RF-127 | Gestionar perfil del cliente final | Should | MVP | R3-07 | `por-perfil-consentimientos.md` | Contexto listo |
| TR-RF-128 | Consultar mis transacciones | Should | R2 | Sin historia | `por-mis-transacciones.md` | Contexto listo; fuera del plan hasta tener historia |
| TR-RF-129 | Gestionar consentimientos desde el portal | Must | MVP | R3-07 | `por-perfil-consentimientos.md` | Contexto listo |

Manda el plan: 125, 126, 127 y 129 en R3; 128 sin sprint. Ningún spec redactado ni implementado.

## Orden de construcción
Requisitos previos: specs 04, 05, 18b (implementados); TR-PER (R2-01), TR-NOT (R2-09, R2-10), ARCO (R2-17); TR-CMS partes A (resolución por host) y C (app SSR), ver `../tr-cms/README.md`.

| Orden | Parte | Slug | RF | h | Depende de |
|---|---|---|---|---|---|
| 1 | H1 | por-cuentas-registro-otp | 125, 126 (back) | 9 | 05, 18b, CMS A, TR-PER |
| 2 | H2 | por-portal-acceso-ui | 125, 126 (UI) | 5 | H1, CMS C |
| 3 | I | por-perfil-consentimientos | 127, 129 | 9 | H1, H2, TR-PER, TR-NOT, R2-17 |
| 4 | J | por-mis-transacciones | 128 | 7 | H1, H2, TR-PER, TR-FE, un producto contribuyente (sin historia) |

- Total R3-07 estimado 23 h frente a 10 h del plan. Replanificar sprint 22 junto con R3-06.
- WhatsApp (R3-11, sprint 24) llega después de R3-07: el OTP de R3 sale por SMS o correo.

## Decisiones transversales pendientes
- Tenant del cliente final: por host del sitio + `por.cuenta_cliente`, sin tocar el hook (ADR-32).
- Autorización `publico.*` sin roles: decorador de portal en lugar de `@Permiso`.
- Usuarios solo con celular: `seg.usuario.email` hoy es NOT NULL y el espejo ignora usuarios sin correo.
- Registro con Google con `enable_signup = false` (spec 04).
- Tope de 3 intentos de OTP: lo cuenta la API en Redis (Supabase no lo trae).
- Marca del portal por tenant frente a Diseño UI de CLAUDE.md (solo backoffice).
