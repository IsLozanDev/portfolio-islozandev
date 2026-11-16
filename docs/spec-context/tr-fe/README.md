# TR-FE · Facturación electrónica (MOD-08): paquetes de contexto

Paquetes de contexto para `/spec` (no son specs). Cubren TR-RF-052 a 064, las historias R2-04 a R2-08, la parte FE de R2-09 y R2-11, y el contexto de consumidor (CC-09, homologación). Fuentes: SRS, `plan.md`, `3_plan.json`, diagramas T-06, T-S3, CC-D*, PL-10, `specs/10`, `specs/19a`, `specs/19b`, código real.

## Checklist de RF
| RF | Nombre | Prioridad | Fase SRS | Historia del plan | Archivo de contexto | Estado |
|---|---|---|---|---|---|---|
| TR-RF-052 | Configurar emisor electrónico | Must | MVP | R2-04 (back), R2-11 (UI) | `fe-emisor-y-puerto-pse.md`, `fe-admin-ui.md` | Pendiente |
| TR-RF-053 | Emitir factura electrónica | Must | MVP | R2-05 | `fe-boleta-factura-cdr.md` | Pendiente |
| TR-RF-054 | Emitir boleta de venta electrónica | Must | MVP | R2-05 | `fe-boleta-factura-cdr.md` | Pendiente |
| TR-RF-055 | Emitir nota de crédito | Must | MVP | R2-07 | `fe-notas-resumen-baja.md` | Pendiente |
| TR-RF-056 | Emitir nota de débito | Should | R2 | Sin historia (propuesta en R2-07) | `fe-notas-resumen-baja.md` | Pendiente |
| TR-RF-057 | Enviar resumen diario de boletas | Must | MVP | R2-07 | `fe-notas-resumen-baja.md` | Pendiente |
| TR-RF-058 | Comunicar baja de comprobantes | Must | MVP | R2-07 | `fe-notas-resumen-baja.md` | Pendiente |
| TR-RF-059 | Procesar respuesta y CDR del OSE | Must | MVP | R2-05 | `fe-boleta-factura-cdr.md` | Pendiente |
| TR-RF-060 | Reintentar envíos y operar en contingencia | Must | MVP | R2-08 | `fe-contingencia-monitor.md` | Pendiente |
| TR-RF-061 | Generar representación impresa | Must | MVP | R2-06 | `fe-representacion-impresa.md` | Pendiente |
| TR-RF-062 | Entregar comprobante al cliente | Should | MVP | R2-09 (historia de TR-NOT) | `fe-entrega-comprobante.md`; consulta pública en `fe-pendientes-posteriores.md` | Pendiente |
| TR-RF-063 | Monitorear comprobantes pendientes y rechazados | Must | MVP | R2-08 | `fe-contingencia-monitor.md` | Pendiente |
| TR-RF-064 | Exportar registro de ventas electrónico | Could | R3 | Sin historia | `fe-pendientes-posteriores.md` | Pendiente |

Criterios GWT del SRS: TR-CA-133 a 162 (30), todos «Pendiente». Relacionados fuera de MOD-08: TR-RF-035 (UI de series, deuda de R1), TR-RF-038 (bloques offline), TR-RF-073 (facturar la suscripción del tenant).

