# Contexto para fe-boleta-factura-cdr

Paquete de contexto (no es el spec). Fuentes: `CLAUDE.md`, `docs/roadmap-specs.md`, SRS (RF, Criterios GWT, Reglas de negocio, RNF, Componentes, Consumidores), `plan.md`, `3_plan.json`, diagramas T-06, T-S3, CC-D07, CC-D09, PL-10, `specs/10-seq-correlativos.md`, `specs/19a-cat-catalogos-nucleo.md`, `specs/19b-cat-importador-oficiales.md`, `docs/datos-oficiales/FUENTES.md`, código real.

## 1. Alcance y dependencias
- Historia **R2-05** (sprint 14, 10 h, Back, R2): «Emitir boleta y factura; procesar CDR», TR-RF-053, 054, 059. Es el corazón de TR-FE y el que habilita el hito H4 (30/06/2027: «boletas y facturas aceptadas por el OSE desde la caja de SazónPOS»).
- Depende de `fe-emisor-y-puerto-pse` (emisor + `PseOsePort`), 10 (SEQ, implementado), 19a/19b (CAT, implementado), 09 (CFG), 11 (outbox/relay), 20a (AUD). De R2: TR-IDN (R2-02) para RN-019 y TR-ARC (R2-03) para guardar XML y CDR. PER no es necesario si el adquirente se guarda como valor (ver P5).
- Horas: 10 h en el plan; realista 16-20 h (más 8-10 si la plataforma genera y firma el UBL, ver P1 del emisor). Partición:

| Parte | Slug | RF | h | Depende de |
|---|---|---|---|---|
| 0 | cat-tablas-sunat-fe | Extensión de TR-RF-028 para FE | 3-4 | 19b |
| A | fe-emision-boleta-factura | 053, 054 | 9-10 | emisor (A y B), 0, 10, 09, IDN (o puerto nulo) |
| B | fe-envio-cdr | 059 | 6-7 | A, ARC (R2-03), 11 |
| C (condicional) | fe-ubl-firma | parte UBL/firma de 053/054 | 8-10 | A; solo si P1 del emisor = OSE o SUNAT directo |

- Áreas A: (a) agregado `Comprobante` con líneas, cálculo de IGV y validaciones normativas, (b) numeración con `CorrelativoPort` e idempotencia, (c) `ComprobantePort.emitir` + `POST /v1/fe/comprobantes` + `cpe.emitido`. Áreas B: (a) worker de envío con BullMQ, (b) guardado de XML y CDR en ARC con hash, (c) estados finales y eventos.
- Fuera de alcance: notas (055/056), resumen (057), baja (058), reintentos con circuito (060: aquí solo un intento con error técnico que deja el comprobante en cola), PDF (061), entrega (062), monitor (063).
- Constitución: 1, 2, 3, 4 (outbox en la misma tx), 5, 6, 8, 10, 11. RNF-008 obligatorio (clave de idempotencia).

## 2. RF
| ID | Nombre | Permiso | App | RN | RNF | Actor |
|---|---|---|---|---|---|---|
| TR-RF-053 | Emitir factura electrónica | plat.fe.emitir | APP-03 | TR-RN-017, 019, 021, 016 | TR-RNF-017, 008, 104 | Módulo de producto, usuario operativo |
| TR-RF-054 | Emitir boleta de venta electrónica | plat.fe.emitir | APP-03 | TR-RN-017, 018, 021 | TR-RNF-017, 001 | Módulo de producto, usuario operativo |
| TR-RF-059 | Procesar respuesta y CDR del OSE | plat.sistema.job | APP-03 | TR-RN-022 | TR-RNF-104, 007 | Planificador (ACT-15), PSE/OSE (ACT-09) |

