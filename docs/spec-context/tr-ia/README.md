# TR-IA · Servicios de IA (MOD-15)

Paquetes de contexto (no son specs) de TR-IA. Release: **R4, backlog 2028**, fuera de R0-R3 según el plan («entran cuando un producto los necesite»). El SRS marca 100, 101 y 104 como MVP: manda el plan. Ningún RF tiene historia en `3_plan.json`.

## Checklist de RF
| | RF | Nombre | Prioridad | Fase SRS | Historia | Archivo | Estado |
|---|---|---|---|---|---|---|---|
| [ ] | TR-RF-100 | Enrutar solicitudes por la pasarela de modelos | Must | MVP | sin historia (R4) | `ia-pasarela-enmascarado-consumo.md` | Pendiente (sin spec) |
| [ ] | TR-RF-101 | Enmascarar datos personales en solicitudes de IA | Must | MVP | sin historia (R4) | `ia-pasarela-enmascarado-consumo.md` | Pendiente (sin spec) |
| [ ] | TR-RF-102 | Extraer datos de documentos con revisión humana | Should | R2 | sin historia (R4) | `ia-extraccion-rag.md` | Pendiente (sin spec) |
| [ ] | TR-RF-103 | Indexar documentos y responder con citas (RAG) | Should | R2 | sin historia (R4) | `ia-extraccion-rag.md` | Pendiente (sin spec) |
| [ ] | TR-RF-104 | Medir consumo de IA y aplicar límites por tenant | Must | MVP | sin historia (R4) | `ia-pasarela-enmascarado-consumo.md` | Pendiente (sin spec) |
| [ ] | TR-RF-105 | Orquestar agente conversacional con confirmación | Should | R2 | sin historia (R4) | `ia-agente-conversacional.md` | Pendiente (sin spec) |

La hoja Módulos cita además «copiloto analítico» (TR-CA-255 lo nombra), sin RF propio; y IA-ARQ-01 dibuja «modelos predictivos (Python)», sin RF.

## Orden de construcción
| # | Spec propuesto | RF | h | Depende de |
|---|---|---|---|---|
| 1 | ia-pasarela-y-enmascarado | 100, 101 | 9-10 | 07, 09, 20a, 21 |
| 2 | ia-consumo-y-limites | 104 | 7-8 | 1, 12; TR-NOT (R2) o aviso solo en pantalla |
| 3 | ia-extraccion-documental | 102 | 7-8 | 1, TR-ARC (R2) |
| 4 | ia-conocimiento-rag | 103 | 10 | 1, TR-ARC, 09, 17c |
| 5 | ia-agente-orquestador | 105 (núcleo, chat web) | 10 | 1, 2, 20a |
| 6 | ia-agente-canales-derivacion | 105 (WhatsApp, derivación) | 8-10 | 5, 4, TR-NOT WhatsApp (R3) |

1 y 2 van primero porque todo pasa por la pasarela y el consumo limita el costo. 3 y 4 se pueden hacer en paralelo una vez exista TR-ARC. 5 y 6 al final: necesitan canales (R3) y suelen usar el RAG.

PL-10 no incluye TR-IA: al entrar, agregar `SEG --> IA`, `CFG --> IA`, `ARC --> IA`, `NOT --> IA` y `AUD` como consumidor de eventos de IA. Migraciones propuestas en el rango `db/04a_ia*.sql` (prefijo 04 para R4, a confirmar).
