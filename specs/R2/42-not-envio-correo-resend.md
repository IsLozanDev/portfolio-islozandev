# SPEC 42 — Notificaciones: envío de correo transaccional por Resend con consentimiento, cola, reintentos y estados por webhook firmado

> **Status:** Implementado
> **Depends on:** SPEC 11, SPEC 21, SPEC 37, SPEC 41
> **Date:** 2026-11-22
> **Objective:** Crear `libs/plataforma/notificaciones` con `NotificacionPort.enviar`, que valida consentimiento y contactos inválidos, renderiza una plantilla versionada, registra el mensaje en la transacción del llamador y lo entrega por Resend desde una cola BullMQ del worker con reintentos, y actualiza su estado con el webhook firmado del proveedor.

## Por qué existe este spec

Fila 42 de `docs/roadmap-specs.md` (R2-09: TR-RF-075 y TR-RF-079 en el canal CORREO). Contexto: `docs/spec-context/tr-not/not-correo-plantillas-estados.md`, parte a. Es el puerto más usado de R2: lo consumen FE (spec 59), los consumidores de plataforma (spec 44), recordatorios (45), ARCO (64), PAG (77) y soporte.

El plan da 6 h a toda R2-09. Con la lib nueva, la cola, el adaptador, el webhook firmado y el consentimiento, esta parte sola estima 9-10 h. Si se pasa de 10 h se recorta el CLI de prueba (paso 7), que pasa al spec 44.

Lo que hay en el código hoy (revisado al redactar):

- No existe lib `notificaciones`, esquema `ntf` ni puerto nulo de notificaciones. Los specs 03, 12, 17a, 18, 18b y 20b solo publican eventos.
- Resend solo es el SMTP de Supabase Auth (spec 02, `docs/ops/supabase-ambientes.md` §3). Remitente `onboarding@resend.dev`: sin dominio verificado solo entrega al dueño de la cuenta.
- `personas` (spec 37) exporta `CONSENTIMIENTO_PORT` (`vigente(personaId, finalidad)`) y `PERSONA_PORT` (`obtener(personaId)` con `contactos[]` de tipo, valor y `principal`).
- `eventos`: `@SuscribirEvento`, consumo idempotente por `event_id`, registro de esquemas por componente (`registrarEsquemasPer`).
- `identidad`: `CircuitBreaker` en memoria (`infrastructure/respaldo/circuit-breaker.ts`).
- `observabilidad`: `hashDocumento(valor, sal)` (SHA-256 con sal de plataforma), `CAMPOS_SENSIBLES`.
- Worker: colas BullMQ en `apps/worker/src/archivos/` y `vencimientos/`; CLI en `apps/worker/src/cli/`.
- `apps/api` no tiene `rawBody` habilitado ni ningún webhook entrante.
- Última letra de migración: `01n` (SEC).

## Alcance

**Entra:**

- Lib nueva `libs/plataforma/notificaciones` con el molde de `libs/plataforma/secretos`, etiquetas `scope:plataforma`, `type:backend`, `comp:not`; alias `@vitrina/plataforma/notificaciones`.
- Esquema `ntf`: `ntf.plantilla`, `ntf.mensaje`, `ntf.intento_entrega`, `ntf.contacto_invalido`. Semilla de la plantilla base `PRUEBA_CORREO`.
- Puerto en proceso `NotificacionPort.enviar` (solo canal CORREO), idempotente por `claveIdempotencia`.
- Destinatario por `personaId` (correo principal de la persona en TR-PER) o por dirección de correo directa.
- TR-RN-025 completa: TRANSACCIONAL respeta contactos inválidos; PROMOCIONAL exige consentimiento `PROMOCIONES` vigente y la ventana de 08:00 a 20:00 de Lima.
- `RenderizadorPlantilla` en el dominio: `{{variable}}` con variables declaradas y escape HTML del cuerpo.
- Evento interno `not.mensaje.solicitado` por outbox; su consumidor en el worker encola en BullMQ `not-envios` (con retardo si está programado).
- Adaptador `ProveedorCorreo` con el SDK oficial `resend`: `Idempotency-Key` = id del mensaje, timeout, circuit breaker y límite de tasa de la cola.
- Reintentos: 3 con backoff exponencial ante error temporal; error definitivo deja el mensaje `FALLIDO`.
- Webhook `POST /v1/notificaciones/webhooks/resend` con `@Publico` y firma Svix verificada (tolerancia de 5 min): estados ENVIADO, ENTREGADO, LEIDO, FALLIDO; rebote duro marca el contacto inválido.
- Variables de entorno `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`, `NOT_REMITENTE` y `NOT_SAL_DESTINO`.
- CLI `pnpm notificaciones:probar` para el humo con correo real.
- Migración `db/01o_not.sql` con inverso y prueba SQL.

