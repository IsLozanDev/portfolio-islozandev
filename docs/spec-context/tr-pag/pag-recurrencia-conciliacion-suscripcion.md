# Contexto para pag-recurrencia-conciliacion-suscripcion

Paquete de contexto (no es el spec). Fuentes: `CLAUDE.md`, `srs_docs.txt` (RF 071-073, GWT 177-183, TR-RN-005/021/023/024/030, RNF 002/007/008/104/125/128, Trazabilidad), `plan.md` («Fuera de este plan (R4, backlog 2028)»), `3_plan.json`, T-06, specs 03 y 12 (suscripción y vencimiento), paquetes previos de `tr-pag`.

## 1. Alcance y dependencias
- **R4, fuera del plan**: el plan saca «conciliación de liquidaciones» y «cobro automático de suscripciones» al backlog 2028. El SRS los marca fase R2. Manda el plan. RF-071 (cobros recurrentes) tampoco tiene historia en `3_plan.json`. Este paquete deja el contexto listo para cuando un producto los pida (GymControl para 071; la plataforma para 073).
- Depende de (todo pendiente): `pag-pasarela-y-cobro-tarjeta`, `pag-webhook-pasarela`, `pag-link-pago`, TR-NOT (avisos), TR-FE R2 (comprobante de la plataforma en 073), TR-REP R3-04 y TR-ARC R2-03 (072: archivo de liquidación y resumen), TR-POR R3-07 (071: el cliente cancela desde el portal).
- Partición propuesta (un spec por RF; no caben juntos):

| Parte | Slug | RF | h | Depende de |
|---|---|---|---|---|
| a | pag-cobro-recurrente | 071 (plan de cobro con token, planificador, reintentos 1-3-5 días, `cobro_recurrente.fallido`) | 9 | pag a/b, NOT, POR (cancelación) |
| b | pag-conciliacion-liquidaciones | 072 (importar liquidación por API o archivo, emparejar, comisión, resumen) | 9 | pag a/b, ARC, REP |
| c | org-facturacion-suscripcion | 073 (cargo mensual por tenant, comprobante de la plataforma por FE, cobro recurrente o link, vencimiento ORG) | 10 | a, pag-link-pago, FE, 12 |

- RF-073 cruza FE (emite factura/boleta de la plataforma como emisor), ORG (spec 12: vencimiento y suspensión ya existen) y NOT. Es de APP-01 (consola).
- Fuera de alcance: medición de consumos (consultas DNI/RUC, mensajes, GB) que 073 factura: la cuenta TR-IDN, TR-NOT, TR-ARC (TR-RNF-128) y no hay historia que la consolide (ver P3).
- Constitución: reglas 1-6, 8, 10, 11.

## 2. RF
| ID | Nombre | Permiso | App | RN | RNF | Actor | Prior. / Fase SRS |
|---|---|---|---|---|---|---|---|
| TR-RF-071 | Gestionar cobros recurrentes | plat.pago.recurrente | APP-03 | TR-RN-023, 030 | TR-RNF-008, 007 | Módulo de producto, cliente final, planificador | Should / R2 |
| TR-RF-072 | Conciliar liquidaciones de la pasarela | plat.pago.conciliar | APP-02 | TR-RN-024 | TR-RNF-002, 125 | Encargado de facturación, planificador | Must / R2 |
| TR-RF-073 | Facturar y cobrar la suscripción del tenant | plat.facturacion.gestionar | APP-01 | TR-RN-005, 021 | TR-RNF-104, 128 | Admin plataforma, planificador | Must / R2 |