- **053**: precondición emisor en beta o producción y serie F### de la sucursal. Flujo: cabecera (adquirente, moneda, forma de pago CONTADO o CREDITO con cuotas) y líneas (código, descripción, unidad, cantidad, valor unitario, afectación); valida RUC con TR-IDN y códigos con catálogos SUNAT; calcula con RN-021; numera con TR-SEQ, genera y firma el XML, estado PENDIENTE_ENVIO; publica `cpe.emitido` y encola. Datos: `tipo 01`, `serie F###`, `moneda PEN|USD`, `cuotas[]` si crédito, `lineas[]` (unidad UNIDAD_MEDIDA, cantidad > 0, valor_unitario >= 0, afectación AFECTACION_IGV), `clave_idempotencia` uuid. Salida: F###-######## con XML firmado y en cola.
- **054**: serie B###; adquirente opcional según monto (RN-018); `modo_envio` INDIVIDUAL|RESUMEN. Salida: boleta con XML firmado.
- **059**: el worker toma el comprobante, lo envía al adaptador, guarda XML y CDR en TR-ARC con hash, actualiza estado (ACEPTADO, ACEPTADO_CON_OBSERVACIONES, RECHAZADO) con códigos y observaciones, publica `cpe.aceptado` o `cpe.rechazado`. Datos: `codigo_respuesta`, `descripcion`, `observaciones[]`, `cdr_archivo_id`.
- Interfaz SRS: `ComprobantePort.emitir()` y eventos `cpe.aceptado`/`cpe.rechazado` (hoja Consumidores: REST, PSI, LIB, CLI y LEX integran; GYM y ECO consumen).

## 3. Criterios GWT
- **TR-CA-136** (053, Positivo): serie F001 con último 99; factura a RUC 20512345678, 2 líneas, valor de venta S/ 100,00 -> F001-00000100, IGV 18,00, total 118,00, PENDIENTE_ENVIO.
- **TR-CA-137** (053, Negativo): adquirente con DNI -> «La factura requiere RUC del adquirente».
- **TR-CA-138** (053, Borde): misma clave de idempotencia -> devuelve la factura existente sin otro número.
- **TR-CA-139** (054, Positivo): S/ 45,50 sin adquirente -> «Clientes varios» y documento 0.
- **TR-CA-140** (054, Negativo): S/ 850,00 sin adquirente -> «Boletas mayores a S/ 700,00 requieren documento y nombre del adquirente».
- **TR-CA-141** (054, Borde): exactamente S/ 700,00 sin adquirente -> se emite.
- **TR-CA-150** (059, Positivo): B002-00000125, OSE responde 0 -> ACEPTADO, CDR guardado, `cpe.aceptado`.
- **TR-CA-151** (059, Negativo): unidad inexistente, rechazo -> RECHAZADO con código y descripción, `cpe.rechazado`.
- **TR-CA-152** (059, Borde): observación no bloqueante -> ACEPTADO_CON_OBSERVACIONES mostrando la observación.
- Faltan (proponer): RUC no ACTIVO o NO HABIDO -> advertencia, no rechazo (RN-019); línea con código de afectación inexistente -> 422 antes de numerar; tolerancia de S/ 0,01 entre suma de líneas y total (RN-021); factura a crédito sin cuotas o con cuotas que no suman el total; emisor en BORRADOR -> 409; serie de otra sucursal -> 403/422; rollback de la tx no consume número (ya probado en SEQ, TR-CA-095); error técnico del PSE deja PENDIENTE_ENVIO sin perder el comprobante; mismo CDR procesado dos veces no duplica eventos (idempotencia por `event_id`); aislamiento por tenant.

## 4. Reglas y RNF
| ID | Texto corto |
|---|---|
| TR-RN-016 | Numeración atómica por empresa, tipo y serie, sin duplicados ni huecos (SEQ ya lo cumple). |
| TR-RN-017 | Series de 4 caracteres: F### facturas y sus notas, B### boletas y sus notas; correlativo hasta 8 dígitos. |
| TR-RN-018 | Boleta con total > S/ 700,00 exige tipo y número de documento y nombres (monto «verificar vigente»). |
| TR-RN-019 | Factura exige RUC; advertir si el RUC no está ACTIVO o está NO HABIDO según el padrón. |
| TR-RN-021 | IGV con tasa vigente parametrizada (18 %) o reducida del régimen; redondeo a 2 decimales por línea y total; tolerancia S/ 0,01. |
| TR-RN-022 | Un comprobante aceptado no se modifica ni elimina. |
| TR-RNF-017 | UBL 2.1 y catálogos oficiales; 100 % aceptados en homologación. |
| TR-RNF-008 | Idempotencia por clave; 0 duplicados en pruebas de reintento. |
| TR-RNF-104 | >= 99 % con estado final en <= 10 min; 0 comprobantes perdidos; conciliación diaria emitidos vs CDR. |
| TR-RNF-001 | Operaciones de mostrador p95 < 800 ms: la emisión no espera al PSE. |
| TR-RNF-007 | Timeout, reintento y circuit breaker en la integración (lo completa 060). |

