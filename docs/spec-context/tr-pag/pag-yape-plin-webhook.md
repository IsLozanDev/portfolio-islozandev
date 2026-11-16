# Contexto para pag-yape-plin-webhook

Paquete de contexto (no es el spec). Fuentes: `CLAUDE.md`, `srs_docs.txt` (RF 067, 069, GWT 168-169 y 172-174, TR-RN-023, TR-RNF-109/008/001/007, Componentes TR-PAG), `plan.md`, `3_plan.json`, T-S4, T-06, specs 11, 18b (bitácora de seguridad), `pag-pasarela-y-cobro-tarjeta.md`.

## 1. Alcance y dependencias
- Historias: R3-01 (sprint 19, 12 h, parte Yape/Plin: RF 067) y R3-02 (sprint 19, 6 h, Back: «Webhook de la pasarela con idempotencia», RF 069). Roadmap R3: slug `pagos`.
- Depende de: `pag-pasarela-y-cobro-tarjeta` (lib `pagos`, configuración con `secreto_webhook`, `pag.pago`), 11 (outbox), 18b (`seg.evento_seguridad` para el intento con firma alterada, TR-CA-173).
- El webhook confirma también la tarjeta de RF-066 y el link y el reembolso de RF-068/070: es la pieza central de TR-PAG (TR-RN-023).
- Partición propuesta:

| Parte | Slug | RF | h | Depende de |
|---|---|---|---|---|
| a | pag-webhook-pasarela | 069 (firma, ventana de 5 min, idempotencia por id de transacción, estado del pago, eventos) + expiración de intenciones | 6 | pag-pasarela-y-cobro-tarjeta |
| b | pag-yape-plin | 067 (QR dinámico o código de aprobación, expiración 5 min) | 4 | a |

- Áreas de a: verificación de firma y marca de tiempo; registro idempotente y transición de estado en una transacción con outbox; respuesta < 2 s (trabajo pesado fuera de la petición).
- Fuera de alcance: conciliación (R4), reembolso (`pag-link-reembolso.md`), notificación al cliente final (TR-NOT).
- Constitución: reglas 2, 3 (el webhook no trae tenant: ver P1), 4, 8, 10.

## 2. RF
| ID | Nombre | Permiso | App | RN | RNF | Actor |
|---|---|---|---|---|---|---|
| TR-RF-067 | Cobrar con Yape o Plin | plat.pago.cobrar | APP-03 | TR-RN-023 | TR-RNF-001, 007 | Módulo de producto, usuario operativo, cliente final |
| TR-RF-069 | Procesar webhook de la pasarela | publico.webhook.pasarela | APP-03 | TR-RN-023 | TR-RNF-109, 008 | Pasarela de pagos (ACT-10) |

Ambos Must / MVP, proceso TR-P05; R3 por plan.
- **067** precondición: medio YAPE o PLIN habilitado. Flujo: el producto pide el cobro con el medio; se genera el QR dinámico o se pide celular y código de aprobación; QR con expiración de 5 min; al recibir el webhook confirma y publica `pago.confirmado`. Datos: medio (YAPE|PLIN), monto (> 0), celular (9 dígitos, si usa código), codigo_aprobacion (6 dígitos), expira_en. Salida: pago confirmado o expirado.
- **069** precondición: secreto de webhook configurado. Flujo: la pasarela envía a `/v1/pagos/webhooks/{pasarela}`; verifica HMAC y marca de tiempo (<= 5 min); si el id de transacción ya fue procesado responde 200 sin cambios; actualiza el pago y publica el evento en el outbox; responde 200 en < 2 s. Datos: pasarela (ruta), cabecera de firma, id_transaccion, estado (APROBADO|RECHAZADO|REEMBOLSADO), monto, moneda, marca_tiempo. Publica `pago.confirmado`, `pago.fallido` o `reembolso.confirmado`. Componentes: TR-PAG, TR-EVT, TR-AUD.

