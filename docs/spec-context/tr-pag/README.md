# TR-PAG Pagos (MOD-09): paquetes de contexto

Paquetes de contexto para `/spec` (no son specs). Módulo MOD-09, proceso TR-P05, lib prevista `libs/plataforma/pagos` («(R3) TR-PAG»), esquema `pag`. Primer consumidor: PsicoAgenda (H5, 2027-10-05). PL-10: PAG depende de FE y NOT.

## Checklist de RF
| RF | Nombre | Prioridad | Fase SRS | Historia (plan) | Archivo | Estado |
|---|---|---|---|---|---|---|
| TR-RF-065 | Configurar pasarela de pagos por empresa | Must | MVP | R3-01 | `pag-pasarela-y-cobro-tarjeta.md` | Pendiente |
| TR-RF-066 | Crear intención de cobro con tarjeta | Must | MVP | R3-01 | `pag-pasarela-y-cobro-tarjeta.md` | Pendiente |
| TR-RF-067 | Cobrar con Yape o Plin | Must | MVP | R3-01 | `pag-yape-plin-webhook.md` | Pendiente |
| TR-RF-068 | Generar link de pago | Should | MVP | R3-03 | `pag-link-reembolso.md` | Pendiente |
| TR-RF-069 | Procesar webhook de la pasarela | Must | MVP | R3-02 | `pag-yape-plin-webhook.md` | Pendiente |
| TR-RF-070 | Reembolsar pago | Must | MVP | R3-03 | `pag-link-reembolso.md` | Pendiente |
| TR-RF-071 | Gestionar cobros recurrentes | Should | R2 | Sin historia (R4 de hecho) | `pag-recurrencia-conciliacion-suscripcion.md` | Fuera del plan |
| TR-RF-072 | Conciliar liquidaciones de la pasarela | Must | R2 | Sin historia (R4 según plan) | `pag-recurrencia-conciliacion-suscripcion.md` | Fuera del plan |
| TR-RF-073 | Facturar y cobrar la suscripción del tenant | Must | R2 | Sin historia (R4 según plan; cruza FE y ORG) | `pag-recurrencia-conciliacion-suscripcion.md` | Fuera del plan |

## Orden de construcción propuesto
| # | Slug | RF | h | Depende de | Release / sprint |
|---|---|---|---|---|---|
| 0 | (transversal) almacén de secretos por tenant | TR-RNF-113 | 4-5 | kernel-infra | R2 o inicio de R3 (lo usan también FE y NOT) |
| 1 | pag-pasarela-y-cobro-tarjeta | 065, 066 | 10 | 0, 05, 07, 11, 19a, 20a | R3 / S19 |
| 2 | pag-webhook-pasarela | 069 | 6 | 1 | R3 / S19 |
| 3 | pag-yape-plin | 067 | 4 | 2 | R3 / S19-20 |
| 4 | pag-configuracion-ui | 065 UI | 5 | 1, 15, 17c | R3 / S20 |
| 5 | pag-link-pago | 068 | 4 | 2, not-envio-correo-resend | R3 / S20 |
| 6 | pag-reembolso | 070 | 5 | 2 | R3 / S20 |
| 7 | pag-pagos-admin-ui | 068/070 UI | 6 | 4, 5, 6 | R3 / S20-21 |
| R4 | pag-cobro-recurrente, pag-conciliacion-liquidaciones, org-facturacion-suscripcion | 071, 072, 073 | 9 + 9 + 10 | 1-6, FE, REP, ARC, POR | Backlog 2028 |

Plan R3: 12 + 6 + 8 = 26 h; la partición de R3 suma unas 40 h más el almacén de secretos. La pasarela concreta (P1 de `pag-pasarela-y-cobro-tarjeta.md`) se decide antes de redactar el spec 1.
`<ui-checkout>` (Componentes y Consumidores) no tiene RF ni historia: spec front aparte cuando PsicoAgenda lo pida.
