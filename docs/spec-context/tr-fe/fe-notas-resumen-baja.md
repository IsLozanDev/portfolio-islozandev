# Contexto para fe-notas-resumen-baja

Paquete de contexto (no es el spec). Fuentes: `CLAUDE.md`, SRS (RF, Criterios GWT, Reglas de negocio, RNF, Trazabilidad), `plan.md`, `3_plan.json`, diagramas T-06 y CC-D07, `specs/10-seq-correlativos.md`, código real de `libs/plataforma/correlativos`.

## 1. Alcance y dependencias
- Historia **R2-07** (sprint 15, 8 h, Back, R2): «Nota de crédito, resumen diario y comunicación de baja», TR-RF-055, 057, 058. TR-RF-056 (nota de débito) es Should y fase R2 en el SRS, pero ninguna historia del plan la cubre (P1).
- Depende de `fe-boleta-factura-cdr` (A y B: comprobantes aceptados, envío, CDR) y de `fe-emisor-y-puerto-pse` B (`PseOsePort.enviarResumen`, `enviarBaja`, `consultarTicket`). Usa SEQ, CAT (cat. 09 y 10, que hay que importar: parte 0 de `fe-boleta-factura-cdr`), CFG (hora del resumen, plazos), AUD.
- Horas: 8 h en el plan; realista 15-17 h. Partición:

| Parte | Slug | RF | h | Depende de |
|---|---|---|---|---|
| A | fe-notas-credito-debito | 055 (+ 056 si P1 = sí) | 7-8 (6 sin 056) | fe-emision, fe-envio-cdr, cat-tablas-sunat-fe |
| B | fe-resumen-diario-baja | 057, 058 | 8-9 | A (las notas de boletas entran al resumen), fe-envio-cdr |

- Áreas A: (a) nota como `Comprobante` tipo 07/08 con referencia al origen y saldo, (b) elección de serie y numeración, (c) API y `cpe.nota_emitida`. Áreas B: (a) agregado `ResumenDiario` y tarea programada por empresa, (b) comunicación de baja con plazo, (c) ticket asíncrono y actualización de estados.
- Fuera de alcance: reintentos con circuito (060), UI (la baja manual se lanza desde `fe-monitor`), reembolso que dispara nota (TR-PAG, R3: RF-070 publica `reembolso.confirmado` «para que el producto emita la nota»).
- Constitución: 1, 2, 3, 4, 5 (sensibles con aal2), 6, 10, 11. RNF-021 en la API (motivo obligatorio).

## 2. RF
| ID | Nombre | Permiso | App | RN | RNF | Actor | Prior./Fase |
|---|---|---|---|---|---|---|---|
| TR-RF-055 | Emitir nota de crédito | plat.fe.nota_credito | APP-03 | TR-RN-022, 017, 021 | TR-RNF-017, 021, 030 | Producto, ACT-06 | Must / MVP |
| TR-RF-056 | Emitir nota de débito | plat.fe.nota_debito | APP-03 | TR-RN-022, 021 | TR-RNF-017 | Producto, ACT-06 | Should / R2 |
| TR-RF-057 | Enviar resumen diario de boletas | plat.sistema.job | APP-03 | TR-RN-020 | TR-RNF-104, 105 | ACT-15, ACT-09 | Must / MVP |
| TR-RF-058 | Comunicar baja de comprobantes | plat.fe.baja | APP-02 | TR-RN-020, 022, 009 | TR-RNF-021, 017 | ACT-06 | Must / MVP |

