# Contexto para not-correo-plantillas-estados

Paquete de contexto (no es el spec). Fuentes: `CLAUDE.md`, `docs/roadmap-specs.md`, `srs_docs.txt` (hojas RF, Criterios GWT, Reglas, RNF, Trazabilidad, Componentes), `plan.md`, `3_plan.json`, `1_Mermaid/PL-10`, diagramas T-07 y T-S5, specs 02, 08, 12, 18, 20b, 21, memoria `supabase-cloud-y-resend`, `docs/ops/supabase-ambientes.md`.

## 1. Alcance y dependencias
- Historia R2-09 (sprint 15, 6 h, Back, R2): «Notificaciones por correo: plantillas, envío, estados; entrega del comprobante». RF 062, 074, 075, 079. El RF-062 es de TR-FE (entrega del CPE): va con el paquete de FE, que consume `NotificacionPort` de aquí.
- Roadmap R2 (indicativo): slug `notificaciones-correo`.
- PL-10: `EVT --> NOT`, `NOT --> PAG`, `NOT --> SOP`. NOT no depende de PER en el diagrama, pero RF-075 sí (consentimiento, persona_id): dependencia real que PL-10 no muestra.
- Proveedor de correo: Resend (decisión del usuario, memoria). Hoy Resend es solo el SMTP de Supabase Auth (spec 02); el adaptador HTTP de TR-NOT es nuevo.
- Horas: 6 h del plan no alcanzan (lib nueva, cola BullMQ, adaptador, webhook firmado, plantillas versionadas). Partición propuesta:

| Parte | Slug | RF | h | Depende de |
|---|---|---|---|---|
| a | not-envio-correo-resend | 075, 079 (canal CORREO), plantillas base de plataforma por semilla | 9 | 11 (outbox, `@SuscribirEvento`), 21 (worker, OTel); PER solo para `persona_id` (ver P2) |
| b | not-plantillas-personalizacion | 074 back (API, validación de variables, versiones, vista previa) | 5 | a, 07 (`@Permiso`) |
| c | not-consumidores-plataforma | Correos de eventos ya publicados: `suscripcion.por_vencer`, `tenant.suspendido`, `aud.integridad.rota`, solicitud de soporte (18) | 3 | a, b |

- Tres áreas de la parte a: (1) dominio y tablas `not` (mensaje, intento, plantilla base), (2) `NotificacionPort.enviar` + cola BullMQ + adaptador `ProveedorCorreo` Resend, (3) webhook de estados `POST /v1/notificaciones/webhooks/{proveedor}` con firma.
- Fuera de alcance: SMS, PUSH y WhatsApp (R3-11); recordatorios (R2-10); preferencias y bajas (R2-10); UI de plantillas (R2-11); centro de notificaciones Socket.IO (sin RF); entrega del CPE (RF-062, paquete FE).
- Constitución: reglas 1, 2, 3, 4, 5, 6, 8, 9 (API key de Resend solo por entorno en `apps/worker` y `apps/api`), 10, 11 (TypeORM).

## 2. RF
Módulo MOD-10, proceso TR-P06, todos Must / MVP en el SRS (R2 por plan).
| ID | Nombre | Permiso | App | RN | RNF | Actor |
|---|---|---|---|---|---|---|
| TR-RF-074 | Gestionar plantillas de notificación | plat.notificacion.plantilla | APP-02 | TR-RN-026 | TR-RNF-027, 020 | Admin plataforma, admin cliente |
| TR-RF-075 | Enviar notificación transaccional | plat.notificacion.enviar | APP-03 | TR-RN-025 | TR-RNF-124, 008 | Módulo de producto consumidor |
| TR-RF-079 | Registrar estado de entrega y conmutar canal | publico.webhook.mensajeria | APP-03 | TR-RN-025 | TR-RNF-124, 109 | Proveedor de mensajería, planificador |