**No entra (specs futuros):**

- API de plantillas, personalización por tenant, versiones y vista previa (TR-RF-074, spec 43). Aquí la plantilla del tenant se lee si existe, pero solo se crea por semilla.
- Correos de eventos ya publicados (vencimiento, suspensión, integridad, soporte) y sus plantillas: spec 44.
- `programar` y `cancelar` de recordatorios (TR-RF-076, spec 45). La ventana horaria de promocionales sí entra, porque es parte de TR-RN-025.
- Preferencias y bajas del destinatario (TR-RF-077, spec 46) y marcar el contacto inválido en la ficha de TR-PER.
- WhatsApp, SMS y PUSH, y la conmutación de canal (TR-RF-078/079, spec 104). En R2 un rebote duro no tiene canal alterno.
- Cuenta de Resend por tenant y sus credenciales en la bóveda (TR-RNF-113 para NOT).
- Límite de consumo mensual por tenant (TR-RNF-128) y métricas OTel de la cola.
- Centro de notificaciones Socket.IO del shell (sin RF).
- Endpoint de consulta de mensajes y UI.
- Entrega del comprobante electrónico (TR-RF-062, spec 59).

## Base de código reutilizada

| Pieza | Qué se hace |
| --- | --- |
| `libs/plataforma/secretos` (`project.json`, `jest.config`, `tsconfig.*`) | Molde de la lib nueva: capas, etiquetas y alias en `tsconfig.base.json`. |
| `kernel` / `kernel-infra` (`UnitOfWork`, `TypeOrmUnitOfWork`, `TenantContext`, `OutboxPublisher`, `Clock`, `uuidV7`, `REPORTADOR_ERRORES`) | Transacción del llamador, evento interno por outbox, ids. |
| `eventos` (`@SuscribirEvento`, registro de esquemas) | Consumidor de `not.mensaje.solicitado` y `registrarEsquemasNot`. |
| `personas` (`CONSENTIMIENTO_PORT`, `PERSONA_PORT`) | Consentimiento `PROMOCIONES` y correo principal de la persona. |
| `identidad` `CircuitBreaker` | Mismo patrón (umbral 5, apertura 30 s) en `infrastructure/resend`; se copia, no se importa (NOT no depende de IDN). |
| `observabilidad` (`hashDocumento`, logger) | `destino_hash` del correo y logs sin dirección (TR-RNF-026). |
| `org` (`ZONA_VENCIMIENTOS = 'America/Lima'`) | Zona de la ventana horaria. |
| `apps/worker/src/archivos/` | Patrón de cola BullMQ con trabajo por id y cierre ordenado. |
| `arc.versiones_pendientes_vencidas` (spec 35) | Patrón de `ntf.mensaje_por_id_externo` (`SECURITY DEFINER`, dueño `org_lector`). |
| `apps/worker/src/cli/ejecutar-auditoria.ts` | Patrón del CLI de prueba. |

## Modelo de datos

### Migración `db/01o_not.sql` (+ `db/rollback/01o_not.sql`, `db/tests/01o_not.test.sql`)

