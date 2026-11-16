# TR-INT · Integración externa (MOD-20)

Paquetes de contexto (no son specs) de TR-INT. Release: **R4, backlog 2028**, fuera de R0-R3 («TR-INT (API pública y webhooks salientes)» en la sección R4 del plan). El SRS los pone en R2: manda el plan. Ningún RF tiene historia en `3_plan.json`.

## Checklist de RF
| | RF | Nombre | Prioridad | Fase SRS | Historia | Archivo | Estado |
|---|---|---|---|---|---|---|---|
| [ ] | TR-RF-130 | Registrar clientes de API | Must | R2 | sin historia (R4) | `int-clientes-api-publica.md` | Pendiente (sin spec) |
| [ ] | TR-RF-131 | Exponer API pública versionada con límites | Must | R2 | sin historia (R4) | `int-clientes-api-publica.md` | Pendiente (sin spec) |
| [ ] | TR-RF-132 | Configurar webhooks salientes | Should | R2 | sin historia (R4) | `int-webhooks-salientes.md` | Pendiente (sin spec) |
| [ ] | TR-RF-133 | Sincronizar con base institucional por cursor | Should | R2 | sin historia (R4) | `int-sincronizacion-cursor.md` | Pendiente (sin spec) |

La hoja Componentes cita además un «cliente GitHub para problemas» en TR-INT, sin RF en MOD-20 (probablemente de TR-SOP).

## Orden de construcción
| # | Spec propuesto | RF | h | Depende de |
|---|---|---|---|---|
| 1 | int-clientes-api | 130 + emisión de token | 8-9 | 07, 12, 20a, 17c |
| 2 | int-api-publica-limites | 131 | 8-9 | 1, 21 |
| 3 | evt-registro-esquemas | 094 (pendiente base) | 7-9 | 11 (ver `../tr-pendientes-base/`) |
| 4 | int-webhooks-salientes | 132 | 9-10 | 1, 3, 11; TR-NOT (R2) para el aviso |
| 5 | int-sync-cursor-ack | 133 (lectura y ack) | 7-8 | 1, 11 |
| 6 | int-sync-conciliacion-purga | 133 (conciliación y purga) | 5-6 | 5, 21; alertas TR-OBS (R3) |

1 es la base de todo (token y principal de cliente). 3 no es de TR-INT pero los webhooks necesitan saber qué eventos son públicos y con qué versión. 4 y 5 son independientes entre sí tras 1. 6 al final: la purga toca el outbox inmutable.

PL-10 no incluye TR-INT: al entrar, agregar `SEG --> INT`, `EVT --> INT`, `NOT --> INT`. Migraciones propuestas `db/04b_int*.sql` (prefijo 04 para R4, a confirmar).