- **074** precondición: código declarado por producto o plataforma. Flujo: elegir plantilla y canal; editar asunto/cuerpo con `{{variables}}`; validar variables declaradas y límite del canal (SMS 160); vista previa y nueva versión. Datos: codigo, canal (CORREO|SMS|WHATSAPP|PUSH), asunto (0-150), cuerpo (texto/HTML), variables[] (nombre, tipo), version. Base de plataforma personalizable por tenant sin perder la original.
- **075** precondición: plantilla existe para el canal. Flujo: el módulo llama al puerto; verifica bajas y consentimiento por finalidad (TR-RN-025); renderiza y encola; el worker entrega al proveedor y guarda el id externo. Datos: plantilla, destinatario (persona_id o dirección), variables (JSON), canal (opcional, por defecto el preferido), finalidad (TRANSACCIONAL|PROMOCIONAL), clave_idempotencia (uuid). Componentes TR-NOT, TR-PER.
- **079** precondición: el proveedor envía callbacks. Flujo: webhook firmado; actualiza el mensaje por id externo; fallo temporal reintenta hasta 3; fallo definitivo (rebote duro) conmuta al canal alterno y marca el contacto inválido. Datos: mensaje_id, id_externo, estado (ENCOLADO|ENVIADO|ENTREGADO|LEIDO|FALLIDO), motivo_fallo, canal_alterno (CORREO|SMS). Componentes TR-NOT, TR-PER, TR-OBS.
- Interfaz (hoja Componentes): `NotificacionPort.enviar/programar/cancelar`; plantillas por canal; preferencias y bajas; callbacks de estado; centro de notificaciones Socket.IO. 37 RF consumidores: el puerto más usado de R2.

## 3. Criterios GWT
- **TR-CA-184** (074, Positivo): plantilla base CITA_RECORDATORIO personalizada con la dirección de la sucursal se usa en los próximos envíos del tenant.
- **TR-CA-185** (074, Negativo): `{{diagnostico}}` no declarada: «Variable no permitida: diagnostico».
- **TR-CA-186** (074, Borde): SMS de 175 caracteres: advierte 2 segmentos y costo estimado.
- **TR-CA-187** (075, Positivo): WhatsApp preferido, PSI envía CITA_CONFIRMADA, entregado al proveedor en < 30 s.
- **TR-CA-188** (075, Negativo): sin finalidad PROMOCIONES aceptada: no se envía, queda OMITIDO_SIN_CONSENTIMIENTO.
- **TR-CA-189** (075, Borde): promocional a las 21:30 Lima se programa a las 08:00 del día siguiente.
- **TR-CA-197** (079, Positivo): SMS ENTREGADO con hora de entrega.
- **TR-CA-198** (079, Negativo): rebote duro de correo: envía por SMS y marca el correo inválido en la ficha.
- Estado de prueba en el SRS: Pendiente. Solo-correo en R2: 186 (SMS), 187 (WhatsApp) y 197 (SMS) no aplican tal cual; 198 conmuta a SMS, canal que no existe en R2. Proponer: CA-187 adaptado a CORREO (< 30 s al proveedor), CA-197 adaptado a correo ENTREGADO, CA-198 adaptado a «correo FALLIDO definitivo, contacto inválido, sin canal alterno disponible».
- Faltan y se proponen: idempotencia por `clave_idempotencia` (mismo mensaje, un solo envío, TR-RNF-008); webhook con firma inválida responde 401 y se registra (TR-RNF-109); webhook repetido no duplica estado; proveedor caído no bloquea al productor (TR-RNF-007); aislamiento por tenant en `not.mensaje`.

## 4. Reglas y RNF
| ID | Texto corto |
|---|---|
| TR-RN-025 | Promocionales solo con consentimiento vigente por finalidad y de 8:00 a 20:00 Lima; transaccionales sin consentimiento promocional pero respetan bajas del canal. |
| TR-RN-026 | Fuera de la ventana de 24 h, WhatsApp solo con plantillas aprobadas (aplica a 074 por canal WHATSAPP; R3). |
| TR-RN-030 | Consentimiento por finalidad, versionado, revocable (lo guarda TR-PER). |
| TR-RNF-124 | 95 % entregadas al proveedor en < 30 s; failover de canal < 2 min. Métricas de la cola. |
| TR-RNF-109 | Webhooks entrantes con firma HMAC y marca de tiempo (rechazo si difiere > 5 min). |
| TR-RNF-008 | Idempotencia por clave en operaciones que cambian estado. |
| TR-RNF-007 | Timeout, reintento con backoff y circuit breaker con terceros; su caída no bloquea. |
| TR-RNF-027 | Plantillas por tenant sin cambios de código. |
| TR-RNF-020 | Aprendizaje < 1 h (UI de 074). |
| TR-RNF-113 | Tokens de mensajería cifrados por tenant en gestor de secretos (si el tenant trae su propia cuenta; ver P5). |
| TR-RNF-128 | Consumo de mensajería por tenant con límite mensual, aviso al 80 % (no hay historia; ver P7). |

