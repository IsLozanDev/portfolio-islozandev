# TR-AUD parte pendiente: ARCO e incidentes (MOD-12): paquetes de contexto

Paquetes de contexto para `/spec` (no son specs). Módulo MOD-12, proceso TR-P11, lib existente `libs/plataforma/auditoria` (esquema `aud`), que el plan anota como «bitácora inmutable con hash encadenado · ARCO (R2)».

## Checklist de RF
| RF | Nombre | Prioridad | Fase SRS | Historia (plan) | Archivo | Estado |
|---|---|---|---|---|---|---|
| TR-RF-084 | Registrar evento de auditoría inmutable | Must | MVP | E-01 | `specs/20a-aud-registro-inmutable.md` | Implementado (20a) |
| TR-RF-085 | Registrar acceso a datos sensibles | Must | MVP | E-01 | `specs/20a-aud-registro-inmutable.md` (vista del titular pendiente, ver ARCO) | Implementado (20a) |
| TR-RF-086 | Consultar y exportar auditoría | Must | MVP | E-01 | `specs/20b-aud-consulta-integridad.md`, `specs/20c-aud-visor-ui.md` | Implementado (20b back, 20c visor) |
| TR-RF-087 | Verificar integridad de la auditoría | Should | R2 | Sin historia (20b lo adelantó por TR-RNF-112 dentro de E-01) | `specs/20b-aud-consulta-integridad.md` | Implementado (20b); el incidente automático del paso 4 queda en `arco-incidentes-datos.md` |
| TR-RF-088 | Registrar solicitud de derechos ARCO | Must | MVP | R2-17 | `arco-registro-atencion.md` | Pendiente |
| TR-RF-089 | Atender solicitud ARCO | Must | MVP | R2-17 | `arco-registro-atencion.md` | Pendiente |
| TR-RF-090 | Ejecutar cancelación y anonimización | Must | R2 | Sin historia | `arco-cancelacion-anonimizacion.md` | Pendiente |
| TR-RF-091 | Registrar y notificar incidente de seguridad de datos | Must | MVP | R2-17 | `arco-incidentes-datos.md` | Pendiente |

## Orden de construcción propuesto
| # | Slug | RF | h | Depende de | Release / sprint |
|---|---|---|---|---|---|
| 1 | aud-incidentes-datos | 091 back + consumidor `aud.integridad.rota` | 7 | 20b, not-envio-correo-resend | R2 / S18 |
| 2 | arco-solicitud-plazos | 088 (registro por responsable) + alertas 50/80 % | 8 | 10, 19c, 20a, not-envio-correo-resend, R2-03 TR-ARC | R2 / S18 |
| 3 | arco-atencion-compilado | 089 | 7 | 2, R2-03 | R2 / S18 |
| 4 | aud-incidentes-consola-ui | 091 UI (consola) | 5 | 1, 17b | R2 / S18 |
| 5 | arco-admin-ui | 088/089 UI (admin-cliente) | 6 | 2, 3, 20c | R2 / S18 |
| 6 | arco-cancelacion-anonimizacion | 090 | 7 | 3, R2-01 TR-PER | R2 (sin historia) |

El plan asigna 5 h a R2-17; la partición suma unas 40 h. Incidentes va primero: no depende de TR-PER ni de TR-ARC y cierra el hueco de RF-087 paso 4.
Portal del titular (RF-088 en APP-05) llega con TR-POR (R3-07) sobre la misma API.
Migraciones: `db/01<letra>_aud_incidente.sql`, `01<letra>_aud_arco.sql` y `01<letra>_aud_arco_cancelacion.sql`, con la letra siguiente libre al implementar (no `01g`: el runner ordena alfabéticamente y la cancelación depende de las tablas de PER, que van en una letra posterior). Orden en `docs/roadmap-specs.md`, specs 63 a 68.