## 3. Criterios GWT
- **TR-CA-168** (067, Positivo): S/ 120,00 de membresía con Yape: el socio paga el QR, queda CONFIRMADO y el producto recibe `pago.confirmado`.
- **TR-CA-169** (067, Borde): QR de hace 5 min sin pago: solicitud EXPIRADA y el producto ofrece un QR nuevo.
- **TR-CA-172** (069, Positivo): pago de ECO-2026-001245 PENDIENTE + webhook válido de aprobación: CONFIRMADO y `pago.confirmado`.
- **TR-CA-173** (069, Negativo): firma alterada: 401, no modifica el pago y registra el intento en seguridad.
- **TR-CA-174** (069, Borde): webhook repetido: 200 sin un segundo evento.
- Estado: Pendiente. Faltan y se proponen: marca de tiempo > 5 min da 401 (RNF-109); webhook de un pago EXPIRADO que sí se cobró (carrera) queda CONFIRMADO con alerta (ver P4); monto o moneda distinta a la intención: no confirma, queda OBSERVADO; webhook de pago desconocido: 200 y registro (para no provocar reintentos infinitos); la redirección del navegador no cambia estado (TR-RN-023); p95 de respuesta < 2 s.

## 4. Reglas y RNF
| ID | Texto corto |
|---|---|
| TR-RN-023 | Confirmación solo por webhook o consulta servidor a servidor firmada; idempotencia por id de transacción de la pasarela. |
| TR-RNF-109 | 100 % de webhooks con HMAC válido; rechazo si la marca de tiempo difiere > 5 min. Pruebas con webhooks alterados y repetidos. |
| TR-RNF-008 | El reintento de la pasarela no duplica estado ni eventos. |
| TR-RNF-001 | Desempeño de API (QR generado sin espera perceptible). |
| TR-RNF-007 | Caída de la pasarela no bloquea la caja: el producto ofrece otro medio. |
| TR-RNF-106 | Outbox al menos una vez, p95 < 5 s: el producto se entera en segundos. |

Heredados: 010, 011, 012, 013/112, 024/119, 025, 026 (sin celular en logs), 101.

## 5. Historia del backlog (3_plan.json)
| ID | Sprint | Horas | Componente | Historia | rf | Tipo | Release |
|---|---|---|---|---|---|---|---|
| R3-01 | 19 | 12 | TR-PAG | Pasarela por empresa, intención de cobro con tarjeta, Yape/Plin | TR-RF-065, 066, 067 | Back | R3 |
| R3-02 | 19 | 6 | TR-PAG | Webhook de la pasarela con idempotencia | TR-RF-069 | Back | R3 |

Sprint 19: 2027-07-12 a 2027-07-25 (18/20 h según el plan).

## 6. Tablas SQL, eventos, puertos y permisos
- **`pag.webhook_recibido`** (id, pasarela, id_transaccion, recibido_en, firma_valida, estado_procesado PROCESADO|DUPLICADO|DESCONOCIDO|RECHAZADO, cuerpo_hash). UNIQUE (pasarela, id_transaccion, estado_pasarela) para la idempotencia (APROBADO y luego REEMBOLSADO son dos hechos distintos).
- **`pag.transaccion`** (del paquete de cobro) recibe la fila del cargo o reembolso con `referencia_pasarela` única.
- **`pag.pago`**: suma `celular_hash`, `qr_contenido` (o url), `expira_en` para Yape/Plin.
- Migración en la letra de `pag` (`db/01?_pag_webhook.sql`).
- **Seguridad**: `seg.evento_seguridad.tipo` tiene CHECK (`db/01b_seg_tipos_ingreso.sql`: LOGIN, LOGIN_FALLIDO, ACCESO_DENEGADO, ASIGNACION_*, ACCESO_SOPORTE); registrar la firma inválida exige un tipo nuevo (`WEBHOOK_RECHAZADO`) y resolver el tenant (ver P1).
- **Eventos** (SRS): `pago.confirmado`, `pago.fallido`, `reembolso.confirmado`. Payload: pago_id, referencia_tipo, referencia_id, origen_producto, monto, moneda, medio (sin datos del pagador). Propuesto: `pago.expirado` (CA-169 pide que el producto lo sepa).
- **Puertos**: `PasarelaPagos.verificarFirma(cabeceras, cuerpo, secreto)`, `interpretarWebhook(cuerpo)`, `crearCobroBilletera(...)`; `AlmacenSecretos.leer` (secreto de webhook); expiración por tarea BullMQ diferida al crear la intención.
- **HTTP**: `POST /v1/pagos/webhooks/{pasarela}` con `@Publico`, cuerpo crudo para la firma (Nest `rawBody`), sin `ValidationPipe` antes de verificar. `POST /v1/pagos/billeteras` (Yape/Plin) con `@Permiso('plat.pago.cobrar')`.
- **Permisos**: `publico.webhook.pasarela` no es permiso asignable: firma. `plat.pago.cobrar` ya del paquete de cobro.

