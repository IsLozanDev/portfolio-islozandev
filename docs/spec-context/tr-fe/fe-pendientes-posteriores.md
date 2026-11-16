# Contexto para fe-pendientes-posteriores

Paquete de contexto (no es el spec). Reúne lo de TR-FE que el SRS pide y el plan no programa en R2, y el contexto de consumidor (SazónPOS CC-09, homologación) que no es un spec TR. Fuentes: `CLAUDE.md`, SRS (RF, Criterios GWT, Reglas de negocio, RNF, Componentes, Consumidores), `plan.md` (releases, R4, backlog R2/R3, riesgos), `3_plan.json`, diagramas CC-D02, CC-D07, CC-D09, CC-D10, PL-08, PL-10.

## 1. Alcance y dependencias
| Tema | SRS | Plan | Situación |
|---|---|---|---|
| Registro de ventas electrónico (TR-RF-064) | Could / R3 | Sin historia en R2 ni R3 | Backlog. Depende de TR-REP (R3-04) |
| Consulta pública de comprobantes en `<cod>-web` (RF-062 pasos 3-4, CA-158) | Should / MVP | Sin historia; `<cod>-web` llega con TR-CMS/TR-POR (R3-05, R3-07) | R3 o después |
| Facturar la suscripción del tenant (TR-RF-073, MOD-09) | Must / R2 | R4: «cobro automático de suscripciones»; sin historia | Fuera del plan; necesita FE + PAG |
| Reserva de bloques offline (TR-RF-038, MOD-04) | Should / R2 | Sin historia; TR-EDGE es R4 | Fuera del plan |
| Impresión ESC/POS y cajón (TR-RF-135, TR-EDGE) | — | R4 | Fuera; afecta CA-155 |
| Nota de débito (TR-RF-056) | Should / R2 | Sin historia | Propuesta dentro de `fe-notas-resumen-baja` (P1 de ese paquete) |
| SazónPOS CC-09 (R2-13) | — | Sprint 17, 12 h | Consumidor, no spec TR |
| Homologación con el PSE (R2-14) | — | Sprint 17, 4 h; riesgo: empezar en sprint 14 | Calidad, no spec TR |
| E2E de emisión y anulación (R2-15), pase R2 (R2-16), hipercuidado FE (R2-18) | — | Sprints 17-18 | Calidad y operación |

- Sin RF en el SRS (no inventar): guía de remisión, comprobantes de retención y percepción, detracciones, exportaciones, anticipos, ICBPER. El catálogo 01 importado los nombra, pero ningún RF de MOD-08 los emite.
- Constitución: igual que el resto de TR-FE; CC-09 sigue ADR-31 (SazónPOS integra por base compartida y API, sin cambiar de repo).

## 2. RF
| ID | Nombre | Permiso | App | RN | RNF | Actor |
|---|---|---|---|---|---|---|
| TR-RF-064 | Exportar registro de ventas electrónico | plat.fe.registro_ventas | APP-02 | TR-RN-047 | TR-RNF-017, 125 | ACT-06 |
| TR-RF-062 (parte pública) | Consulta pública de comprobantes | (público) | `<cod>-web` | TR-RN-027 | TR-RNF-004, 015 | Cliente final |
| TR-RF-073 | Facturar y cobrar la suscripción del tenant | plat.facturacion.gestionar | APP-01 | TR-RN-005, 021 | (ver SRS) | Admin de plataforma, planificador |
| TR-RF-038 | Reservar bloques de numeración offline | plat.serie.reservar_bloque | — | TR-RN-046 | TR-RNF-108, 103 | Agente local |

- **064**: empresa y periodo (AAAA-MM), formato SIRE_TXT|EXCEL; consolida aceptados, anulados y notas; genera archivo y resumen Excel; audita. El SRS dice «verificar estructura vigente» de SIRE.
- **062 pública**: RUC emisor, tipo, serie, número, fecha y total; valida y permite descargar PDF y XML. Endpoint público con límite de tasa.
- **073**: calcula el cargo mensual por tenant (planes + excedentes de DNI/RUC, mensajes, almacenamiento), **emite el comprobante de la plataforma con TR-FE**, cobra por recurrencia o link de pago, y ante impago dispara el vencimiento de TR-ORG. La plataforma es un emisor más (tenant operador).
- **038**: el agente reserva rangos de una serie offline (B901) y los concilia al sincronizar. Relevante para FE en contingencia sin internet (RN-046: hasta 72 h).