- **055**: origen aceptado; actor con permiso sensible del producto. Tipo de nota del cat. 09 (anulación, descuento, devolución, corrección) y motivo 5-250; parcial por líneas o monto; valida saldo; numera en serie F### o B### según el afectado; firma y encola; `cpe.nota_emitida`. Salida: nota registrada y saldo del origen actualizado. Procesos TR-P04 y TR-P05.
- **056**: origen aceptado; cat. 10 (intereses, penalidades, aumento de valor); motivo 5-250; monto > 0; calcula impuestos, numera, firma, encola.
- **057**: planificador a la hora configurada (23:00 por defecto) por empresa; agrupa boletas y notas del día en modo RESUMEN por fecha de emisión; genera y firma el XML; envía y obtiene ticket; consulta el ticket hasta el CDR; actualiza cada boleta. Datos: `fecha_emision`, `empresa_id`, `boletas[]` (ADICIONAR|MODIFICAR|ANULAR), `ticket`, `estado_resumen` (ENVIADO|ACEPTADO|RECHAZADO). Componentes TR-FE, TR-CFG, TR-OBS.
- **058**: factura y sus notas por comunicación de baja; boletas por resumen con estado ANULAR. Valida plazo y que no tenga notas vinculadas; procesa el ticket; ANULADO al aceptarse. Datos: `comprobante`, `motivo` 5-100, `fecha_baja`. Componentes TR-FE, TR-AUD, TR-SEG.

## 3. Criterios GWT
- **TR-CA-142** (055, Positivo): F001-00000100 por S/ 118,00 aceptada, NC tipo 01 -> nota por 118,00 y saldo 0,00.
- **TR-CA-143** (055, Negativo): saldo 18,00, NC por 50,00 -> «El monto supera el saldo disponible del comprobante (S/ 18,00)».
- **TR-CA-144** (056, Positivo): F001-00000080 a crédito vencida hace 30 días, ND tipo 01 por intereses de 25,00 -> nota vinculada con IGV calculado.
- **TR-CA-145** (056, Negativo): factura rechazada -> «Solo se emiten notas sobre comprobantes aceptados».
- **TR-CA-146** (057, Positivo): 320 boletas en modo resumen del 09/10/2026, job a las 23:00 -> resumen aceptado y las 320 ACEPTADO.
- **TR-CA-147** (057, Negativo): boleta con total negativo, rechazo -> resumen RECHAZADO, boleta identificada, alerta al encargado.
- **TR-CA-148** (058, Positivo): F001-00000102 emitida ayer con RUC errado, baja con motivo -> ANULADA tras aceptarse.
- **TR-CA-149** (058, Negativo): fuera de plazo -> rechaza y sugiere NC tipo 01.
- Faltan (proponer): NC sobre factura con nota previa suma correctamente el saldo (acumulado); NC con la misma clave de idempotencia; baja de factura con NC vinculada -> rechazo (RN-022, paso 2); baja de boleta entra al siguiente resumen con ANULAR; resumen sin boletas pendientes no envía nada; dos ejecuciones del job el mismo día no duplican el resumen; ticket «en proceso» se vuelve a consultar; límite de líneas por resumen (SUNAT fija un máximo por envío: verificar) parte el resumen; baja sin aal2 -> 403.

## 4. Reglas y RNF
| ID | Texto corto |
|---|---|
| TR-RN-022 | Aceptado no se modifica ni elimina: nota de crédito o débito, baja o resumen. |
| TR-RN-017 | F### facturas y sus notas, B### boletas y sus notas. |
| TR-RN-020 | Envío dentro del plazo vigente; boletas por resumen o individual; baja dentro del plazo y solo para no entregados («verificar plazos vigentes»). |
| TR-RN-021 | Cálculo de IGV y redondeo (notas parciales y débito). |
| TR-RN-009 | «Anular» es sensible: MFA <= 15 min y auditoría (baja y NC de anulación). |
| TR-RNF-021 | Confirmación explícita y motivo obligatorio en acciones irreversibles. |
| TR-RNF-030 | Advertencia clara en acciones que afectan dinero. |
| TR-RNF-104 | Estado final oportuno; 0 perdidos. |
| TR-RNF-105 | Ante caída del OSE la cola persiste y reenvía dentro del plazo. |

Heredados por CLAUDE.md: 001, 002, 008, 010, 012, 013/112, 024/119, 025, 026, 101, 106.

