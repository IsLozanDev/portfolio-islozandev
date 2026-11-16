# Contexto para pag-pasarela-y-cobro-tarjeta

Paquete de contexto (no es el spec). Fuentes: `CLAUDE.md`, `srs_docs.txt` (RF 065-066, GWT 163-167, TR-RN-009/023, RNF 113/121/008/011/007, Actores ACT-06/ACT-10, Componentes TR-PAG, Consumidores), `plan.md` (R3, §6.1, árbol `pagos/ (R3)`), `3_plan.json`, PL-10, T-06, T-S4, specs 05, 19a, 20a.

## 1. Alcance y dependencias
- Historia R3-01 (sprint 19, 12 h, Back, R3): «Pasarela por empresa, intención de cobro con tarjeta, Yape/Plin». RF 065, 066, 067. Este paquete cubre 065 y 066; 067 va con el webhook en `pag-yape-plin-webhook.md`. Roadmap R3: slug `pagos`.
- Lib nueva `libs/plataforma/pagos` (TR-PAG), esquema `pag`. Etiquetas `scope:plataforma`, `type:backend`, `comp:pag`.
- PL-10: `FE --> PAG` y `NOT --> PAG` (PAG depende de FE y NOT). Para 065/066 la dependencia real es SEG (MFA, permisos), ORG (empresa), CAT (catálogo PASARELA), EVT (outbox); FE y NOT entran con reembolso (nota de crédito) y link.
- Primer consumidor: PsicoAgenda (H5, 2027-10-05) y MercaWeb (ECO, TR-CA-165). SazónPOS no cobra en línea en R3.
- Partición propuesta (12 h de R3-01 para tres RF y una lib nueva):

| Parte | Slug | RF | h | Depende de |
|---|---|---|---|---|
| a | pag-pasarela-y-cobro-tarjeta | 065 back (configuración, secretos, transacción de prueba) + 066 (intención PENDIENTE, idempotencia) | 10 | 05 (aal2), 07, 11, 19a, 20a, almacén de secretos (ver P2) |
| b | pag-yape-plin-webhook | 069 + 067 (ver ese archivo) | 9 | a |
| c | pag-configuracion-ui | UI de 065 en `admin-cliente` («pasarela de pagos», plan §6.1 R3) | 5 | a, 15, 17c |

- Áreas de a: (1) dominio `IntencionPago`, `Dinero`, `ConfiguracionPasarela` y tablas `pag`; (2) puerto `PasarelaPagos` + primer adaptador + `AlmacenSecretos`; (3) API `/v1/pagos` (configurar, crear intención, consultar estado).
- Fuera de alcance: confirmación por webhook (b), Yape/Plin (b), link y reembolso (`pag-link-reembolso.md`), recurrencia y conciliación (R4), `<ui-checkout>` (ver P4).
- Constitución: reglas 1-6, 8, 9, 10 (pasarela tras puerto), 11. Los datos de tarjeta nunca pasan por la plataforma (RF-066).

## 2. RF
Módulo MOD-09, proceso TR-P05, Must / MVP en el SRS; R3 por plan.
| ID | Nombre | Permiso | App | RN | RNF | Actor |
|---|---|---|---|---|---|---|
| TR-RF-065 | Configurar pasarela de pagos por empresa | plat.pago.configurar | APP-02 | TR-RN-023, 009 | TR-RNF-113, 121 | Encargado de facturación (ACT-06), admin cliente |
| TR-RF-066 | Crear intención de cobro con tarjeta | plat.pago.cobrar | APP-03 | TR-RN-023 | TR-RNF-008, 011, 007 | Módulo de producto, cliente final |

- **065** precondición: la empresa existe; el actor tiene MFA vigente. Flujo: elige la pasarela del catálogo PASARELA y el ambiente; ingresa llave pública, privada y secreto de webhook; define medios y comisión; el sistema guarda los secretos en el gestor de secretos y ejecuta una transacción de prueba de S/ 1,00 en pruebas. Datos: pasarela, ambiente (PRUEBAS|PRODUCCION), llave_publica, llave_privada (secreto), secreto_webhook (secreto), medios[] (TARJETA|YAPE|PLIN|LINK), comision_pct (0-10), comision_fija (>= 0). Componentes: TR-PAG, TR-AUD.
- **066** precondición: pasarela con medio TARJETA. Flujo: el producto crea la intención con clave de idempotencia y referencia; se registra PENDIENTE y se pide la orden a la pasarela; el checkout tokeniza en la pasarela; el estado final llega por webhook (TR-RN-023). Datos: monto (> 0, 2 decimales), moneda (PEN|USD), descripcion (3-200), referencia_tipo (VENTA, CITA, PEDIDO_WEB), referencia_id (uuid), correo_pagador, clave_idempotencia (uuid). Componentes: TR-PAG, TR-EVT.