Heredados por CLAUDE.md: 002, 003, 010, 011, 012, 013/112, 024/119, 025, 026, 101, 106.

## 5. Historia del backlog (3_plan.json)
| ID | Sprint | Horas | Componente | Historia | rf | Tipo | Release |
|---|---|---|---|---|---|---|---|
| R2-05 | 14 | 10 | TR-FE | Emitir boleta y factura; procesar CDR | TR-RF-053, 054, 059 | Back | R2 |

Relacionadas: R2-04 (emisor), R2-06 (PDF), R2-08 (contingencia), R2-13 (CC-09, consumidor SazónPOS), R2-14/R2-15 (homologación y E2E), R2-18 (hipercuidado 8 h). Sprint 14 «Facturación electrónica I: emisor, boleta y factura» (2027-05-03 a 2027-05-16, 20 h).

## 6. Tablas SQL, eventos, puertos y permisos
- **Migración** `db/01m_fe_comprobante.sql` (letra tentativa, ver emisor).
- **`fe.comprobante`**: `id, tenant_id, empresa_id, sucursal_id, emisor_id, tipo (01|03|07|08), serie, numero bigint, fecha_emision date (America/Lima o zona de la sucursal), moneda, forma_pago, adquirente_tipo_doc, adquirente_numero, adquirente_nombre, adquirente_correo?, total_gravado, total_exonerado, total_inafecto, igv, total, estado (PENDIENTE_ENVIO|ENVIADO|ACEPTADO|ACEPTADO_CON_OBSERVACIONES|RECHAZADO|ANULADO), modo_envio, hash, xml_archivo_id, cdr_archivo_id, codigo_respuesta, descripcion_respuesta, origen_producto, origen_id, clave_idempotencia, version, creado_por/en`. Únicos: `(tenant_id, empresa_id, tipo, serie, numero)` y `(tenant_id, clave_idempotencia)`. Bloqueo optimista con `version`. Los montos en `numeric(14,2)`.
- **`fe.comprobante_linea`**: `comprobante_id, orden, codigo, descripcion, unidad, cantidad numeric(14,4?), valor_unitario, afectacion_igv, valor_venta, igv, precio_unitario`.
- **`fe.comprobante_cuota`**: `comprobante_id, numero, monto, fecha_vencimiento`.
- **`fe.comprobante_observacion`**: `comprobante_id, codigo, descripcion`.
- **`fe.envio`** (= `EnvioPse` de T-06): `comprobante_id, intento, enviado_en, resultado, codigo_respuesta, duracion_ms`.
- **Inmutabilidad (RN-022)**: trigger que impide cambiar montos, líneas o número de un comprobante con estado final; solo cambia el estado por las transiciones permitidas.
- **Eventos** (SRS): `cpe.emitido`, `cpe.aceptado`, `cpe.rechazado`. T-S3 usa `fe.comprobante.aceptado`/`rechazado`: se toma el nombre del SRS (P6). ACEPTADO_CON_OBSERVACIONES sale como `cpe.aceptado` con `observaciones[]`. Payload mínimo: `comprobante_id, tipo, serie, numero, total, moneda, estado, origen_producto, origen_id`.
- **Puertos**: `ComprobantePort.emitir(solicitud) -> { comprobanteId, serie, numero, numeroFormateado, hash?, estado }` (exportado en `index.ts`, como `CorrelativoPort`); consume `CORRELATIVO_PORT`, `CATALOGO_PORT`, `PARAMETRO_PORT`, `PseOsePort`, `ArchivoPort` (TR-ARC, R2-03), `PadronRuc`/`IdentidadPort` (TR-IDN, R2-02; con adaptador nulo si aún no existe, como `PadronRucNulo`).
- **Permisos**: `plat.fe.emitir` (endpoint `POST /v1/fe/comprobantes`, cabecera `Idempotency-Key` o campo `clave_idempotencia`), `plat.sistema.job` (worker, sin endpoint). Lectura: `GET /v1/fe/comprobantes/{id}` bajo `plat.fe.monitorear` (063).
- **Parámetros o catálogos nuevos**: tasa de IGV general y reducida con vigencia; umbral de boleta S/ 700 (RN-018); modo de envío de boletas por defecto.

