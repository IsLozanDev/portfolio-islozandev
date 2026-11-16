# Contexto para fe-contingencia-monitor

Paquete de contexto (no es el spec). Fuentes: `CLAUDE.md` (diseño UI, verificación con Playwright), SRS (RF, Criterios GWT, RNF, Trazabilidad), `plan.md`, `3_plan.json`, diagramas T-S3, OP-01, OP-03, PL-10, código real (`eventos`, `observabilidad`, `auditoria`, `shared/ui`, `admin-cliente`).

## 1. Alcance y dependencias
- Historia **R2-08** (sprint 15, 6 h, **Full**, R2): «Reintentos, contingencia y monitor de pendientes y rechazados», TR-RF-060, 063.
- Depende de `fe-envio-cdr` (cola de envío y estados) y, para el monitor, de `fe-notas-resumen-baja` (estados ANULADO, resúmenes) y TR-ARC (descarga de XML y CDR). La UI depende de los specs 15/15b-d (shell, `shared/ui`) y 17c (`admin-cliente`).
- Horas: 6 h en el plan; realista 14-16 h (back de contingencia, API del monitor, dos pantallas). Partición:

| Parte | Slug | RF | h | Depende de |
|---|---|---|---|---|
| A | fe-reintentos-contingencia | 060 | 5-6 | fe-envio-cdr |
| B | fe-monitor-api | 063 back | 4-5 | fe-envio-cdr, fe-notas-resumen-baja, ARC |
| C | fe-monitor-ui | 063 front (+ acciones de baja y NC del encargado, ver P5) | 5-6 | B, 15, 17c |

- Áreas A: (a) calendario de reintentos por comprobante, (b) circuito por proveedor compartido entre workers, (c) vigilancia de plazo con alerta. Áreas B: (a) listado paginado con totales por estado, (b) detalle con error, descarga y reenvío, (c) exportación. Áreas C: (a) lista, (b) detalle, (c) acciones.
- Fuera de alcance: ticket P2 automático en TR-SOP (R3, R3-08) y alertas de negocio de TR-OBS (R3-10); exportación por el motor TR-REP (R3-04).
- Constitución: 1, 2, 3, 5, 10, 11; estructura de libs Angular, diseño UI y verificación con Playwright de `CLAUDE.md`.

## 2. RF
| ID | Nombre | Permiso | App | RN | RNF | Actor |
|---|---|---|---|---|---|---|
| TR-RF-060 | Reintentar envíos y operar en contingencia | plat.sistema.job | APP-03 | TR-RN-020 | TR-RNF-105, 007 | ACT-15, ACT-09 |
| TR-RF-063 | Monitorear comprobantes pendientes y rechazados | plat.fe.monitorear | APP-02 | TR-RN-020 | TR-RNF-002, 104 | ACT-06 |

- **060**: error técnico (timeout, 5xx) -> reintentos a 1, 5, 15 y 60 min y luego cada hora; si falla el 50 % de envíos en 5 min, abre el circuito y pausa 5 min; los productos siguen emitiendo y la cola crece; a 24 h del vencimiento del plazo de envío, alerta y ticket P2. Datos: `intentos`, `proximo_intento`, `estado_circuito` (CERRADO|ABIERTO|SEMIABIERTO), `vence_envio`. Componentes TR-FE, TR-OBS, TR-SOP. Procesos TR-P04, TR-P09.
- **063**: filtros fecha_desde/hasta, sucursal, tipo (01|03|07|08), estado (PENDIENTE_ENVIO|ENVIADO|ACEPTADO|ACEPTADO_CON_OBSERVACIONES|RECHAZADO|ANULADO); totales por estado y lista paginada; detalle con error; reenvío de fallidos técnicos; descarga de XML y CDR; exportación. Componentes TR-FE, TR-REP. Procesos TR-P04, TR-P13.