```sql
CREATE SCHEMA ntf;  -- `not` es palabra reservada de PostgreSQL

CREATE TABLE ntf.plantilla (
  id                 uuid PRIMARY KEY,
  tenant_id          uuid,                                    -- NULL = base de plataforma
  codigo             varchar(60) NOT NULL CHECK (codigo ~ '^[A-Z][A-Z0-9_]{1,59}$'),
  canal              varchar(10) NOT NULL CHECK (canal IN ('CORREO','SMS','WHATSAPP','PUSH')),
  idioma             varchar(5)  NOT NULL DEFAULT 'es',
  version            integer     NOT NULL CHECK (version >= 1),
  asunto             varchar(150),
  cuerpo             text        NOT NULL CHECK (char_length(cuerpo) BETWEEN 1 AND 100000),
  variables          jsonb       NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(variables) = 'array'),  -- [{nombre, tipo}]
  plantilla_base_id  uuid REFERENCES ntf.plantilla(id),
  activa             boolean     NOT NULL DEFAULT true,
  creado_en          timestamptz NOT NULL DEFAULT now(),
  CHECK (canal <> 'CORREO' OR asunto IS NOT NULL)
);
CREATE UNIQUE INDEX uq_plantilla_version
  ON ntf.plantilla (COALESCE(tenant_id, '00000000-0000-0000-0000-000000000000'), codigo, canal, idioma, version);

CREATE TABLE ntf.mensaje (
  id                  uuid PRIMARY KEY,
  tenant_id           uuid NOT NULL,
  plantilla_id        uuid NOT NULL REFERENCES ntf.plantilla(id),
  canal               varchar(10) NOT NULL CHECK (canal = 'CORREO'),           -- se amplía en el spec 104
  destino             varchar(254) NOT NULL,                                   -- en claro: lo necesita el proveedor
  destino_hash        varchar(80)  NOT NULL,
  persona_id          uuid,
  finalidad           varchar(14)  NOT NULL CHECK (finalidad IN ('TRANSACCIONAL','PROMOCIONAL')),
  asunto              varchar(150) NOT NULL,                                   -- ya renderizado
  cuerpo              text         NOT NULL,                                   -- ya renderizado
  clave_idempotencia  uuid         NOT NULL,
  estado              varchar(28)  NOT NULL CHECK (estado IN
                        ('ENCOLADO','ENVIADO','ENTREGADO','LEIDO','FALLIDO','OMITIDO_SIN_CONSENTIMIENTO','DESCARTADO')),
  id_externo          varchar(100),
  motivo_fallo        varchar(300),
  programado_para     timestamptz,
  enviado_en          timestamptz,
  entregado_en        timestamptz,
  version             integer      NOT NULL DEFAULT 1,
  creado_por          uuid,
  creado_en           timestamptz  NOT NULL DEFAULT now(),
  modificado_en       timestamptz,
  CONSTRAINT uq_mensaje_idempotencia UNIQUE (tenant_id, clave_idempotencia)
);
CREATE UNIQUE INDEX uq_mensaje_id_externo ON ntf.mensaje (id_externo) WHERE id_externo IS NOT NULL;
CREATE INDEX ix_mensaje_tenant_estado ON ntf.mensaje (tenant_id, estado);

CREATE TABLE ntf.intento_entrega (
  id                   uuid PRIMARY KEY,
  tenant_id            uuid NOT NULL,
  mensaje_id           uuid NOT NULL REFERENCES ntf.mensaje(id),
  numero               smallint NOT NULL CHECK (numero >= 1),
  resultado            varchar(20) NOT NULL CHECK (resultado IN ('ACEPTADO','ERROR_TEMPORAL','ERROR_DEFINITIVO','CALLBACK')),
  respuesta_proveedor  jsonb NOT NULL DEFAULT '{}',          -- sin destino ni cuerpo
  en                   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_intento_mensaje ON ntf.intento_entrega (mensaje_id);

CREATE TABLE ntf.contacto_invalido (
  tenant_id     uuid NOT NULL,
  canal         varchar(10) NOT NULL,
  destino_hash  varchar(80) NOT NULL,
  motivo        varchar(40) NOT NULL,                        -- REBOTE_DURO | QUEJA_SPAM
  desde         timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, canal, destino_hash)
);
```

- RLS `ENABLE + FORCE` en las cuatro tablas con `tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid`. `ntf.plantilla` en lectura: `tenant_id IS NULL OR tenant_id = <tenant>`; en escritura solo filas del tenant (las base solo por migración).
- `ntf.mensaje`: `SELECT`, `INSERT`, `UPDATE`. `ntf.intento_entrega` y `ntf.contacto_invalido`: `SELECT`, `INSERT` (y `ON CONFLICT DO NOTHING` en el inválido).
- `ntf.mensaje_por_id_externo(p_id_externo varchar)` `SECURITY DEFINER`, `search_path = ''`, dueño `org_lector`: devuelve `(id, tenant_id)` del mensaje, de cualquier tenant. Lo usa solo el webhook, que llega sin tenant. `GRANT SELECT ON ntf.mensaje TO org_lector` con política `mensaje_lector FOR SELECT TO org_lector USING (true)`.
- `REVOKE ALL ... FROM PUBLIC`; `GRANT` al `current_user`; `REVOKE` a `anon` y `authenticated` si existen (regla 8). Sin `TRUNCATE`.
- Semilla: plantilla base `PRUEBA_CORREO` (CORREO, `es`, versión 1), asunto `Prueba de correo de {{producto}}`, cuerpo HTML simple con `{{nombre}}`, variables `[{"nombre":"nombre","tipo":"texto"},{"nombre":"producto","tipo":"texto"}]`, id fijo.
- Inverso: borra la función, las tablas y el esquema. Se niega si `ntf.mensaje` tiene filas en estado `ENCOLADO`.

### Dominio (`libs/plataforma/notificaciones/src/domain/`)