## 7. Código base relacionado
- **SEQ (spec 10)**: `CORRELATIVO_PORT.siguiente({ empresaId, tipo, serie })` dentro de la tx del UnitOfWork; devuelve `numeroFormateado` con relleno (B002-00000125). Bloquea la serie hasta el commit: pedir el número al final de la tx. `TIPOS_DOCUMENTO` incluye BOLETA, FACTURA, NOTA_CREDITO, NOTA_DEBITO; `ck_serie_sunat` exige `^F[A-Z0-9]{3}$`/`^B[A-Z0-9]{3}$`, 8 dígitos, sucursal obligatoria y reinicio NUNCA en la práctica. `SembrarSeriesIniciales` crea B001 y F001 en la sucursal principal al dar de alta el tenant (spec 12); no crea series de notas.
- **CAT (19a/19b)**: `CATALOGO_PORT.validarItem(catalogo, codigo)` devuelve `{ valido, motivo, atributos }`. Tablas cargadas desde `docs/datos-oficiales`: TIPO_COMPROBANTE (cat. 01, 17 filas), TIPO_DOC_IDENTIDAD (cat. 06, 9 filas; código interno `DNI`/`RUC`/`DOC_0` con `codigo_externo` SUNAT 1/6/0), AFECTACION_IGV (cat. 07, 18), UNIDAD_MEDIDA (cat. 03, 1 827; incluye NIU y ZZ), MONEDA (ISO 4217, 178; PEN y USD). Las tres de SUNAT son la versión **RS-245-2017**; `FUENTES.md` pide bajar la vigente de cpe.sunat.gob.pe y regenerar.
- **Faltan para FE** (parte 0): catálogos SUNAT 05 (tributos), 09 (tipo de nota de crédito), 10 (tipo de nota de débito), 51 (tipo de operación), 52 (leyendas, «MONTO EN LETRAS»), 16 (tipo de precio), 19 (estado de ítem del resumen), tipo de documento «varios». `TABLAS_IMPORTABLES` y `DISENOS_TABLAS` (`libs/plataforma/catalogos/src/domain/importacion/`) están cerrados en 7 tablas: agregar tablas es cambiar ese dominio y la semilla de `db/01f_cat_importacion.sql`.
- **CFG (09)**: `PARAMETRO_PORT.valor(codigo, { empresaId, sucursalId })`. Manifiesto PLAT `1.15.0` solo define 4 parámetros; no hay ninguno de IGV.
- **EVT (11)**: outbox `sync.outbox` (solo inserción), relay a BullMQ, `@SuscribirEvento`, `PoliticaReintentos`; worker con `EventosModule.registrarWorker`. `exceljs` y `bullmq 6.3.11` ya están en `package.json`; no hay librerías de XML, firma, PDF ni QR.
- **ORG**: `Sucursal.codigoEstablecimientoSunat` (código de anexo para el UBL), `zonaHoraria`; `Empresa.direccionFiscal` y `ubigeo` son opcionales (el UBL los necesita: validar al emitir o al configurar el emisor).
- **No existe**: lib `comprobantes`, esquema `fe`, TR-ARC, TR-IDN. Nada de FE en `codigo/`.