Heredados por CLAUDE.md: 001/002/003, 010, 011, 012, 013/112, 024/119, 025, 026 (logs sin correo del destinatario), 101, 106.

## 5. Historia del backlog (3_plan.json)
| ID | Sprint | Horas | Componente | Historia | rf | Tipo | Release |
|---|---|---|---|---|---|---|---|
| R2-09 | 15 | 6 | TR-NOT | Notificaciones por correo: plantillas, envío, estados; entrega del comprobante | TR-RF-062, 074, 075, 079 | Back | R2 |

Relacionadas: R2-10 (recordatorios y preferencias, 5 h, S16), R2-11 (UI plantillas, S16), R3-11 (WhatsApp, S24), R2-01 (TR-PER, S13), R2-05 (FE, consume para RF-062). Sprint 15 (2027-05-17 a 2027-05-30), H4 producción R2 el 2027-06-30.

## 6. Tablas SQL, eventos, puertos y permisos
- **Esquema `not`** (nuevo; T-07: Plantilla, Mensaje, IntentoEntrega, Preferencia):
  - `not.plantilla` (id, tenant_id NULL = base de plataforma, codigo, canal, idioma, asunto, cuerpo, variables jsonb [{nombre, tipo}], version, plantilla_base_id NULL, activa, id_plantilla_proveedor). Única por (tenant, codigo, canal, idioma, version).
  - `not.mensaje` (id, tenant_id, plantilla_id, canal, destino cifrado o hash, persona_id NULL, finalidad, variables jsonb sin datos sensibles, clave_idempotencia UNIQUE por tenant, estado ENCOLADO|ENVIADO|ENTREGADO|LEIDO|FALLIDO|OMITIDO_SIN_CONSENTIMIENTO|DESCARTADO, id_externo, motivo_fallo, programado_para, version).
  - `not.intento_entrega` (mensaje_id, numero, respuesta_proveedor, en).
  - `not.contacto_invalido` (tenant_id, canal, destino_hash, motivo, desde) mientras TR-PER no exista (ver P2).
  - RLS `ENABLE + FORCE` por `app.tenant_id`; la plantilla base (tenant NULL) visible a todos en lectura. REVOKE a `anon, authenticated` (regla 8).
- **Migración**: `db/01?_not.sql` + `rollback/` + `tests/`. La última letra usada es `01i`; la letra la fija `/spec` en orden de construcción junto con PER, IDN, ARC y FE (R2).
- **Eventos**: el SRS no define eventos de TR-NOT. Proponer `notificacion.fallida` (para OBS/producto) solo si un consumidor lo pide. NOT consume: `suscripcion.por_vencer`, `tenant.suspendido` (spec 12/03), `aud.integridad.rota` (20b), y en R2 `cpe.aceptado` (FE).
- **Puertos**: `NotificacionPort.enviar({ plantilla, destinatario, variables, canal?, finalidad, claveIdempotencia })` en `application/ports`; `ProveedorCorreo.enviar(...)` (adaptador Resend en `infrastructure/resend`); `ConsentimientoPort` (TR-PER, nulo hasta R2-01); `RenderizadorPlantilla` (dominio puro, sin HTML de terceros).
- **Cola**: BullMQ `not:envios` en `apps/worker` (mismo patrón que `importaciones` y `vencimientos`). Reintentos 3 con backoff; trabajo con `jobId` = mensaje_id.
- **Permisos**: `plat.notificacion.enviar` es llamada interna (sin endpoint, como `plat.auditoria.registrar` en 20a: no se declara). `plat.notificacion.plantilla` (parte b) va al manifiesto PLAT (hoy `1.15.0`). Webhook con `@Publico` + firma; `publico.webhook.mensajeria` no es permiso asignable.
- **Etiquetas Nx**: `scope:plataforma`, `type:backend`, `comp:not` (como `comp:aud`).