## 3. Criterios GWT
- **TR-CA-161** (064, Positivo): 2 450 comprobantes en 2026-09 -> archivo con 2 450 filas y totales que cuadran con el tablero.
- **TR-CA-162** (064, Borde): sin comprobantes en 2026-08 -> archivo vacío con «Sin operaciones».
- **TR-CA-158** (062 pública, Negativo): total S/ 45,00 en vez de 45,50 -> «No se encontró el comprobante con los datos ingresados».
- **TR-CA-182 / 183** (073): cargo con excedente de mensajes cobrado con tarjeta; cobro rechazado -> PENDIENTE y link de pago.
- **TR-CA-098 / 099** (038): reserva de 200 números; número fuera de rango rechazado con alerta.
- CC-09 y homologación: sin GWT en el SRS. Proponer para CC-09: venta cobrada en caja emite boleta B### con el número impreso en el ticket; venta > S/ 700 sin DNI pide documento; anulación de venta emite NC tipo 01; caída del PSE no bloquea el cobro (RNF-007); reintento de la caja no duplica el comprobante (clave de idempotencia = id del pago).

## 4. Reglas y RNF
| ID | Texto corto |
|---|---|
| TR-RN-047 | Exportaciones con datos personales: permiso específico, auditadas, expiran a las 72 h (064). |
| TR-RN-046 | Agente offline hasta 72 h con bloques reservados; la nube prevalece al reconectar (038). |
| TR-RN-005 | (073) Reglas de suscripción y vencimiento de TR-ORG. |
| TR-RNF-125 | Motor de reportes: síncrono <= 10 000 filas en < 10 s; asíncrono hasta 1 000 000 en < 5 min (064). |
| TR-RNF-004 / 015 | Core Web Vitals y límite de tasa en la consulta pública. |
| TR-RNF-017 | 100 % aceptados en homologación (R2-14). |

## 5. Historia del backlog (3_plan.json)
| ID | Sprint | Horas | Componente | Historia | rf | Tipo | Release |
|---|---|---|---|---|---|---|---|
| R2-13 | 17 | 12 | SazónPOS | CC-09 Facturación electrónica desde la caja | CC-09 | SazónPOS | R2 |
| R2-14 | 17 | 4 | Calidad | Homologación con el PSE en ambiente beta | — | QA | R2 |
| R2-15 | 17 | 4 | Calidad | Pruebas E2E de emisión y anulación | — | QA | R2 |
| R2-16 | 18 | 3 | SazónPOS | Pase a producción R2 | — | Ops | R2 |
| R2-18 | 18 | 8 | Calidad | Hipercuidado de facturación electrónica | — | QA | R2 |

Sin historia: TR-RF-064, consulta pública, TR-RF-073, TR-RF-038. Hito H4 (30/06/2027): «Boletas y facturas aceptadas por el OSE desde la caja de SazónPOS».

## 6. Tablas SQL, eventos, puertos y permisos
- **064**: sin tablas nuevas (consulta sobre `fe.comprobante`); exportación por TR-REP (R3) o XLSX/TXT síncrono con `exceljs`; permiso `plat.fe.registro_ventas` (sensible por RN-047).
- **Consulta pública**: endpoint `@Publico` `POST /v1/publico/fe/consulta` con límite de tasa (RNF-015) y captcha a decidir; devuelve URL firmada de ARC. Vive en la API; la página en `<cod>-web`.
- **073**: emisor de la plataforma = empresa del tenant operador; usa `ComprobantePort.emitir` como cualquier producto; eventos de TR-PAG (`pago.confirmado`).
- **CC-09 (SazónPOS)**: según CC-D07, los triggers de SazónPOS ya escriben `rest.pago.*` en `sync.outbox` (CC-07, spec 25); CC-D07 dibuja `outbox -> Facturación electrónica (CC-09)`. Contrato propuesto en `fe-boleta-factura-cdr` P1: la caja llama `POST /v1/fe/comprobantes` con clave de idempotencia tras confirmar el pago; el outbox queda de respaldo. Mapeo: restaurante = sucursal (CC-01), correlativos (CC-03), catálogos UNIDAD_MEDIDA/AFECTACION_IGV (CC-04, CC-D02 «columnas tax_rate»), parámetros (CC-05), personas (CC-06, R2-12) para el adquirente.