## 3. Criterios GWT
- **TR-CA-163** (065, Positivo): «Gym Fuerza Total SAC» configura TARJETA y YAPE en PRUEBAS: la transacción de prueba de S/ 1,00 se aprueba y la pasarela queda activa.
- **TR-CA-164** (065, Negativo): llave privada revocada: la prueba falla con «Credenciales rechazadas por la pasarela» sin activar.
- **TR-CA-165** (066, Positivo): pedido ECO-2026-001245 de S/ 189,90: pago PENDIENTE y el checkout muestra el formulario de la pasarela.
- **TR-CA-166** (066, Negativo): monto 189,905: «El monto debe tener como máximo 2 decimales».
- **TR-CA-167** (066, Borde): misma clave de idempotencia: devuelve la intención existente.
- Estado: Pendiente. Faltan y se proponen: sin aal2 la configuración se rechaza; los secretos nunca vuelven en la respuesta ni en logs (solo últimos 4 caracteres); en PRODUCCION no se hace cargo de prueba (ver P5); intención sin pasarela activa o sin medio TARJETA da error claro; la intención expira (T-S4: 10 min) y pasa a EXPIRADO; aislamiento por tenant y por empresa; cambio de configuración auditado con `AuditoriaPort` sin secretos.

## 4. Reglas y RNF
| ID | Texto corto |
|---|---|
| TR-RN-023 | Un pago solo se confirma por webhook o consulta servidor a servidor con firma válida; la redirección del navegador nunca confirma. |
| TR-RN-009 | Permisos sensibles con MFA de máx. 15 min y auditados (configurar pasarela). |
| TR-RNF-113 | Llaves de pasarela cifradas con clave por tenant en gestor de secretos, rotables sin interrupción; 0 secretos en claro en BD o repo. |
| TR-RNF-121 | Pasarela tras puerto y adaptador; cambio por tenant por configuración < 10 min; prueba con dos adaptadores. |
| TR-RNF-008 | Idempotencia por clave en la intención. |
| TR-RNF-011 | Cifrado y secretos (heredado; datos de tarjeta fuera de la plataforma, PCI SAQ-A). |
| TR-RNF-007 | Timeout, reintento y circuit breaker con la pasarela; su caída no bloquea la operación principal. |

Heredados: 001/002/003, 010, 012, 013/112, 024/119, 025, 026 (logs sin correo del pagador), 101, 106.

## 5. Historia del backlog (3_plan.json)
| ID | Sprint | Horas | Componente | Historia | rf | Tipo | Release |
|---|---|---|---|---|---|---|---|
| R3-01 | 19 | 12 | TR-PAG | Pasarela por empresa, intención de cobro con tarjeta, Yape/Plin | TR-RF-065, 066, 067 | Back | R3 |

Relacionadas: R3-02 (webhook, 6 h, S19), R3-03 (link y reembolso, 8 h, S20), R3-07 (portal), R2-05/R2-07 (FE: comprobante y nota de crédito). Sprint 19: 2027-07-12 a 2027-07-25 (feriado 23/07).

## 6. Tablas SQL, eventos, puertos y permisos
- **`pag.configuracion_pasarela`** (id, tenant_id, empresa_id, pasarela (ítem del catálogo PASARELA), ambiente, llave_publica, credencial_ref (al almacén), secreto_webhook_ref, medios text[], comision_pct numeric(5,2), comision_fija numeric(12,2), estado PENDIENTE_PRUEBA|ACTIVA|INACTIVA, probada_en, version). Una ACTIVA por (empresa, pasarela, ambiente).
- **`pag.pago`** (T-06 `IntencionPago`: id, tenant_id, empresa_id, configuracion_id, medio, monto numeric(12,2), moneda, descripcion, referencia_tipo, referencia_id, origen_producto, correo_pagador cifrado, clave_idempotencia UNIQUE por tenant, estado PENDIENTE|CONFIRMADO|FALLIDO|EXPIRADO, id_orden_pasarela, expira_en, version).
- **`pag.transaccion`** (T-06: pago_id, tipo CARGO|REEMBOLSO, medio, referencia_pasarela UNIQUE por pasarela, monto, ocurrida_en): se llena con el webhook (parte b).
- **Secretos**: `seg`/`pag` no guardan secretos en claro. Opciones en P2.
- **Migración**: `db/01?_pag.sql` (siguiente letra libre tras las de R2; la última usada hoy es `01i`), inverso y prueba.
- **Catálogo**: `PASARELA` no existe en `db/01f_cat.sql` (sí `MEDIO_PAGO`, MIXTO). Sembrar `PASARELA` GLOBAL con su versión.
- **Eventos**: SRS `pago.confirmado`, `pago.fallido` (parte b). Aquí: `pasarela.configurada` (propuesto, sin secretos) solo si alguien lo consume.
- **Puertos**: `PagoPort.crearIntencion(...)` (productos, en su transacción); `PasarelaPagos` (`crearOrden`, `cargoDePrueba`, `consultarEstado`); `AlmacenSecretos` (`guardar`, `leer`, `rotar`).
- **HTTP**: `PUT /v1/pagos/empresas/{empresaId}/pasarelas/{pasarela}` (aal2), `GET` (sin secretos), `POST /v1/pagos/intenciones` (header `Idempotency-Key`), `GET /v1/pagos/intenciones/{id}` (estado para sondeo, T-S4).
- **Permisos**: `plat.pago.configurar` (sensible), `plat.pago.cobrar` (endpoint para frontends de producto y puerto interno). Al manifiesto PLAT (hoy `1.15.0`); rol propuesto `PLAT_FACTURACION` para ACT-06.