- `canal.ts`: `CANALES_NOTIFICACION = ['CORREO','SMS','WHATSAPP','PUSH']`; `CANALES_HABILITADOS = ['CORREO']`.
- `finalidad-notificacion.ts`: `FINALIDADES_NOTIFICACION = ['TRANSACCIONAL','PROMOCIONAL']`; mapeo PROMOCIONAL → finalidad de TR-PER `PROMOCIONES`.
- `estado-mensaje.ts`: estados y orden de avance `ENCOLADO < ENVIADO < ENTREGADO < LEIDO`; `FALLIDO`, `OMITIDO_SIN_CONSENTIMIENTO` y `DESCARTADO` son finales. `avanzar(actual, nuevo)` devuelve el estado nuevo o `null` si es repetido o retrocede (un webhook viejo no pisa uno nuevo).
- `mensaje.ts`: agregado `Mensaje` con `marcarEnviado(idExterno, en)`, `marcarEntregado(en)`, `marcarLeido(en)`, `marcarFallido(motivo)`, `version`.
- `plantilla.ts`: `Plantilla` (código, canal, versión, asunto, cuerpo, variables declaradas).
- `renderizador-plantilla.ts`: `renderizar(plantilla, variables)`. `{{nombre}}` con espacios opcionales. Variable usada en la plantilla y no recibida → `VariablesIncompletasError` (lista los nombres). Variable recibida y no declarada → `VariableNoPermitidaError` («Variable no permitida: diagnostico», TR-CA-185). En el cuerpo los valores se escapan para HTML (`& < > " '`); en el asunto se insertan como texto plano sin saltos de línea.
- `ventana-promocional.ts`: `programarPromocional(instante, zona)` → `null` si la hora de Lima está entre 08:00 y 20:00 (20:00 excluido); si no, las 08:00 del mismo día (antes de las 08:00) o del día siguiente (desde las 20:00). Constantes `HORA_INICIO_PROMOCIONAL = 8`, `HORA_FIN_PROMOCIONAL = 20`.
- `correo-destino.ts`: normaliza (trim, minúsculas) y valida formato y longitud ≤ 254 → `DestinoInvalidoError`.
- `errores.ts`: los anteriores, `PlantillaNoEncontradaError` (`NotFoundError`), `CanalNoHabilitadoError`, `PersonaSinCorreoError`, `PromocionalSinPersonaError`, `ProveedorNoConfiguradoError`. Ningún error lleva el destino ni los valores de las variables.

### Puertos (`application/ports/`)

```ts
export const NOTIFICACION_PORT = Symbol('NotificacionPort');

export type Destinatario = { personaId: string } | { correo: string };

export interface EnviarNotificacionComando {
  plantilla: string;                        // código, p. ej. 'PRUEBA_CORREO'
  destinatario: Destinatario;
  variables: Record<string, string | number>;
  canal?: 'CORREO';                         // por defecto CORREO; otro → CanalNoHabilitadoError
  finalidad: 'TRANSACCIONAL' | 'PROMOCIONAL';
  claveIdempotencia: string;                // uuid
}

export interface NotificacionRegistrada {
  mensajeId: string;
  estado: 'ENCOLADO' | 'OMITIDO_SIN_CONSENTIMIENTO' | 'DESCARTADO';
  programadoPara?: Date;
  repetida: boolean;                        // misma clave: devuelve el mensaje existente
}

/** TR-RF-075. Tenant y usuario salen del TenantContext. Se une a la transacción del llamador (UnitOfWork.run). */
export interface NotificacionPort {
  enviar(comando: EnviarNotificacionComando): Promise<NotificacionRegistrada>;
}

export interface ProveedorCorreo {
  /** Lanza ErrorTemporalProveedor (timeout, 5xx, 429, circuito abierto) o ErrorDefinitivoProveedor (4xx de validación). */
  enviar(correo: { mensajeId: string; remitente: string; destino: string; asunto: string; html: string }): Promise<{ idExterno: string }>;
}

export interface VerificadorWebhook {
  /** Firma Svix (`svix-id`, `svix-timestamp`, `svix-signature`) sobre el cuerpo crudo; FirmaWebhookInvalidaError si falla o difiere > 5 min. */
  verificar(cuerpoCrudo: Buffer, cabeceras: Record<string, string | undefined>): EventoProveedor;
}

export type EventoProveedor =
  | { tipo: 'ENVIADO' | 'ENTREGADO' | 'LEIDO'; idExterno: string; en: Date }
  | { tipo: 'REBOTE_DURO' | 'QUEJA_SPAM'; idExterno: string; en: Date; detalle: string }
  | { tipo: 'IGNORADO'; idExterno?: string };   // delivery_delayed, clicked, rebote transitorio

export interface RepositorioPlantillas {
  /** La del tenant activa de mayor versión; si no hay, la base activa de mayor versión. */
  vigente(codigo: string, canal: string, idioma: string): Promise<Plantilla | null>;
}

export interface RepositorioMensajes {
  porClave(claveIdempotencia: string): Promise<Mensaje | null>;
  obtener(mensajeId: string): Promise<Mensaje | null>;
  insertar(mensaje: Mensaje): Promise<void>;                    // conflicto de clave → relee y devuelve el existente
  actualizar(mensaje: Mensaje, versionEsperada: number): Promise<void>;
  registrarIntento(intento: IntentoEntrega): Promise<void>;
}

export interface RepositorioContactosInvalidos {
  esInvalido(canal: string, destinoHash: string): Promise<boolean>;
  marcar(canal: string, destinoHash: string, motivo: string): Promise<void>;   // idempotente
}

export interface LocalizadorMensajes {
  /** Cruza tenants (función SECURITY DEFINER). */
  porIdExterno(idExterno: string): Promise<{ mensajeId: string; tenantId: string } | null>;
}
```