## 7. Código base relacionado
- Specs 22 a 26 (SazónPOS R1) siguen Pendientes en `docs/roadmap-specs.md`: CC-09 depende de CC-03, 04, 05, 06 y 07 (CC-D09), es decir de los specs 22, 25 y del CC-06 de R2 (R2-12).
- `auditoria` 20b: exportación XLSX síncrona con límite, modelo para 064.
- `seguridad`: `@Publico` para la consulta pública (spec 05).
- No existe nada de TR-REP, TR-POR, TR-CMS, TR-PAG ni TR-EDGE.

## 8. Diagramas relevantes
- `7_Control_Cambios_SazonPOS/CC-D02_Situacion_actual_y_situacion_objetivo.mmd` («sin comprobantes electrónicos» -> CC-09).
- `7_Control_Cambios_SazonPOS/CC-D07_CC_07_Eventos_de_dominio_desde_triggers.mmd`.
- `7_Control_Cambios_SazonPOS/CC-D09_Dependencias_entre_solicitudes_de_cambio.mmd` (CC-03 a CC-07 -> CC-09).
- `7_Control_Cambios_SazonPOS/CC-D10_Cronograma_propuesto.mmd` (CC-09: 25 días en el cronograma original).
- `9_Plan_Implementacion/PL-08_Integracion_de_SazonPOS_con_la_plataforma.mmd`, `PL-01_Hoja_de_ruta_de_releases.mmd`.
- `8_Diseno_Piloto/2_Plataforma_Transversal/T-S4_Secuencia_Pago_en_linea_con_confirmacion_por_webhook.mmd` (073 y notas por reembolso).
- No hay diagrama de secuencia propio de CC-09 ni documento de control de cambios con su detalle.

## 9. Ambigüedades y preguntas candidatas
Ambigüedades:
- TR-RF-073 es Must/R2 en el SRS, pero el plan lo deja en R4 («cobro automático de suscripciones»). Manda el plan.
- TR-RF-062 es Should/MVP, pero su consulta pública necesita un sitio que llega en R3.
- CC-09 tiene 12 h y supera el tope de 10 h; no hay documento de detalle (solo diagramas CC-D*).
- La homologación (R2-14, sprint 17) choca con el riesgo del plan, que pide empezarla en el sprint 14.

Preguntas candidatas, con recomendación:
1. **¿064 entra en R2 o R3?** Recomendación: no; queda en backlog para cuando exista TR-REP (R3-04) y se haya verificado la estructura vigente de SIRE. El monitor (063) con exportación XLSX cubre la necesidad operativa.
2. **¿Consulta pública?** Recomendación: dejar el endpoint público para cuando haya `<cod>-web` (R3); en R2 el cliente recibe el PDF por correo (062) y el XML por enlace.
3. **¿073 (facturar a los tenants)?** Recomendación: fuera del plan (R4). Mientras tanto, la plataforma factura a sus clientes con un tenant operador que usa SazónPOS u otro emisor manual.
4. **¿Partir CC-09?** Recomendación: dos specs de SazónPOS: (a) emisión desde el cobro (boleta/factura, idempotencia por id de pago, impresión del PDF de 80 mm) unas 7 h; (b) anulación por NC, reimpresión y estado del comprobante en la caja, unas 5 h. Ambos tras `fe-boleta-factura-cdr`, `fe-representacion-impresa` y `fe-notas-resumen-baja`.
5. **¿Cuándo homologar?** Recomendación: abrir la cuenta beta del PSE en el sprint 13 y correr el set de pruebas del proveedor desde `fe-puerto-pse-adaptador` (sprint 14), como pide el riesgo; R2-14 queda como cierre con evidencia.
6. **¿Operación offline (038)?** Recomendación: fuera de R2. Sin internet la caja no emite FE en línea; el comprobante queda en la cola de SazónPOS hasta reconectar. Documentarlo como límite conocido de H4.