## 3. Criterios GWT
- **TR-CA-153** (060, Positivo): OSE caído 2 h con 140 en cola; al volver -> los 140 se envían y obtienen estado final.
- **TR-CA-154** (060, Borde): factura cerca de vencer, faltan 24 h -> alerta CRITICA y ticket P2 para el tenant.
- **TR-CA-159** (063, Positivo): 3 rechazados en la semana, filtro RECHAZADO -> se listan los 3 con código y descripción.
- **TR-CA-160** (063, Negativo): reenviar una factura RECHAZADA por datos -> «Un comprobante rechazado no se reenvía; emita uno nuevo corregido».
- Faltan (proponer): circuito abierto no llama al proveedor durante 5 min y pasa a SEMIABIERTO con un envío de prueba; un rechazo de validación no cuenta como fallo para el circuito; dos workers comparten el estado del circuito; reintento con la misma clave no duplica el envío (el proveedor recibe el mismo serie-número); prueba de caos de RNF-105 (OSE simulado caído 6 h, 0 vencidos); reenvío manual de un PENDIENTE técnico sí procede; totales por estado cuadran con la lista; supervisor de sucursal solo ve su sucursal; listado p95 < 1,5 s con 100 000 comprobantes (RNF-002); UI en tema claro y oscuro y a 600 px.

## 4. Reglas y RNF
| ID | Texto corto |
|---|---|
| TR-RN-020 | Plazos máximos de envío y baja (verificar vigentes): base de `vence_envio`. |
| TR-RNF-105 | Cola persistente ante caída del OSE; 0 vencidos; alerta a 24 h; prueba de caos con OSE caído 6 h. |
| TR-RNF-007 | Timeout, backoff y circuit breaker; la caída no bloquea la venta. |
| TR-RNF-104 | >= 99 % con estado final en <= 10 min; 0 perdidos; tablero y conciliación diaria emitidos vs CDR. |
| TR-RNF-002 | Listados paginados p95 < 1,5 s con 100 000 registros por tenant. |
| TR-RN-047 | Exportación con datos personales (adquirentes con DNI): permiso de exportación, auditada; archivo expira a las 72 h. |

Heredados por CLAUDE.md: 001, 008, 010, 012, 013/112, 024/119, 025, 026, 101, 106.

## 5. Historia del backlog (3_plan.json)
| ID | Sprint | Horas | Componente | Historia | rf | Tipo | Release |
|---|---|---|---|---|---|---|---|
| R2-08 | 15 | 6 | TR-FE | Reintentos, contingencia y monitor de pendientes y rechazados | TR-RF-060, 063 | Full | R2 |

Relacionadas: R2-18 (hipercuidado de FE, 8 h: el monitor es su herramienta), R3-08 (soporte con tickets), R3-10 (alertas de negocio), R3-04 (TR-REP).

## 6. Tablas SQL, eventos, puertos y permisos
- **Columnas en `fe.comprobante`**: `intentos`, `proximo_intento_en`, `vence_envio_en` (fecha de emisión + plazo del parámetro), `ultimo_error_tecnico`. Índices `(tenant_id, estado, fecha_emision)` y `(tenant_id, sucursal_id, fecha_emision)` para el monitor.
- **Circuito**: estado en Redis por proveedor y ambiente (no en BD: es efímero y compartido por los workers). Contadores de ventana de 5 min.
- **`fe.alerta_plazo`**: idempotencia de la alerta de 24 h por comprobante.
- **Eventos** (no están en el SRS; proponer): `cpe.envio_por_vencer` (alerta CRITICA; lo consumen TR-NOT en R2 y TR-SOP en R3), `fe.circuito.abierto` y `fe.circuito.cerrado` (métricas y logs).
- **Puertos**: `PseOsePort` (envío); `ArchivoPort` (descarga); `EscritorExportacion` (XLSX con `exceljs`, ya en `package.json`).
- **Permisos** (SRS): `plat.fe.monitorear`. Faltan en el SRS: permiso para reenviar (proponer que lo cubra `plat.fe.monitorear` o `plat.fe.reenviar`) y para exportar (RN-047; proponer `plat.fe.exportar`, sensible).
- **Endpoints**: `GET /v1/fe/comprobantes` (filtros, paginación, totales), `GET /v1/fe/comprobantes/totales`, `GET /v1/fe/comprobantes/{id}`, `POST /v1/fe/comprobantes/{id}/reenvio`, `GET .../xml`, `GET .../cdr`, `GET /v1/fe/comprobantes/exportacion`.
- **Frontend**: lib feature nueva (proponer `libs/plataforma/admin-fe`, `type:feature`, o páginas dentro de `admin-cliente`; ver `fe-admin-ui` P1). Páginas `comprobantes-lista` y `comprobante-detalle`; opción de menú nueva en el manifiesto PLAT (módulo «Facturación electrónica»).