- **071** precondición: el cliente aceptó el cobro recurrente y la tarjeta está tokenizada. Flujo: el producto crea el plan (monto, frecuencia, inicio); el planificador cobra con el token; si rechaza reintenta a 1, 3 y 5 días y notifica; tras el último publica `cobro_recurrente.fallido`; el cliente puede cancelar desde el portal. Datos: token_tarjeta, monto, frecuencia (MENSUAL|TRIMESTRAL|ANUAL), dia_cobro (1-28), fecha_inicio, estado (ACTIVO|PAUSADO|CANCELADO). Componentes: TR-PAG, TR-NOT, TR-EVT, TR-POR.
- **072** precondición: la pasarela publica liquidaciones del día anterior. Flujo: descarga o subida del archivo; empareja por id de transacción y monto; compara comisión esperada con la cobrada; marca CONCILIADO, OBSERVADO o NO_REGISTRADO y genera el resumen. Datos: fecha_liquidacion, transacciones[] (id, monto_bruto, comision, monto_neto), resultado (CONCILIADO|OBSERVADO|NO_REGISTRADO|PENDIENTE_LIQUIDAR). Componentes: TR-PAG, TR-REP, TR-ARC. Procesos TR-P05 y TR-P13.
- **073** precondición: suscripciones activas con precio de plan. Flujo: el planificador calcula el cargo por tenant (planes + excedentes); emite factura o boleta de la plataforma por TR-FE; cobra por recurrente o envía link; ante falta de pago inicia el control de vencimiento de TR-ORG. Datos: periodo (AAAA-MM), conceptos[] (plan por producto, consultas, mensajes, GB), total, comprobante (serie-número), estado_cobro (PENDIENTE|PAGADO|VENCIDO). Componentes: TR-PAG, TR-FE, TR-ORG, TR-NOT. Proceso TR-P01.

## 3. Criterios GWT
- **TR-CA-177** (071, Positivo): cobro de S/ 99,00 el día 5; el 05/11/2026 se cobra y el socio recibe la confirmación.
- **TR-CA-178** (071, Negativo): rechazado el 5, reintentado el 6 y el 8; el reintento del 10 falla: `cobro_recurrente.fallido` y aviso al socio. Coincide con el RF: cargo inicial + reintentos a 1, 3 y 5 días (6, 8 y 10), cuatro intentos en total.
- **TR-CA-179** (072, Positivo): 85 pagos y 85 transacciones: todas CONCILIADO, diferencia S/ 0,00.
- **TR-CA-180** (072, Negativo): transacción inexistente en la plataforma: NO_REGISTRADO y alerta al encargado.
- **TR-CA-181** (072, Borde): comisión pactada 3,44 % y cobrada 4,20 %: OBSERVADO con la diferencia.
- **TR-CA-182** (073, Positivo): REST plan PRO S/ 149,00 + 300 mensajes WhatsApp excedentes en 2026-10: factura con plan y excedente, cobrada con su tarjeta.
- **TR-CA-183** (073, Negativo): tarjeta rechazada: cargo PENDIENTE y link de pago al propietario.
- Estado: Pendiente. Faltan y se proponen: idempotencia del planificador (un cargo por plan y fecha aunque corra dos veces, TR-RNF-008); `dia_cobro` 29-31 rechazado; conciliación reejecutada no duplica resultados; liquidación de un día sin pagos; cargo de un tenant en PRUEBA no se emite; cargo VENCIDO dispara el periodo de gracia ya existente (spec 12).

## 4. Reglas y RNF
| ID | Texto corto |
|---|---|
| TR-RN-023 | Cobro confirmado solo por webhook o consulta firmada (también el recurrente). |
| TR-RN-030 | Consentimiento expreso del cliente para el cobro recurrente, revocable. |
| TR-RN-024 | Conciliación por id y monto; toda diferencia distinta de la comisión pactada es partida observada. |
| TR-RN-005 | Estados del tenant: SUSPENDIDO permite pago de deuda; BAJA conserva 90 días. |
| TR-RN-021 | IGV con tasa vigente parametrizada, redondeo a 2 decimales por línea y total. |
| TR-RNF-125 | Reportes síncronos <= 10 000 filas en < 10 s; asíncronos hasta 1 000 000 en < 5 min. |
| TR-RNF-104 | Comprobantes con estado final en <= 10 min, 0 perdidos (073 emite comprobante). |
| TR-RNF-128 | Consumo por tenant con límites mensuales: base de los excedentes de 073. |
| TR-RNF-002 / 008 / 007 | Listados paginados; idempotencia del planificador; tolerancia a la caída de la pasarela. |

Heredados: 010, 011, 012, 013/112, 024/119, 025, 026, 101, 106.

## 5. Historia del backlog (3_plan.json)
Sin historia: ninguna de R0-R3 incluye 071, 072 ni 073. Plan, «Fuera de este plan (R4, backlog 2028)»: «conciliación de liquidaciones, cobro automático de suscripciones». Relacionadas: R3-01..R3-03 (PAG base), R3-04 (TR-REP), R2-04..R2-08 (TR-FE), spec 12 (vencimientos, implementado).