## Specs propuestos (cada uno <= 10 h)
| # | Slug | RF | h | Historia | Archivo |
|---|---|---|---|---|---|
| 1 | fe-emisor-configuracion | 052 (1-3, alerta) | 7-8 | R2-04 | fe-emisor-y-puerto-pse |
| 2 | fe-puerto-pse-adaptador | 052 (4-5) | 5-6 | R2-04 | fe-emisor-y-puerto-pse |
| 3 | cat-tablas-sunat-fe | (028 extendido) | 3-4 | — | fe-boleta-factura-cdr |
| 4 | fe-emision-boleta-factura | 053, 054 | 9-10 | R2-05 | fe-boleta-factura-cdr |
| 5 | fe-envio-cdr | 059 | 6-7 | R2-05 | fe-boleta-factura-cdr |
| 5b | fe-ubl-firma (condicional) | 053/054 UBL y firma | 8-10 | R2-05 | fe-boleta-factura-cdr |
| 6 | fe-representacion-impresa | 061 | 6-7 | R2-06 | fe-representacion-impresa |
| 7 | fe-notas-credito-debito | 055 (+056) | 7-8 | R2-07 | fe-notas-resumen-baja |
| 8 | fe-resumen-diario-baja | 057, 058 | 8-9 | R2-07 | fe-notas-resumen-baja |
| 9 | fe-reintentos-contingencia | 060 | 5-6 | R2-08 | fe-contingencia-monitor |
| 10 | fe-monitor-api | 063 back | 4-5 | R2-08 | fe-contingencia-monitor |
| 11 | fe-monitor-ui | 063 front (+ baja y NC manual) | 5-6 | R2-08 | fe-contingencia-monitor |
| 12 | fe-entrega-comprobante | 062 (correo) | 3-4 | R2-09 | fe-entrega-comprobante |
| 13 | seq-series-ui | UI de 035 | 4-5 | D-05 (R1) | fe-admin-ui |
| 14 | fe-admin-emisor-ui | UI de 052 | 5-7 | R2-11 | fe-admin-ui |

Total: 77-92 h (85-102 h con 5b). El plan asigna a FE unas 39 h (R2-04 6, R2-05 10, R2-06 4, R2-07 8, R2-08 6, más la parte FE de R2-09 y R2-11). La diferencia viene de bóveda de secretos, adaptador real, catálogos SUNAT faltantes, UI sin horas reales y la pantalla de series que nadie cubrió en R1. Con la capacidad del plan (20 h por sprint) no cabe en los sprints 14-16: hay que replanificar H4 o recortar (ver dudas).

## Orden de construcción y dependencias
Implementado y reutilizable: kernel, ORG, SEG, CFG (09), SEQ (10), EVT (11), CAT (19a-19e), AUD (20a-20c), OBS (21).
Requisitos de R2 previos: TR-IDN (R2-02, RUC con padrón; puerto nulo admitido), TR-ARC (R2-03, XML/CDR/PDF/logo), TR-NOT (R2-09, solo para 12 y las alertas). TR-PER (R2-01) no es requisito si el adquirente se guarda como valor (PL-10 lo dibuja como dependencia).

```
1 fe-emisor-configuracion ──> 2 fe-puerto-pse-adaptador ──┐
3 cat-tablas-sunat-fe ────────────────────────────────────┤
TR-IDN (o puerto nulo) ───────────────────────────────────┴──> 4 fe-emision-boleta-factura (+5b si OSE/SUNAT directo)
TR-ARC ──> 5 fe-envio-cdr <── 4
TR-ARC ──> 6 fe-representacion-impresa <── 4
5 ──> 7 fe-notas-credito-debito ──> 8 fe-resumen-diario-baja
5 ──> 9 fe-reintentos-contingencia
5, 8, TR-ARC ──> 10 fe-monitor-api ──> 11 fe-monitor-ui (15, 17c)
TR-NOT, 5, 6 ──> 12 fe-entrega-comprobante
SEQ (spec 10, implementado) y 17c ──> 13 seq-series-ui ; 1, 2 ──> 14 fe-admin-emisor-ui
4, 6, 7 + specs 22/25 + CC-06 ──> CC-09 SazónPOS (R2-13) ──> R2-14 homologación, R2-15 E2E
```

Paralelizable: 1 y 3; 6 con 5; 9 con 7; 13 en cualquier momento (solo necesita SEQ y 17c).

## Decisiones transversales que bloquean la redacción
1. PSE con API JSON vs OSE vs SUNAT directo (define si existe 5b y si el certificado se usa).
2. Emisión síncrona (número al instante, envío asíncrono) vs asíncrona por outbox (T-S3, CC-D07) y cómo llama SazónPOS.
3. Gestor de secretos para RNF-113 (cifrado por sobre en la app vs Supabase Vault).

## Archivos
- `fe-emisor-y-puerto-pse.md` · `fe-boleta-factura-cdr.md` · `fe-representacion-impresa.md` · `fe-notas-resumen-baja.md` · `fe-contingencia-monitor.md` · `fe-entrega-comprobante.md` · `fe-admin-ui.md` · `fe-pendientes-posteriores.md`.