## 7. Código base relacionado
- **Reutiliza**: `kernel-infra` (`TypeOrmUnitOfWork`, `OutboxPublisher`, `SystemClock`, `uuidV7`, `traceIdActivo`, `REPORTADOR_ERRORES`); `eventos` (`@SuscribirEvento`, consumo idempotente por `event_id`; su doc avisa que un efecto externo como un correo debe ser idempotente por sí mismo); `observabilidad` (`CAMPOS_SENSIBLES`, `hashDocumento`, logger); `seguridad` (`Publico`, `Permiso`).
- **Patrones de worker**: `apps/worker/src/importaciones/` y `vencimientos/` (cola BullMQ, `registrar(...)` del módulo). `libs/plataforma/catalogos` exporta `abrirColaImportaciones` como ejemplo de cola expuesta por la lib.
- **Correo hoy**: Supabase Auth envía invitaciones y recuperación por SMTP de Resend (spec 02, `docs/ops/supabase-ambientes.md` §3). Remitente `onboarding@resend.dev` solo entrega al dueño de la cuenta (riesgo anotado en specs 14 y 21).
- **No existe**: lib `notificaciones`, esquema `not`, puerto nulo de notificaciones. Los specs 03, 12, 17a, 18, 18b y 20b solo publican eventos o dejan el aviso «TR-NOT, R2»; ninguno creó un puerto nulo.
- **`codigo/`** del plan: no trae nada de notificaciones.
- **Falta en R2**: TR-PER (consentimientos, ficha de persona) llega en R2-01; si no está, `ConsentimientoPort` nulo «sin bajas» y solo finalidad TRANSACCIONAL.

## 8. Diagramas relevantes
- `1_Mermaid/PL-10_Dependencias_entre_componentes_transversales.mmd` (EVT -> NOT; NOT -> PAG, SOP).
- `8_Diseno_Piloto/2_Plataforma_Transversal/T-07_Modelo_de_dominio_Notificaciones_archivos_auditoria_y_eventos.mmd` (Plantilla, Mensaje, IntentoEntrega, Preferencia).
- `.../T-S5_Secuencia_Recordatorio_programado_con_preferencias_del_paciente.mmd` (worker + BullMQ + preferencia).
- `.../T-S7_Secuencia_Relay_del_outbox_hacia_los_consumidores.mmd` (consumo de eventos).

## 9. Ambigüedades y preguntas candidatas
1. ¿Partir R2-09? Recomendación: sí, a (envío + Resend + estados), b (plantillas back), c (consumidores de eventos ya publicados). RF-062 al paquete FE.
2. ¿Qué hacer con persona_id y consentimiento sin TR-PER? Recomendación: NOT después de R2-01 (orden PL-10 lo permite: S13 antes de S15); `ConsentimientoPort` contra TR-PER; si se adelanta, puerto nulo y solo TRANSACCIONAL.
3. ¿Resend por HTTP (SDK) o SMTP? Recomendación: API HTTP con `Idempotency-Key` = mensaje_id y webhooks firmados (Svix); el SMTP queda para Supabase Auth.
4. ¿Dominio de envío verificado? Recomendación: requisito antes de staging de NOT; sin él solo llega al dueño de la cuenta. Pedir al usuario el dominio.
5. ¿Cuenta Resend única de plataforma o por tenant? Recomendación: única de plataforma en R2 (secreto por entorno, regla 9); por tenant solo si un cliente lo exige (TR-RNF-113/121, R3).
6. ¿Guardar el destino en claro? Recomendación: correo cifrado o solo `persona_id` + hash; logs sin destinatario (TR-RNF-026).
7. Límite de consumo (TR-RNF-128) sin historia. Recomendación: contador mensual por tenant y canal en `not`, sin corte en R2; corte en R3 con WhatsApp.
8. `plat.notificacion.plantilla` no sigue `recurso.accion`. Recomendación: `plat.plantilla_notificacion.gestionar` en el manifiesto, citando el ID del SRS.
9. Centro de notificaciones Socket.IO del shell (hoja Componentes) no tiene RF ni historia. Recomendación: fuera de R2; anotarlo como hueco del SRS y decidir en R3 (T-S4 también lo menciona para el estado del pago).
10. ¿Conmutación de canal (079) en R2 con solo correo? Recomendación: implementar el estado y el «contacto inválido»; la conmutación llega con WhatsApp/SMS (R3).