## 6. Tablas SQL, eventos, puertos y permisos
- **071**: `pag.plan_cobro` (tenant_id, referencia, token_ref (almacén), monto, frecuencia, dia_cobro, fecha_inicio, proximo_cobro, estado, version); `pag.intento_cobro_recurrente` (plan_id, fecha_programada, intento 1-4, pago_id, resultado). UNIQUE (plan_id, fecha_programada, intento).
- **072**: `pag.liquidacion` (configuracion_id, fecha, origen API|ARCHIVO, archivo_id, totales); `pag.partida_liquidacion` (liquidacion_id, id_transaccion, monto_bruto, comision, neto, resultado, pago_id, diferencia). T-06 dibuja `Conciliacion` (fecha, totalPasarela, totalSistema, estado).
- **073**: `org.cargo_suscripcion` (tenant_id, periodo, conceptos jsonb, total, comprobante_id, pago_id, estado_cobro) en ORG o `pag` (ver P2).
- Migraciones en la letra de `pag` (y de `org` para 073 si va ahí).
- **Eventos** (SRS): `cobro_recurrente.fallido`; reusa `pago.confirmado`/`pago.fallido`. Propuestos: `conciliacion.observada`, `cargo_suscripcion.emitido`, `cargo_suscripcion.vencido`.
- **Puertos**: `PasarelaPagos.cargarConToken`, `descargarLiquidacion`; `EmisorComprobantes` (TR-FE, R2); `NotificacionPort`; `MedidorConsumo` (sin dueño, ver P3).
- **Permisos** (SRS): `plat.pago.recurrente`, `plat.pago.conciliar`, `plat.facturacion.gestionar` (consola, sensible).

## 7. Código base relacionado
- `libs/plataforma/org`: suscripciones, `suscripcion.por_vencer`, `suscripcion.vencida`, `tenant.suspendido`, días de gracia (`plat.suscripcion.dias_gracia`) y la tarea `apps/worker/src/vencimientos/` (spec 12): el control de vencimiento que 073 invoca ya existe.
- `apps/worker/src/importaciones/` y `libs/plataforma/catalogos` (`ProcesarImportacion`, cola de importaciones, previsualización): patrón para importar el archivo de liquidación (072).
- `auditoria` (exportación XLSX al vuelo de 20b) como salida del resumen mientras no exista TR-REP.
- No existe: lib `pagos`, TR-FE, TR-REP, medición de consumos.

## 8. Diagramas relevantes
- `8_Diseno_Piloto/2_Plataforma_Transversal/T-06_Modelo_de_dominio_Comprobantes_electronicos_y_pagos.mmd` (Conciliacion).
- `8_Diseno_Piloto/2_Plataforma_Transversal/T-02_Modelo_de_dominio_Organizacion_y_suscripciones.mmd` (suscripción, base de 073).
- `1_Definicion_y_Arquitectura/05_GYM_GymControl/GYM-P03_Renovacion_congelamiento_y_cobranza.mmd` (071).
- `1_Mermaid/PL-01_Hoja_de_ruta_de_releases.mmd` (R4 fuera del plan).

## 9. Ambigüedades y preguntas candidatas
1. SRS R2 vs. plan R4. Recomendación: seguir el plan; no especificar hasta que un producto lo pida. RF-071 no figura en la lista R4 del plan pero tampoco en R3: tratarlo como R4.
2. ¿073 vive en PAG u ORG? Recomendación: el cargo y el periodo en ORG (es de la suscripción); PAG solo cobra; FE emite. Spec en ORG con dependencia de PAG y FE.
3. ¿Quién mide los consumos (DNI/RUC, mensajes, GB)? No hay historia. Recomendación: contador mensual por tenant en cada componente (TR-RNF-128) y un puerto `MedidorConsumo` en ORG que los suma.
4. Reintentos de 071 que caen en feriado o domingo: el RF no lo dice. Recomendación: días corridos, sin `CalendarioPort`; el aviso al cliente sale en cada rechazo.
5. ¿Tokenización recurrente es soportada por la pasarela elegida? Recomendación: confirmarlo al elegir pasarela (`pag-pasarela-y-cobro-tarjeta` P1); es un criterio de selección.
6. Conciliación por archivo: ¿formato por pasarela? Recomendación: un adaptador de lectura por pasarela detrás de `PasarelaPagos.descargarLiquidacion`; subida manual con el importador genérico.