## 7. Código base relacionado
- **EVT (11)**: `PoliticaReintentos` (`intentos`, `esperaBaseMs`, `esperaMaximaMs`, exponencial) para el relay; el calendario fijo 1/5/15/60 min de RF-060 no encaja tal cual: se programa con trabajos diferidos de BullMQ (`bullmq 6.3.11`). `ListarFallidos`/`ReprocesarFallidos` son el modelo del reenvío manual.
- **OBS (21)**: `observabilidad` exporta logs redactados (`CAMPOS_SENSIBLES`, `hashDocumento`), `registrarMetricasOutbox` (modelo para métricas del circuito y de la cola FE). No hay motor de alertas de negocio (R3).
- **AUD (20b)**: consulta paginada con alcance de sucursal (`SucursalFueraDeAlcanceError`) y exportación XLSX auditada con límite (`ExportacionDemasiadoGrandeError`, `escritor-auditoria.xlsx.ts`): patrón directo para 063.
- **UI**: `shared/ui` exporta `TablaComponent` (`vit-tabla`), `FiltrosComponent`, `ChipEstadoComponent` + `TonoEstado`, `EstadoVacioComponent`, `CargandoComponent`, `AvisosService`, `PanelLateralService`. Referencia de lista y detalle con filtros: `admin-cliente/src/lib/pages/auditoria-lista` y `auditoria-detalle` (spec 20c).
- **No existe**: nada de FE.

## 8. Diagramas relevantes
- `8_Diseno_Piloto/2_Plataforma_Transversal/T-S3_Secuencia_Emision_de_comprobante_electronico.mmd` (rama «rechazado o sin respuesta»: backoff máx. 5, luego alerta).
- `6_Plataforma_Operacion/OP-01_Mapa_de_la_plataforma_de_operacion.mmd` y `OP-03_Secuencia_de_la_caida_de_pedidos_al_ticket_con_su_traza.mmd` (alerta -> ticket, R3).
- `6_Plataforma_Operacion/OP-12_Modelo_de_datos_del_Centro_de_Soporte_y_de_la_observabilidad_de_negoci.mmd`.
- Canvas «Vitrina · Diseño UI» (pantallas tipo lista y detalle).

## 9. Ambigüedades y preguntas candidatas
Ambigüedades:
- RF-060 pide «ticket P2» (TR-SOP, R3) y «alerta CRITICA» (TR-OBS de negocio, R3): en R2 no hay quién los reciba.
- T-S3 dice «máx. 5» reintentos; RF-060 reintenta indefinidamente cada hora hasta el plazo.
- R2-08 es «Full» con 6 h: el front del monitor no tiene horas reales.
- RF-063 exporta con TR-REP (R3).
- El reenvío manual no tiene permiso propio.

Preguntas candidatas, con recomendación:
1. **¿Alerta y ticket en R2?** Recomendación: evento `cpe.envio_por_vencer` + log de error con nivel crítico (Sentry ya está, spec 21) + aviso en el monitor; TR-NOT envía el correo al encargado en R2-09; el ticket P2 lo crea TR-SOP como consumidor en R3.
2. **¿Reintentos hasta cuándo?** Recomendación: calendario del SRS (1, 5, 15, 60 min y luego cada hora) hasta `vence_envio_en`; T-S3 queda desactualizado. Pasado el plazo, estado se mantiene PENDIENTE_ENVIO con marca `vencido` visible en el monitor.
3. **¿Circuito dónde?** Recomendación: en Redis por proveedor y ambiente, implementado en el adaptador (infraestructura), con estados CERRADO/ABIERTO/SEMIABIERTO del SRS; el dominio solo ve `ERROR_TECNICO`.
4. **¿Exportación sin TR-REP?** Recomendación: XLSX síncrono con límite de filas y auditoría, igual que auditoría (20b); sin archivo persistido ni expiración de 72 h hasta TR-ARC/TR-REP. Documentar la desviación de RN-047.
5. **¿Acciones del encargado en el detalle?** Recomendación: el detalle concentra reenviar, descargar XML/CDR/PDF, comunicar baja (058) y emitir NC manual (055, ACT-06), con `AvisosService` destructivo y motivo (RNF-021). Si C pasa de 10 h, baja y NC van a un spec propio.
6. **¿Permisos faltantes?** Recomendación: `plat.fe.monitorear` cubre listar, ver y descargar; `plat.fe.reenviar` para el reenvío; `plat.fe.exportar` (sensible) para la exportación con datos personales.
7. **¿Conciliación diaria emitidos vs CDR (RNF-104)?** Recomendación: tarea diaria que cuenta comprobantes sin estado final a más de 10 min y lo publica como métrica; sin RF propio, entra en A si cabe.