### Casos de uso (`application/`)

- `EnviarNotificacion` (implementa `NotificacionPort`), en una `UnitOfWork.run` unida a la del llamador:
  1. Canal distinto de CORREO → `CanalNoHabilitadoError`. Clave ya usada en el tenant → devuelve el mensaje existente con `repetida: true` (TR-RNF-008), sin evento nuevo.
  2. Resuelve el destino: `personaId` → correo principal de `PERSONA_PORT.obtener` (o el primero de tipo correo); sin correo → `PersonaSinCorreoError`. `correo` → se normaliza y valida.
  3. Busca la plantilla vigente (`es`); no hay → `PlantillaNoEncontradaError`. Renderiza asunto y cuerpo.
  4. PROMOCIONAL sin `personaId` → `PromocionalSinPersonaError`. PROMOCIONAL sin `PROMOCIONES` vigente en `CONSENTIMIENTO_PORT.vigente` → mensaje `OMITIDO_SIN_CONSENTIMIENTO` (TR-CA-188). PROMOCIONAL fuera de la ventana → `programado_para` a las 08:00 de Lima (TR-CA-189).
  5. Destino en `ntf.contacto_invalido` → mensaje `DESCARTADO` con `motivo_fallo = 'CONTACTO_INVALIDO'`.
  6. Si queda `ENCOLADO`: inserta el mensaje y publica `not.mensaje.solicitado` (`{ mensajeId, programadoPara? }`, sin destino) por outbox en la misma transacción. Los omitidos y descartados también se insertan (queda constancia), sin evento.
- `EncolarEnvio` (consumidor de `not.mensaje.solicitado` en el worker): agrega a `not-envios` con `jobId = mensajeId` y `delay` hasta `programadoPara`. Idempotente por `event_id` y por `jobId`.
- `EntregarMensaje` (procesador de `not-envios`, en el contexto del tenant del trabajo): mensaje que ya no está `ENCOLADO` → termina sin enviar. Llama a `ProveedorCorreo.enviar` con `NOT_REMITENTE`; éxito → `marcarEnviado(idExterno)` e intento `ACEPTADO`. Error temporal → intento `ERROR_TEMPORAL` y relanza para que BullMQ reintente (3 intentos, backoff exponencial desde 5 s); en el último → `FALLIDO` con `REINTENTOS_AGOTADOS`. Error definitivo → `FALLIDO` con el código del proveedor, sin reintento.
- `ProcesarEventoProveedor` (webhook): `verificar` → `porIdExterno`; desconocido → 200 sin cambios (log `warn` con el id externo). Con el contexto del tenant: aplica `avanzar` (repetido o retroceso → sin cambios), registra intento `CALLBACK` y, en `REBOTE_DURO` o `QUEJA_SPAM`, `marcarFallido` y `contactosInvalidos.marcar`. Sin canal alterno en R2.

### Infraestructura

- `resend/proveedor-correo.resend.ts`: SDK `resend` (versión y API exactas por ctx7 al implementar): `emails.send` con `idempotencyKey = mensajeId`; timeout de 10 s con `AbortSignal.timeout` o `Promise.race`; `CircuitBreaker` local (5 fallos, 30 s). Clasifica errores: timeout, red, 5xx, 429 → temporal; resto → definitivo.
- `resend/verificador-webhook.resend.ts`: verificación Svix con `RESEND_WEBHOOK_SECRET` (método del SDK si existe; si no, paquete `svix`), tolerancia 5 min. Mapeo: `email.sent` → ENVIADO, `email.delivered` → ENTREGADO, `email.opened` → LEIDO, `email.bounced` permanente → REBOTE_DURO, `email.complained` → QUEJA_SPAM, el resto → IGNORADO.
- `typeorm/entidades.ts`, `mapeo.ts`, repositorios con `getRepository` sobre el `EntityManager` activo; `insertar` con `orIgnore()` y relectura por clave.
- `typeorm/mensaje-por-id-externo.sql.ts`: único SQL crudo (función de base de datos, regla 11).
- `bullmq/cola-envios.ts`: `abrirColaEnvios(redisUrl)` (como `abrirColaImportaciones`); `limiter` de la cola según el límite de tasa de la cuenta de Resend (por defecto 2 por segundo, constante con nombre).
- `event-schemas.ts`: `ESQUEMAS_NOT` y `registrarEsquemasNot(validator)` para `not.mensaje.solicitado`.
- `interface/entorno-notificaciones.ts`: `camposEntornoNotificaciones` (`RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`, `NOT_REMITENTE`, `NOT_SAL_DESTINO`, opcionales) con `superRefine` que los exige en `production`. Sin ellos en dev, la app arranca y `EntregarMensaje` / el webhook lanzan `ProveedorNoConfiguradoError`.
- `interface/webhooks.controller.ts`: `POST /v1/notificaciones/webhooks/resend`, `@Publico`, cuerpo crudo (`RawBodyRequest`), 204 si se procesó o se ignoró, 401 `FIRMA_WEBHOOK_INVALIDA` (log `warn` sin cuerpo, TR-RNF-109). OpenAPI con las cabeceras Svix. No es un permiso asignable.