## 7. Código base relacionado
- `eventos` (spec 11): outbox y relay; el webhook publica con `OutboxPublisher` en la misma transacción que la transición (regla 4).
- `seguridad` (18b): registro de eventos de seguridad (`REGISTRO_ACCESO`); `Publico`.
- `kernel-infra`: `TypeOrmUnitOfWork`, `AlsTenantContext` (el tenant se fija tras resolver el pago).
- `apps/api/src/main.ts` / `app.setup.ts`: habilitar cuerpo crudo solo en la ruta del webhook.
- Patrón de tarea diferida: `apps/worker/src/soporte/tarea-vencimiento-soporte.ts`.
- No existe: ningún webhook entrante ni verificación HMAC (el primero será el de Resend en R2 si llega antes; conviene una utilidad común, ver `tr-not/not-whatsapp.md` §7).

## 8. Diagramas relevantes
- `8_Diseno_Piloto/2_Plataforma_Transversal/T-S4_Secuencia_Pago_en_linea_con_confirmacion_por_webhook.mmd` (firma HMAC, «verifica que el evento no esté procesado», outbox, sondeo o Socket.IO).
- `.../T-06_Modelo_de_dominio_Comprobantes_electronicos_y_pagos.mmd` (Transaccion).
- `.../T-S7_Secuencia_Relay_del_outbox_hacia_los_consumidores.mmd`.
- `1_Definicion_y_Arquitectura/05_GYM_GymControl/GYM-P01_Inscripcion_y_venta_de_membresia.mmd` (CA-168).

## 9. Ambigüedades y preguntas candidatas
1. El webhook no trae tenant y las tablas tienen RLS. Recomendación: ruta con identificador opaco de la configuración (`/v1/pagos/webhooks/{pasarela}/{configuracionId}`) o función `SECURITY DEFINER` que resuelve el tenant por `id_orden_pasarela`, como `org.tenant_por_codigo` del spec 12. Preferir la ruta con id: elige el secreto correcto antes de leer nada.
2. Ruta: SRS `/v1/pagos/webhooks/{pasarela}`, T-S4 `/v1/pagos/webhook`. Recomendación: la del SRS (+ id de configuración por P1).
3. ¿Procesar en la petición o encolar? Recomendación: verificar firma, registrar y transicionar en la petición (es poco trabajo, < 2 s); notificaciones y demás por outbox.
4. Pago cobrado después de EXPIRADO: Recomendación: aceptar el cobro (el dinero llegó), CONFIRMADO con marca `tardio` y alerta; el producto decide.
5. ¿Consulta servidor a servidor como respaldo si no llega el webhook? TR-RN-023 la permite. Recomendación: sondeo de pendientes cerca de su expiración con `PasarelaPagos.consultarEstado`.
6. Yape/Plin: QR dinámico o código de aprobación depende de la pasarela elegida. Recomendación: modelar ambos en el puerto, implementar solo el que soporte la pasarela.
7. Estado en el front: T-S4 dice «sondeo o Socket.IO». Recomendación: sondeo con `GET /v1/pagos/intenciones/{id}`; Socket.IO sin RF (igual que el centro de notificaciones).