## 8. Diagramas relevantes
- `8_Diseno_Piloto/2_Plataforma_Transversal/T-06_Modelo_de_dominio_Comprobantes_electronicos_y_pagos.mmd`: `Comprobante` (agregado), `ComprobanteItem`, `EnvioPse`, `ResumenDiario`, VO `Dinero` y `Adquirente`; numerado por `SerieCorrelativo`, emitido por `Empresa`.
- `8_Diseno_Piloto/2_Plataforma_Transversal/T-S3_Secuencia_Emision_de_comprobante_electronico.mmd`: emisión asíncrona desde el outbox, número pedido en el worker, IGV de `plat.igv.tasa`, reintento máx. 5.
- `7_Control_Cambios_SazonPOS/CC-D07_CC_07_Eventos_de_dominio_desde_triggers.mmd`: `sync.outbox` (`rest.pago.*`) -> «Facturación electrónica (CC-09)».
- `7_Control_Cambios_SazonPOS/CC-D09_Dependencias_entre_solicitudes_de_cambio.mmd`: CC-03, 04, 05, 06, 07 -> CC-09.
- `9_Plan_Implementacion/PL-10_Dependencias_entre_componentes_transversales.mmd`.

## 9. Ambigüedades y preguntas candidatas
Ambigüedades:
- RF-053 dice «en la misma transacción de la venta»; T-S3 y CC-D07 muestran emisión asíncrona desde el outbox con el número pedido en el worker. SazónPOS vive en otro repo (ADR-31) y no puede compartir una tx de NestJS con la plataforma.
- T-S3 usa formato B001-000245 (6 dígitos) y reintento «máx. 5»; RN-017 y SEQ usan 8 dígitos y RF-060 reintenta 1, 5, 15, 60 min y luego cada hora.
- El hash del QR (RF-061) sale de la firma: si firma el PSE, lo devuelve el PSE.
- CA-139 «documento 0»: en el cat. 06 de 2017 el código 0 es «DOC.TRIB.NO.DOM.SIN.RUC»; no hay ítem «varios».
- Tasa reducida de restaurantes (Ley 31556) cambia por año: un parámetro sin vigencia no basta.

Preguntas candidatas, con recomendación:
1. **¿Emisión síncrona o asíncrona?** Recomendación: registro síncrono (número, cálculo, hash si lo hay, estado PENDIENTE_ENVIO) y envío asíncrono. Dos entradas al mismo caso de uso: `ComprobantePort.emitir` en proceso (productos del monorepo, misma tx) y `POST /v1/fe/comprobantes` con clave de idempotencia (SazónPOS y productos externos, tras confirmar su venta). La caja necesita el número al instante para imprimir; el outbox de CC-07 queda como respaldo, no como vía principal.
2. **¿Dónde viven tasas y umbrales?** Recomendación: catálogo GLOBAL `TASA_IGV` con ítems GENERAL y REDUCIDO_RESTAURANTES, atributo `tasa` y vigencias (CAT ya resuelve vigencia por fecha); el umbral de boleta como parámetro `plat.fe.boleta_monto_identificacion` (700). Valores a verificar contra la norma vigente antes de producción.
3. **¿Catálogos SUNAT faltantes?** Recomendación: spec corto `cat-tablas-sunat-fe` (parte 0) antes de A: agrega 05, 09, 10, 51, 52 y 16 a las tablas importables, baja la versión vigente del Anexo 8 y regenera los CSV de 01, 06 y 07.
4. **¿RN-019 bloquea o advierte?** Recomendación: advierte (la RN dice «advierte»): el comprobante se emite y la respuesta lleva `advertencias[]`. Sin TR-IDN listo, puerto nulo que no advierte.
5. **¿Adquirente como persona (TR-PER)?** Recomendación: valor embebido (`Adquirente` de T-06: documento + nombre + correo opcional) con `persona_id` opcional. Así FE no espera a PER, pese a PL-10.
6. **¿Nombres de eventos?** Recomendación: los del SRS (`cpe.*`), versionados con esquema en `registrarEsquemasFe`. T-S3 se considera desactualizado.
7. **¿Serie por sucursal o elegida por el producto?** Recomendación: el producto envía `sucursal_id` y tipo; FE resuelve la serie activa de esa sucursal (si hay varias, el producto la indica). Respeta TR-CA-136.
8. **¿Partir R2-05?** Recomendación: sí, en 0 + A + B (y C si P1 = OSE/SUNAT directo). A sin B ya es demostrable con el simulador del PSE.
9. **¿Qué pasa con XML y CDR si ARC no está?** Recomendación: no adelantar B sin ARC (R2-03 va en el sprint 13, antes). Si se atrasa, guardar temporalmente en `fe.comprobante_documento` (bytea) detrás del mismo puerto y migrar después.