### Composición

- `NotificacionesModule.register({ entorno })` (api: puerto + webhook) y `NotificacionesModule.registerWorker({ redisUrl, entorno })` (worker: consumidor y procesador). Exporta `NOTIFICACION_PORT`. `ENTIDADES_NOT` en el `DataSource` de api y worker; `registrarEsquemasNot` en los dos.
- `apps/api/src/main.ts`: `NestFactory.create(..., { rawBody: true })`. Se comprueba que no cambia el parseo JSON del resto de rutas.
- `apps/worker/src/notificaciones/`: módulo con la cola `not-envios` y cierre ordenado.
- `apps/worker/src/cli/probar-notificacion.ts` y scripts `notificaciones:probar` y `notificaciones:probar:remoto`: `--tenant <id> --correo <dir>` envía `PRUEBA_CORREO` por el puerto (pasa por outbox, cola y Resend) e imprime el id del mensaje y su estado final tras 30 s.
- `eslint.config.mjs`: `comp('not', 'kernel', 'evt', 'per', 'obs')` (ajustar a los nombres reales de la matriz); prueba en `tools/boundaries-test`.
- `.env.example`: las cuatro variables. `docs/ops/supabase-ambientes.md`: sección Resend de TR-NOT (API key distinta de la del SMTP de Auth, dominio verificado como requisito de staging, alta del webhook en el panel con la URL de la API y el secreto).
- `src/index.ts`: `NOTIFICACION_PORT`, `NotificacionPort`, los tipos del comando, `NotificacionesModule`, `ENTIDADES_NOT`, `registrarEsquemasNot`, `camposEntornoNotificaciones` y los errores, por ruta explícita.

## Plan de implementación

1. **Lib y migración.** Lib con el molde de `secretos`, alias, etiquetas, matriz de límites. `db/01o_not.sql`, inverso y prueba SQL: CHECK, unicidad de clave por tenant, plantilla base visible a dos tenants y la de un tenant no visible al otro, función por id externo cruza tenants, inverso que se niega con mensajes encolados.
2. **Dominio.** Estados y `avanzar`, `Mensaje`, `Plantilla`, `RenderizadorPlantilla`, ventana promocional y correo destino, con pruebas (incluye 21:30 → 08:00 del día siguiente, 06:00 → 08:00 del mismo día, 19:59 → sin programar, escape HTML, variable no declarada y faltante).
3. **Persistencia.** Entidades, mapeo, repositorios y `MensajePorIdExternoSql`. Integración contra base temporal: clave repetida concurrente deja un mensaje, bloqueo optimista, aislamiento.
4. **Envío.** `EnviarNotificacion` con dobles de `PERSONA_PORT` y `CONSENTIMIENTO_PORT`, evento por outbox; `registrarEsquemasNot`.
5. **Cola y proveedor.** Adaptador Resend (ctx7 antes de escribir), `EncolarEnvio`, `EntregarMensaje`, módulo del worker. Pruebas con un `ProveedorCorreo` falso: temporal × 3 → `FALLIDO`; definitivo → `FALLIDO` sin reintento; proveedor caído no bloquea `enviar`.
6. **Webhook.** `rawBody` en api, verificador, `ProcesarEventoProveedor`, controlador y OpenAPI. Pruebas con cargas firmadas con un secreto de prueba: válida, firma alterada, marca de tiempo de hace 6 min, repetida, retroceso, rebote duro.
7. **CLI y entorno.** `camposEntornoNotificaciones`, `.env.example`, `notificaciones:probar`, `docs/ops`.
8. **Cierre.** `code-simplifier` sobre los archivos tocados; `pnpm db:up:remoto` en Supabase dev; humo con `notificaciones:probar:remoto` al correo del dueño de la cuenta de Resend (único que entrega sin dominio); `npx nx run-many -t lint test -p notificaciones api worker migrar boundaries-test`.