## 5. Historia del backlog (3_plan.json)
| ID | Sprint | Horas | Componente | Historia | rf | Tipo | Release |
|---|---|---|---|---|---|---|---|
| R2-07 | 15 | 8 | TR-FE | Nota de crédito, resumen diario y comunicación de baja | TR-RF-055, 057, 058 | Back | R2 |

Sprint 15 «Facturación electrónica II: notas, resumen, baja, contingencia» (2027-05-17 a 2027-05-30, 20 h, con R2-08 y R2-09). Relacionadas: R2-15 (E2E de emisión y anulación), R3-03 (reembolso -> nota).

## 6. Tablas SQL, eventos, puertos y permisos
- **Migración** `db/01m_fe_notas_resumen.sql` (letra tentativa).
- **Notas**: en `fe.comprobante` (tipo 07/08) con `comprobante_origen_id`, `tipo_nota` (cat. 09/10), `motivo`. Saldo: columna `saldo` en el origen actualizada en la misma tx con bloqueo de fila (o vista que suma notas); bloqueo optimista con `version`.
- **`fe.resumen_diario`** (= `ResumenDiario` de T-06): `id, tenant_id, empresa_id, fecha_emision, identificador (RC-AAAAMMDD-n), estado (PENDIENTE|ENVIADO|ACEPTADO|RECHAZADO), ticket, xml_archivo_id, cdr_archivo_id, codigo_respuesta, enviado_en`. **`fe.resumen_item`**: `resumen_id, comprobante_id, accion (ADICIONAR|MODIFICAR|ANULAR)`.
- **`fe.baja`**: `id, tenant_id, empresa_id, identificador (RA-AAAAMMDD-n), fecha_baja, estado, ticket, cdr_archivo_id`; **`fe.baja_item`**: `baja_id, comprobante_id, motivo`.
- **Numeración RC/RA**: SEQ admite reinicio DIARIO, pero su `CHECK` de `tipo` solo acepta BOLETA, FACTURA, NOTA_CREDITO, NOTA_DEBITO, TICKET, KARDEX, EXPEDIENTE, HC, ESCRITURA (`db/01d_seq.sql`, `TIPOS_DOCUMENTO`). Usarlo exige migrar SEQ (P4).
- **Series de notas**: SEQ separa contadores por `tipo` (único `tenant, empresa, tipo, serie`) y acepta `^[FB][A-Z0-9]{3}$` para notas. `SembrarSeriesIniciales` no crea series de notas: alguien debe crearlas (P3).
- **Eventos**: SRS `cpe.nota_emitida`. Proponer `cpe.anulado`, `fe.resumen.aceptado`, `fe.resumen.rechazado` (alerta CA-147; TR-NOT la entrega), `fe.baja.rechazada`.
- **Puertos**: `PseOsePort.enviarResumen`, `enviarBaja`, `consultarTicket`; `CORRELATIVO_PORT`; `CATALOGO_PORT` (cat. 09/10); `PARAMETRO_PORT`.
- **Permisos** (SRS): `plat.fe.nota_credito`, `plat.fe.nota_debito`, `plat.fe.baja` (sensible, aal2), `plat.sistema.job`. Endpoints: `POST /v1/fe/comprobantes/{id}/notas-credito`, `.../notas-debito`, `.../baja`.
- **Parámetros** (CFG, nuevos): `plat.fe.resumen_hora` (23:00, alcance empresa), `plat.fe.plazo_baja_dias`, `plat.fe.plazo_envio_dias` (valores a verificar en la norma vigente).