## 7. Código base relacionado
- `kernel-infra`: `TypeOrmUnitOfWork`, `OutboxPublisher`, `uuidV7`, `SystemClock`, `REPORTADOR_ERRORES`.
- `seguridad`: `Permiso`, `RequiereMfa`, `MfaGuard`, `mfaVigente`; `seg.permiso.sensible` (exige MFA y queda auditado).
- `auditoria`: `AuditoriaPort.registrar` en la misma transacción (configuración y cambios de estado) y `CAMPOS_ENMASCARADOS`.
- `catalogos`: `CatalogoPort.validarItem` para PASARELA y medios.
- `org`: empresa y su tenant.
- `observabilidad`: `CAMPOS_SENSIBLES` para redactar llaves en logs.
- No existe: lib `pagos`, esquema `pag`, almacén de secretos, ningún cliente HTTP de terceros con circuit breaker (el primero será Resend en R2 o este).
- `codigo/` del plan: nada de pagos.

## 8. Diagramas relevantes
- `8_Diseno_Piloto/2_Plataforma_Transversal/T-06_Modelo_de_dominio_Comprobantes_electronicos_y_pagos.mmd` (IntencionPago, Transaccion, Conciliacion, Dinero).
- `.../T-S4_Secuencia_Pago_en_linea_con_confirmacion_por_webhook.mmd` (intención, checkout, webhook, outbox, sondeo).
- `1_Mermaid/PL-10_Dependencias_entre_componentes_transversales.mmd` (FE -> PAG, NOT -> PAG).
- `1_Definicion_y_Arquitectura/02_PSI_PsicoAgenda/PSI-P04_Cobro_paquetes_y_comprobantes.mmd` y `08_ECO_MercaWeb/ECO-P01_Compra_en_linea.mmd` (consumidores).

## 9. Ambigüedades y preguntas candidatas
1. ¿Qué pasarela primero? (Culqi, Niubiz, Izipay, Mercado Pago; Yape/Plin dependen de ella). Recomendación: una que cubra tarjeta, Yape y link con webhooks firmados y ambiente de pruebas; el usuario decide. El puerto se diseña con un segundo adaptador falso para TR-RNF-121.
2. ¿Gestor de secretos? No existe (hoy solo variables de entorno). Recomendación: puerto `AlmacenSecretos` con adaptador de cifrado de sobre (AES-256-GCM, clave por tenant derivada de una clave maestra por entorno); Supabase Vault como segundo adaptador si se prefiere. Lo reutilizan FE (certificado) y NOT (tokens). Puede merecer spec propio previo.
3. ¿Configuración por empresa o por tenant? RF-065 dice por empresa. Recomendación: por empresa (cada RUC cobra a su cuenta).
4. `<ui-checkout>` (Componentes y Consumidores) no tiene RF ni historia. Recomendación: componente en `libs/shared` que carga el script de la pasarela; spec front propio en R3 cuando PsicoAgenda lo pida.
5. Transacción de prueba de S/ 1,00: ¿también en PRODUCCION? Recomendación: solo en PRUEBAS (como dice el RF); en PRODUCCION validar llaves con una llamada de lectura sin cargo.
6. Expiración de la intención: T-S4 10 min, RF-067 (Yape) 5 min. Recomendación: parámetro por medio en TR-CFG; tarjeta 10, billeteras 5.
7. Evento con prefijo: SRS `pago.confirmado`, T-S4 `pag.pago.confirmado`. Recomendación: `pago.confirmado` (SRS y estilo de eventos actuales: `tenant.creado`, `catalogo.actualizado`).
8. ¿USD? RF-066 admite PEN|USD. Recomendación: sí en el modelo; FE (R2) debe soportar la moneda del comprobante.