## Criterios de aceptación

- [ ] TR-CA-187 (adaptado a CORREO): `enviar` TRANSACCIONAL con `PRUEBA_CORREO` a un correo directo deja el mensaje `ENCOLADO` y, con el worker en marcha, `ENVIADO` con `id_externo` en menos de 30 s.
- [ ] Con `personaId`, el destino es el correo principal de la persona; persona sin correo → `PersonaSinCorreoError` y no se inserta mensaje.
- [ ] TR-CA-188: PROMOCIONAL a una persona sin `PROMOCIONES` vigente → mensaje `OMITIDO_SIN_CONSENTIMIENTO`, sin evento ni envío. PROMOCIONAL sin `personaId` → `PromocionalSinPersonaError`.
- [ ] TR-CA-189: PROMOCIONAL con consentimiento a las 21:30 de Lima → `programado_para` a las 08:00 del día siguiente y el trabajo con ese retardo; TRANSACCIONAL a las 21:30 sale de inmediato.
- [ ] Idempotencia (TR-RNF-008): dos `enviar` con la misma `claveIdempotencia`, también concurrentes, dejan un mensaje y un solo envío; el segundo devuelve el mismo `mensajeId` con `repetida: true`. Resend recibe `Idempotency-Key = mensajeId`.
- [ ] Si la transacción del llamador se revierte, no queda mensaje ni evento.
- [ ] TR-CA-185 (en el renderizado): variable no declarada → «Variable no permitida: diagnostico»; variable declarada sin valor → `VariablesIncompletasError`; un valor con `<script>` llega escapado al cuerpo.
- [ ] Error temporal del proveedor se reintenta 3 veces con backoff y luego deja `FALLIDO` con `REINTENTOS_AGOTADOS`; error definitivo deja `FALLIDO` sin reintentos; cada intento queda en `ntf.intento_entrega`.
- [ ] TR-RNF-007: con el proveedor caído, `enviar` responde igual (no llama al proveedor) y el circuito abierto deja de llamar a Resend durante 30 s.
- [ ] TR-CA-197 (adaptado a correo): webhook `email.delivered` firmado → `ENTREGADO` con `entregado_en`.
- [ ] TR-CA-198 (adaptado): webhook de rebote duro → `FALLIDO` con motivo, fila en `ntf.contacto_invalido`, y un `enviar` posterior al mismo correo en ese tenant queda `DESCARTADO` sin envío. Sin canal alterno.
- [ ] TR-RNF-109: firma inválida o marca de tiempo con más de 5 min de diferencia → 401 `FIRMA_WEBHOOK_INVALIDA`, registrado en el log sin el cuerpo; el mensaje no cambia.
- [ ] Webhook repetido o fuera de orden (`delivered` y después `sent`) no cambia el estado ni duplica efectos; id externo desconocido → 204 sin cambios.
- [ ] Aislamiento (TR-RNF-010): la prueba SQL con dos `app.tenant_id` no ve mensajes, intentos ni contactos inválidos ajenos; la plantilla base se ve desde los dos.
- [ ] TR-RNF-026: ningún log, error ni evento contiene el correo del destinatario ni las variables; solo `destino_hash` y `mensajeId`. gitleaks del CI pasa.
- [ ] En `production`, sin `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`, `NOT_REMITENTE` o `NOT_SAL_DESTINO`, api y worker no arrancan; en `development` arrancan y el envío falla con `ProveedorNoConfiguradoError` (el mensaje queda `ENCOLADO` y se reintenta).
- [ ] `rawBody` en api no rompe las rutas existentes (suite de `api` verde).
- [ ] Humo en dev: `notificaciones:probar:remoto` entrega el correo al dueño de la cuenta de Resend y el mensaje queda `ENVIADO`.
- [ ] `notificaciones` solo importa de los componentes declarados en la matriz; la prueba de `tools/boundaries-test` lo cubre.
- [ ] Migración `01o_not` reversible y probada en CI contra PostgreSQL 16.
- [ ] Cobertura de dominio de `notificaciones` ≥ 70 %.
- [ ] El código nuevo sigue la sección «Código limpio» de `CLAUDE.md`; persistencia con TypeORM, con el único SQL crudo en `MensajePorIdExternoSql`.
- [ ] `npx nx run-many -t lint test -p notificaciones api worker migrar boundaries-test` verde; `nx affected` verde en el CI del PR.

## Decisiones