## 7. Código base relacionado
- **SEQ**: ver arriba; `ObtenerSiguiente` bloquea la serie hasta el commit; reinicio DIARIO con la zona de la sucursal (`seq.periodo_de`). Spec 10 dejó explícito: «Elegir F### o B### para una nota según el comprobante afectado también es de TR-FE».
- **Worker**: patrón de tarea programada con cron por variable de entorno (`apps/worker/src/auditoria/verificacion.module.ts`, `AUD_VERIFICACION_CRON`) y tarea por tenant (`VerificarTodosLosTenants` en `auditoria`). La hora del resumen por empresa obliga a un barrido cada X minutos que elige empresas cuya hora llegó (zona horaria de la sucursal principal o `America/Lima`).
- **AUD**: `@Auditable` para baja y NC (acciones críticas, RNF-013).
- **No existe**: nada de FE; catálogos 09 y 10.

## 8. Diagramas relevantes
- `8_Diseno_Piloto/2_Plataforma_Transversal/T-06_Modelo_de_dominio_Comprobantes_electronicos_y_pagos.mmd` («nota de crédito de», `ResumenDiario` con `ticket`, `anular(motivo)`).
- `8_Diseno_Piloto/2_Plataforma_Transversal/T-S4_Secuencia_Pago_en_linea_con_confirmacion_por_webhook.mmd` (origen futuro de notas por reembolso, R3).
- `7_Control_Cambios_SazonPOS/CC-D07_CC_07_Eventos_de_dominio_desde_triggers.mmd` (anulaciones de SazónPOS -> outbox).

## 9. Ambigüedades y preguntas candidatas
Ambigüedades:
- RF-056 es Should y R2 en el SRS, pero el plan no le da historia.
- Plazos de envío y de baja: el SRS dice «verificar plazos vigentes» y no da números.
- RF-058 pide «no entregado o la norma lo permite»: la plataforma no sabe si el comprobante se entregó al cliente.
- Muchos PSE arman y envían el resumen diario por su cuenta; con ese proveedor, 057 se reduce a consultar estados.
- CA-147 «total negativo» en una boleta: el dominio de 054 debería impedirlo antes.

Preguntas candidatas, con recomendación:
1. **¿Entra la nota de débito (056)?** Recomendación: sí, en la parte A: comparte agregado, serie y flujo con la NC (unas 1,5 h) y el SRS la pone en R2. Si A pasa de 10 h, sale primero la ND.
2. **¿Resumen propio o del PSE?** Recomendación: depende de P1 del emisor. Con PSE que resume solo, `fe-resumen-diario-baja` envía boletas en modo INDIVIDUAL y 057 queda como consulta de estados; el modo RESUMEN se implementa cuando haya adaptador OSE o SUNAT directo. Decidirlo antes de redactar B.
3. **¿Quién crea las series de notas?** Recomendación: al pasar el emisor a producción (o al crear una serie B/F en la UI), crear las series de NC y ND con el mismo código (B001, F001) y tipo NOTA_CREDITO/NOTA_DEBITO; SEQ ya separa los contadores. Verificar con el proveedor que acepta el mismo código de serie.
4. **¿Numeración RC/RA en SEQ o en FE?** Recomendación: contador propio en FE (`fe.resumen_diario` con `MAX(n)+1` bajo bloqueo por empresa y fecha, SQL crudo justificado) para no migrar el `CHECK` de SEQ por un identificador técnico que no es comprobante. Alternativa: agregar `RESUMEN` y `BAJA` a `TIPOS_DOCUMENTO`.
5. **¿Saldo calculado o guardado?** Recomendación: columna `saldo` en el origen actualizada con bloqueo de fila en la tx de la nota (evita carreras entre dos NC parciales, CA-143).
6. **¿Plazos?** Recomendación: parámetros CFG con valor confirmado en la norma vigente antes de producción; CA-149 se prueba con el parámetro, no con un número fijo.
7. **¿«No entregado» en 058?** Recomendación: no validarlo (la plataforma no puede saberlo); el encargado lo declara al confirmar (casilla en la UI) y queda auditado.
8. **¿Baja o NC para SazónPOS?** Recomendación: la anulación de una venta en caja emite NC tipo 01 (siempre válida); la baja queda para errores detectados por el encargado. Definirlo en CC-09.
