# TR-EDGE · Agente local (MOD-21) + bloques offline de TR-SEQ

Paquetes de contexto (no son specs) del agente local y de TR-RF-038 (bloques de numeración offline, MOD-05). Release: **R4, backlog 2028** («TR-EDGE (agente local)» en la sección R4 del plan). El SRS pone 134-137 en MVP y 038/138 en R2: manda el plan. Ningún RF tiene historia en `3_plan.json`. El spec 10 dejó RF-038 fuera («Reserva de bloques offline TR-RF-038 (R2)»).

## Checklist de RF
| | RF | Nombre | Prioridad | Fase SRS | Historia | Archivo | Estado |
|---|---|---|---|---|---|---|---|
| [ ] | TR-RF-134 | Enrolar agente local | Must | MVP | sin historia (R4) | `edge-enrolamiento-impresion.md` | Pendiente (sin spec) |
| [ ] | TR-RF-135 | Imprimir en impresora térmica y abrir cajón | Must | MVP | sin historia (R4) | `edge-enrolamiento-impresion.md` | Pendiente (sin spec) |
| [ ] | TR-RF-136 | Operar sin internet con cola local | Must | MVP | sin historia (R4) | `edge-offline-cache-bloques.md` | Pendiente (sin spec) |
| [ ] | TR-RF-137 | Mantener caché local de configuración y catálogos | Should | MVP | sin historia (R4) | `edge-offline-cache-bloques.md` | Pendiente (sin spec) |
| [ ] | TR-RF-038 | Reservar bloques de numeración para operación offline (TR-SEQ) | Should | R2 | sin historia (R4) | `edge-offline-cache-bloques.md` | Pendiente (sin spec; fuera del spec 10) |
| [ ] | TR-RF-138 | Monitorear y actualizar agentes de forma remota | Should | R2 | sin historia (R4) | `edge-gestion-remota.md` | Pendiente (sin spec) |

## Orden de construcción
| # | Spec propuesto | RF | h | Depende de |
|---|---|---|---|---|
| 1 | edge-enrolamiento | 134 | 9-10 | 07, 17a, 17c, 21 |
| 2 | edge-impresion-cajon | 135 | 8-9 | 1 |
| 3 | edge-latido-parque | 138 (latido, SIN_DATOS, vista) | 6-7 | 1, 17b, 21 |
| 4 | seq-bloques-offline | 038 | 6-7 | 10, 1 |
| 5 | edge-cache-local | 137 | 7-8 | 1, 09, 19a, 11 |
| 6 | edge-cola-offline-sync | 136 | 10 | 4, 5 |
| 7 | edge-actualizacion-anillos | 138 (versiones firmadas) | 6-7 | 3 |

1 crea `apps/edge`, la credencial del dispositivo y el canal; todo lo demás cuelga de él. 2 da valor inmediato (impresión de comandas en SazónPOS). 3 temprano para ver el parque desde el piloto. 4 y 5 son prerrequisitos de 6 (RN-046: offline con bloques y catálogos en caché). 7 al final: hasta tener varios locales, se actualiza a mano.

PL-10 no incluye TR-EDGE: al entrar, agregar `SEG --> EDGE`, `SEQ --> EDGE`, `CAT --> EDGE`, `CFG --> EDGE`, `EVT --> EDGE`, `OBS --> EDGE`. Migraciones propuestas `db/04c_edge*.sql` (prefijo 04 para R4, a confirmar); los bloques pueden ir como extensión de SEQ (`db/01d_seq_bloques.sql`).
