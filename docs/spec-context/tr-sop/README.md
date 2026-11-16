# TR-SOP · Centro de soporte (MOD-17)

Paquetes de contexto para los specs de TR-SOP. No son specs: `/spec` asigna el número.

## Qué es y qué no es TR-SOP
- **No es TR-SOP** (ya implementado, TR-SEG RF 019-020, specs 18 y 18b): `libs/plataforma/consola-soporte` (el agente solicita y usa un acceso temporal a un tenant), `seg.acceso_soporte`, el banner y la sesión de soporte de `shared/shell`, el rol `PLAT_AGENTE_SOPORTE`. Allí el ticket `SOP-######` solo se valida por formato (`VerificadorTicketPorFormato`).
- **Es TR-SOP**: tickets con contexto y SLA por plan, bandeja, estados, comentarios, problemas con GitHub, ticket desde alerta y base de conocimiento. Al llegar, cierra los pendientes del spec 18: verificador real de ticket y revocación de accesos al cerrar el ticket.

## Checklist de RF
| RF | Nombre | Prioridad | Fase SRS | Historia | Archivo | Estado |
|---|---|---|---|---|---|---|
| TR-RF-111 | Crear ticket desde el widget con contexto | Must | MVP | R3-08 (sprint 23) | `sop-widget-tickets-comentarios.md` | Contexto listo |
| TR-RF-112 | Crear ticket automático desde alerta | Must | MVP | Sin historia | `sop-escalamiento-github-alertas.md` | Contexto listo; sin historia |
| TR-RF-113 | Gestionar bandeja de tickets por SLA | Must | MVP | R3-08 (sprint 23) | `sop-bandeja-sla-estados.md` | Contexto listo |
| TR-RF-114 | Cambiar estado del ticket con control de SLA | Must | MVP | R3-08 (sprint 23) | `sop-bandeja-sla-estados.md` | Contexto listo |
| TR-RF-115 | Comentar y registrar notas internas | Must | MVP | R3-08 (sprint 23) | `sop-widget-tickets-comentarios.md` | Contexto listo |
| TR-RF-116 | Escalar a N2 y vincular problema con GitHub | Should | MVP | R3-09 (sprint 23) | `sop-escalamiento-github-alertas.md` | Contexto listo |
| TR-RF-117 | Resolver problema y cerrar tickets vinculados | Should | MVP | R3-09 (sprint 23) | `sop-escalamiento-github-alertas.md` | Contexto listo |
| TR-RF-118 | Gestionar base de conocimiento con sugerencias | Should | R2 | Sin historia | `sop-base-conocimiento.md` | Contexto listo; depende de TR-IA (R4) |

## Orden de construcción
1. `sop-tickets-nucleo` (111, 115 back). Requiere 07, 12, 19c.
2. `sop-bandeja-estados-back` (113, 114 back).
3. `sop-widget-ui` (111, 115 front) y `sop-consola-bandeja-ui` (113-115 front), en paralelo.
4. `sop-problemas-github` (116, 117).
5. `sop-ticket-desde-alerta` (112), después de `obs-evaluador-alertas` (`tr-obs-negocio/`).
6. Opcional: `sop-kb-articulos` y `sop-kb-sugerencias-ui` (118 sin IA); `sop-kb-semantica` cuando exista TR-IA.

Notas:
- El plan da 18 h al sprint 23 (R3-08 14 h + R3-09 4 h); la estimación de estos paquetes es de 36 a 40 h sin la base de conocimiento.
- PL-10 pone OBS antes que SOP, pero el calendario pone SOP (sprint 23) antes que OBS (sprint 24): solo 112 depende de OBS.
- Avisos y adjuntos dependen de TR-NOT (R2-09) y TR-ARC (R2-03); sin ellos, adaptadores nulos.
- El SRS no da los minutos de SLA por plan y prioridad: hay que fijarlos con el usuario antes del primer spec.