- **Sí:** destino en claro en `ntf.mensaje` más `destino_hash`. Decisión del usuario. Resend necesita la dirección al enviar y los reintentos ocurren después; la tabla tiene RLS y no sale por API; los logs solo llevan el hash.
- **No:** solo `personaId`. Hay destinatarios sin persona (el propietario invitado en el alta de tenant, spec 12).
- **No:** el destino cifrado en la bóveda. Decisión del usuario. No es un secreto y costaría una fila de `sec` por mensaje.
- **Sí:** TR-RN-025 completa (consentimiento `PROMOCIONES` y ventana de 08:00 a 20:00 de Lima). Decisión del usuario. `ConsentimientoPort` del spec 37 ya existe.
- **Sí:** PROMOCIONAL exige `personaId`. El consentimiento se guarda por persona; sin persona no hay forma de verificarlo.
- **Sí:** los omitidos y descartados se guardan como mensaje. Queda la evidencia de que no se envió y por qué.
- **Sí:** contacto inválido en `ntf.contacto_invalido`, por hash. Decisión del usuario. PER no cambia; marcarlo en la ficha queda para el spec 46.
- **Sí:** remitente por variable de entorno `NOT_REMITENTE` y cuenta única de plataforma. Decisión del usuario. Dominio verificado como requisito de staging; cuenta por tenant solo si un cliente la exige.
- **Sí:** SDK oficial `resend` para enviar y verificar. Decisión del usuario. `Idempotency-Key` y firma Svix sin código criptográfico propio.
- **Sí:** solo se siembra `PRUEBA_CORREO`. Decisión del usuario. Las plantillas de eventos de plataforma entran con sus consumidores (spec 44).
- **Sí:** el mensaje se registra en la transacción del llamador y el encolado va por outbox (`not.mensaje.solicitado`). Regla 4: si el caso de uso se revierte no sale ningún correo, y si Redis está caído el mensaje no se pierde.
- **Sí:** cola propia `not-envios` con `jobId = mensajeId`. Retardo para programados, reintentos y límite de tasa propios del proveedor, separados de la política del relay.
- **Sí:** asunto y cuerpo ya renderizados en el mensaje. Los reintentos envían lo mismo aunque la plantilla cambie después, y queda constancia de lo enviado.
- **Sí:** estados que solo avanzan. Los webhooks llegan repetidos y desordenados; no hace falta una tabla de entregas recibidas.
- **Sí:** `ntf.mensaje_por_id_externo` con `SECURITY DEFINER`. El webhook llega sin tenant; después todo corre con el contexto del tenant y RLS.
- **Sí:** `plat.notificacion.enviar` es llamada interna, sin permiso en el manifiesto (como `plat.auditoria.registrar` del 20a). El manifiesto no cambia en este spec.
- **Sí:** el `CircuitBreaker` se copia a NOT en vez de importarlo de IDN. NOT no depende de IDN en PL-10; si un tercer componente lo necesita se sube a `kernel-infra`.
- **No:** eventos públicos (`notificacion.fallida`). Ningún consumidor lo pide todavía.
- **Sí:** esquema `ntf` en vez del `not` del paquete de contexto. `NOT` es palabra reservada de PostgreSQL y obligaría a citar el esquema en cada consulta y en TypeORM. Lib, etiqueta (`comp:not`) y eventos conservan `not`.
- **Sí:** migración `01o_not` (letra siguiente a SEC).

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| Sin dominio verificado, Resend solo entrega al dueño de la cuenta | El humo de dev usa ese correo; el dominio verificado es requisito de staging y queda en `docs/ops/supabase-ambientes.md`. |
| El webhook no llega a una API local | Las pruebas firman cargas con un secreto de prueba; el webhook real se registra contra staging. |
| `rawBody: true` cambia el comportamiento de algún parser existente | La suite completa de `api` corre en el cierre; el cuerpo crudo solo se lee en el controlador del webhook. |
| La API del SDK de Resend difiere de lo asumido (`idempotencyKey`, verificación) | Se consulta con ctx7 antes del paso 5; si el SDK no verifica Svix, se usa el paquete `svix`. |
| El límite de tasa de la cuenta de Resend es otro | Constante con nombre en el `limiter`; un 429 es error temporal y se reintenta. |
| Las dos ramas paralelas (42 y 49) tocan `tsconfig.base.json`, `eslint.config.mjs`, `package.json`, `env.ts` y los módulos de api y worker | Conflictos de líneas contiguas, sin cambios semánticos cruzados; el segundo PR se rebasa sobre el primero. |

## Lo que **no** entra en este spec

- API y UI de plantillas (specs 43 y 47).
- Correos de eventos de plataforma (spec 44).
- Recordatorios programados por el producto, preferencias y bajas (specs 45 y 46).
- WhatsApp, SMS, PUSH y conmutación de canal (spec 104).
- Cuenta de Resend por tenant, límite de consumo y métricas OTel.
- Consulta de mensajes por API y centro de notificaciones.

Cada uno, si llega, va en su propio spec.
