# SPEC 11 — Eventos: relay del outbox en el worker, suscriptores idempotentes y reproceso de fallidos

> **Status:** Aprobado
> **Depends on:** SPEC 02, SPEC 06, SPEC 10
> **Date:** 2026-10-25
> **Objective:** Crear `libs/plataforma/eventos` (TR-EVT) y `apps/worker`, donde un relay lee `sync.outbox` por cursor con margen de seguridad y lo entrega por colas BullMQ a los consumidores declarados con `@SuscribirEvento`, al menos una vez e idempotente por `event_id`, con cola de fallidos en PostgreSQL y reproceso por `/v1/evt/fallidos`.

## Por qué existe este spec

Fila 11 de `docs/roadmap-specs.md` (E-02). Contexto de apoyo: `docs/spec-context/11-evt-outbox-relay.md`. Su sección 9 (ambigüedades y preguntas) queda resuelta por las Decisiones de este spec.

El spec 02 dejó `sync.outbox` de solo inserción, con `seq` como cursor, `FORCE RLS` y sin modo sistema en el `UnitOfWork`. Dejó a este spec elegir cómo se lee entre tenants. Lo necesitan el 12 (alta de tenant), el 20 (AUD), el 21 (OBS) y el 25.

Depende además del 06 (`@Permiso`, `PermisoGuard`, manifiesto) y del 10 (manifiesto PLAT `1.3.0`, base del `1.4.0`).

No hay nada de eventos en `codigo/` (worker, BullMQ, relay, `@SuscribirEvento`). Todo se escribe desde cero.

RF cubiertos:

- **TR-RF-093** despachar eventos a suscriptores internos.
- **TR-RF-095** reprocesar eventos fallidos (parte back; la pantalla va con la consola).

TR-RF-092 (publicar en el outbox) ya lo entregó el spec 02.

Criterios del SRS: TR-CA-228, 229, 230, 233 y 234. Los de reintento con tope, re-barrido, reinicio sin pérdida, dos relays y aislamiento son propios de este spec.

Reglas: **TR-RN-034** (al menos una vez, idempotente por `event_id`), **TR-RN-035** (lectura por cursor con margen), **TR-RN-001** (el relay es la excepción controlada: lee entre tenants, pero cada entrega lleva su tenant).

RNF propios:

- **TR-RNF-106**: al menos una vez, retraso p95 < 5 s, 0 eventos perdidos al reiniciar el worker.
- **TR-RNF-028**: el worker escala de 1 a 3 instancias sin errores (dos relays a la vez no duplican ni saltan).
- **TR-RNF-008**: 0 efectos duplicados en reintentos y reentregas.
- **TR-RNF-117**: solo se transporta `schema_version`; el registro de esquemas (RF-094) no entra.

RNF heredados: 010 (el efecto corre con el tenant del evento), 011, 012, 024, 025, 026 (logs sin payload), 101.

Historias del backlog: **E-02**. Estimado: 10 h (el plan dice 6; suben la cola de fallidos en PostgreSQL, el re-barrido y las rutas HTTP).

## Alcance

**In:**

- **Migración** `db/01e_sync_relay.sql`, su inverso `db/rollback/01e_sync_relay.sql` y prueba `db/tests/01e_sync_relay.test.sql`. Ordena después de `01e_sync_outbox.sql` por nombre.
- **Lib nueva** `libs/plataforma/eventos` (proyecto `eventos`, etiquetas `scope:plataforma`, `type:backend`, `comp:evt`, alias `@vitrina/plataforma/eventos`). Estructura `domain · application · infrastructure · interface · test`, con build, Jest y tsconfig copiados de `correlativos`. Solo depende de `kernel` y `kernel-infra` (PL-10).
- **Dominio** en `domain/`: `EventoEntregado`, `NombreConsumidor`, `EventoFallido`, estados, errores y `PERMISOS_EVT`.
- **Casos de uso** en `application/`: `DespacharLote` (relay), `EntregarEvento` (consumidor), `RegistrarFallo`, `ListarFallidos` y `ReprocesarFallidos`.
- **Puertos** en `application/ports/` y adaptadores en `infrastructure/typeorm/` y `infrastructure/bullmq/`.
- **Decorador** `@SuscribirEvento(eventType, { consumidor })` en `interface/` y registro de suscripciones por descubrimiento de NestJS.
- **`EventosModule`** con `registrarApi(...)` (lecturas, reproceso, productor de colas) y `registrarWorker(...)` (relay y consumidores).
- **App nueva** `apps/worker` (etiquetas `scope:app`, `type:app`): contexto NestJS sin HTTP, `env.ts` propio, ciclo del relay, cierre ordenado con `SIGTERM`.
- **`apps/api`**: `apps/api/src/eventos/fallidos.controller.ts` con 2 rutas bajo `/v1/evt`, DTO, zod y OpenAPI; `EventosModule.registrarApi` en `AppModule`.
- **Manifiesto PLAT** `1.4.0`: permisos `plat.evento.consultar` y `plat.evento.reprocesar` y rol `PLAT_ADMIN_EVENTOS`.
- **Dependencia** `bullmq` (versión exacta fijada en el paso 2 tras consultar su documentación con ctx7).
- **Pruebas**: dominio (Jest), SQL contra PostgreSQL 16, integración con PostgreSQL 16 y Redis 7 (solo en CI), HTTP con supertest. Consumidores de prueba en `src/test/`.
- **Nube, dev (manual)**: migración, manifiesto PLAT `1.4.0` y prueba de humo con el worker local.

**Out of scope (para otros specs):**

- Publicar en el outbox y la tabla `sync.outbox` (spec 02, ya implementado).
- Registro versionado de esquemas con compatibilidad hacia atrás TR-RF-094 y TR-RNF-117 completo. Sin spec en el roadmap; se propone sumarlo como fila nueva antes del 25.
- Consumidores reales: AUD (spec 20), OBS (spec 21), NOT (R2), invalidación de caché (la de permisos ya es por versión, no por evento).
- Pantalla de fallidos y vista entre tenants para soporte (consola, spec 17).
- Actor de plataforma que lea fallidos de todos los tenants.
- Orden garantizado por agregado.
- Reentregar el histórico a un consumidor nuevo (empieza a recibir desde que existe).
- Eventos de plataforma sin tenant (p. ej. `manifiesto.aplicado`, ver spec 06).
- OpenTelemetry, métricas del relay y alertas (spec 21).
- Prueba de caos con kill del proceso en CI y despliegue del worker en staging (spec 21).
- Purga o archivado de `sync.outbox` y `sync.evento_procesado`.
- Proyecto prod (plan de migración a producción).

## Base de código reutilizada

**Se conserva (como patrón):**

- `db/01e_sync_outbox.sql`: esquema `sync`, RLS `ENABLE + FORCE` con `NULLIF(current_setting('app.tenant_id', true), '')::uuid`, `REVOKE` a `anon` y `authenticated` si existen.
- `db/01d_seq.sql` y su prueba: funciones con `search_path = ''`, rol de prueba sin `BYPASSRLS`.
- `kernel-infra`: `TypeOrmUnitOfWork` (abre la transacción con el tenant del `TenantContext`), `AlsTenantContext.run(scope, fn)`, `OutboxPublisher`, `InMemoryEventSchemaValidator`.
- Spec 10: estructura de la lib, entidades `EntitySchema` con mapeo explícito, `ENTIDADES_*`, filtro de errores y `validar` con zod, `X-Sucursal-Id` y metadata `REQUIERE_MFA` de permisos sensibles.
- `seguridad/src/infrastructure/redis/`: lectura de `REDIS_URL` y manejo de conexión.
- `apps/api`: `project.json`, `esbuild.mjs`, `config/env.ts` con zod y mensaje sin valores.

**Cambia:**

- `plat.manifiesto.json` pasa a `1.4.0`.
- `apps/api/src/app.module.ts` registra `EventosModule.registrarApi` y el controlador de fallidos.
- `.env.example` suma las variables `EVT_*`.
- `.github/workflows/ci.yml` no cambia: ya levanta PostgreSQL 16 y Redis 7.

**No existe** y se escribe desde cero: `sync.read_events`, las tablas del relay, la lib `eventos`, `apps/worker` y sus pruebas.

## Modelo de datos

### Migración `db/01e_sync_relay.sql`

```sql
-- Rol sin login, dueño de las funciones de lectura. Su política lee todo el outbox
-- sin dar BYPASSRLS a nadie (en Supabase no se puede crear un rol con BYPASSRLS).
CREATE ROLE sync_lector NOLOGIN;              -- dentro de DO ... IF NOT EXISTS: el rol es del clúster
GRANT USAGE, CREATE ON SCHEMA sync TO sync_lector;   -- CREATE: lo exige ALTER FUNCTION ... OWNER TO
GRANT SELECT ON sync.outbox TO sync_lector;
CREATE POLICY outbox_relay_lectura ON sync.outbox FOR SELECT TO sync_lector USING (true);

-- Cursor del relay. Global, sin tenant y sin RLS; solo lo toca el worker.
CREATE TABLE sync.relay_cursor (
  relay          varchar(40) PRIMARY KEY,
  ultimo_seq     bigint      NOT NULL DEFAULT 0 CHECK (ultimo_seq >= 0),
  actualizado_en timestamptz NOT NULL DEFAULT now()
);
INSERT INTO sync.relay_cursor (relay) VALUES ('principal');

-- Idempotencia por consumidor (TR-RN-034). Se inserta en la misma transacción que el efecto.
CREATE TABLE sync.evento_procesado (
  consumidor   varchar(40) NOT NULL CHECK (consumidor ~ '^[a-z][a-z0-9-]{2,39}$'),
  event_id     uuid        NOT NULL,
  tenant_id    uuid        NOT NULL,
  procesado_en timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (consumidor, event_id)
);
-- RLS ENABLE + FORCE: SELECT e INSERT con tenant_id = app.tenant_id. Sin UPDATE ni DELETE.

-- Cola de fallidos (TR-RF-095).
CREATE TABLE sync.evento_fallido (
  id              uuid         PRIMARY KEY,
  tenant_id       uuid         NOT NULL,
  consumidor      varchar(40)  NOT NULL,
  event_id        uuid         NOT NULL,
  event_type      text         NOT NULL,
  aggregate_type  text         NOT NULL,
  aggregate_id    uuid         NOT NULL,
  error           varchar(1000) NOT NULL,      -- mensaje truncado, nunca el payload
  intentos        integer      NOT NULL CHECK (intentos > 0),
  estado          varchar(12)  NOT NULL CHECK (estado IN ('FALLIDO', 'REPROCESANDO', 'PROCESADO')),
  fallido_en      timestamptz  NOT NULL DEFAULT now(),
  reprocesado_por uuid         NULL REFERENCES seg.usuario (id),
  reprocesado_en  timestamptz  NULL,
  version         bigint       NOT NULL DEFAULT 0,
  CONSTRAINT ux_fallido UNIQUE (consumidor, event_id),
  CONSTRAINT ck_fallido_reproceso CHECK ((reprocesado_por IS NULL) = (reprocesado_en IS NULL))
);
CREATE INDEX fallido_tenant_estado_ix ON sync.evento_fallido (tenant_id, estado, fallido_en DESC);
-- RLS ENABLE + FORCE: SELECT, INSERT y UPDATE con tenant_id = app.tenant_id. Sin DELETE.
```

### Funciones SQL (`SECURITY DEFINER`, dueño `sync_lector`, `SET search_path = ''`)

| Función | Devuelve |
| --- | --- |
| `sync.read_events(p_cursor bigint, p_margen interval, p_limite int)` | Filas con `seq > p_cursor` y `created_at < now() - p_margen`, por `seq`, hasta `p_limite` (TR-RN-035) |
| `sync.read_events_ventana(p_hasta_seq bigint, p_ventana interval, p_limite int)` | Filas con `seq <= p_hasta_seq` y `created_at >= now() - p_ventana`, por `seq` (re-barrido) |

- Ambas devuelven todas las columnas de `sync.outbox`.
- `REVOKE EXECUTE ... FROM PUBLIC`, `anon` y `authenticated`. `GRANT EXECUTE` al rol que corre la migración (en dev, `postgres`, el mismo de la app) y, en la prueba SQL, al rol de prueba.
- `p_limite` entre 1 y 1 000; `p_margen` y `p_ventana` no negativos; si no, `RAISE EXCEPTION`.
- El inverso borra funciones, tablas y política y revoca los permisos de `sync_lector`. No borra el rol: es del clúster y en CI lo comparten las bases temporales.

### Dominio

```ts
// Sobre del evento tal como viaja en la cola. Mismos campos que sync.outbox.
interface EventoEntregado {
  eventId: string; seq: string; tenantId: string; sedeId: string | null;
  aggregateType: string; aggregateId: string; eventType: string; version: string;
  origin: 'CLOUD' | 'EDGE'; payload: unknown; schemaVersion: number; occurredAt: string;
}

type EstadoFallido = 'FALLIDO' | 'REPROCESANDO' | 'PROCESADO';
```

- `NombreConsumidor`: `^[a-z][a-z0-9-]{2,39}$`. Es la clave estable de la cola (`evt-<consumidor>`) y de la idempotencia. Cambiarlo equivale a un consumidor nuevo.
- `EventoFallido` (agregado, con `version`): `registrarFallo(error, intentos, ahora)` deja `FALLIDO` y suma intentos; `iniciarReproceso(usuarioId, ahora)` solo desde `FALLIDO` (si no, `EventoNoFallidoError`); `marcarProcesado()` desde cualquier estado distinto de `PROCESADO`. El error se trunca a 1 000 caracteres.
- `REINTENTANDO` (TR-RF-093) no se persiste: es el estado del trabajo en BullMQ entre intentos.

### Puertos (`application/ports/`)

```ts
LectorOutbox          { leer(cursor, margenSeg, limite): EventoEntregado[];
                        leerVentana(hastaSeq, ventanaSeg, limite): EventoEntregado[] }
CursorRelay           { conBloqueo<T>(relay, trabajo: (cursor) => Promise<{ nuevoCursor: string; resultado: T }>): Promise<T | null> }
ColaEventos           { encolar(entregas: { consumidor; evento; idTrabajo }[]): void }
RegistroSuscripciones { consumidoresDe(eventType): string[]; manejador(consumidor, eventType): Manejador | null; consumidores(): string[] }
RegistroProcesados    { registrar(consumidor, evento): boolean }          // false si ya existía
RepositorioFallidos   { buscar(id); buscarPorEvento(consumidor, eventId); guardar(fallido); listar(filtro) }
LecturaOutbox         { buscar(eventId): EventoEntregado | null }        // con RLS del tenant, para reprocesar

type Manejador = (evento: EventoEntregado) => Promise<void>;
```

- `CursorRelay` en `infrastructure/typeorm/`: transacción propia sin tenant, `SELECT ultimo_seq ... FOR UPDATE NOWAIT`. Si otra instancia tiene el bloqueo (`55P03`), devuelve `null` y el ciclo se salta (TR-RNF-028). Actualiza `ultimo_seq` y confirma solo si `trabajo` terminó.
- `LectorOutbox` llama a las dos funciones con el `EntityManager` de esa transacción.
- SQL crudo justificado por la regla 11: llamadas a funciones de base de datos y `FOR UPDATE NOWAIT` con lógica propia. Lo demás con entidades TypeORM y `QueryBuilder` (`orIgnore()` en `RegistroProcesados`).
- `ColaEventos` en `infrastructure/bullmq/`: una `Queue` por consumidor, `addBulk` con `jobId = idTrabajo`, `attempts = EVT_INTENTOS`, `backoff: { type: 'exponential', delay: EVT_BACKOFF_MS }` con tope `EVT_BACKOFF_MAX_MS`, `removeOnComplete: { age: 3600 }`, `removeOnFail: { age: 7 días }`.

### Casos de uso: puntos no obvios

**`DespacharLote`** (TR-RF-093), cada `EVT_INTERVALO_MS`:

1. `CursorRelay.conBloqueo('principal', ...)`; sin bloqueo, termina.
2. `LectorOutbox.leer(cursor, EVT_MARGEN_SEG, EVT_LOTE)`.
3. Por cada evento y cada consumidor de `RegistroSuscripciones.consumidoresDe(eventType)`: entrega con `idTrabajo = eventId`. Un tipo sin suscriptores no se encola.
4. `ColaEventos.encolar` dentro de la transacción del cursor. Si Redis falla, la transacción se revierte, el cursor no avanza y el siguiente ciclo reintenta; el `jobId` descarta lo ya encolado.
5. Nuevo cursor = mayor `seq` leído (o el mismo si no hubo filas).
6. Cada `EVT_REBARRIDO_SEG`, además, `leerVentana(cursor, EVT_VENTANA_SEG, EVT_LOTE)` y se encola igual. Cubre transacciones que confirman con un `seq` que el cursor ya pasó (`created_at` es la hora de inicio de la transacción). BullMQ descarta los `jobId` que siguen en Redis; la idempotencia absorbe el resto.
7. Log `debug` con `leidos`, `encolados` y `cursor`; nunca el payload.

**`EntregarEvento`** (procesador de cada `Worker` de BullMQ, concurrencia `EVT_CONCURRENCIA`):

1. `TenantContext.run({ tenantId, branchId: sedeId })` y `UnitOfWork.run`: el efecto corre con la RLS del tenant del evento (TR-RNF-010).
2. `RegistroProcesados.registrar(consumidor, evento)`. Si ya existía: no llama al manejador (TR-CA-229, 234).
3. Si es nuevo, llama al manejador. Su efecto usa la misma transacción vía `UnitOfWork`. Si lanza, la transacción revierte también la fila de procesado.
4. En los dos casos, si hay fila en `sync.evento_fallido` distinta de `PROCESADO`, `marcarProcesado` en la misma transacción.
5. Si el manejador lanza y es el último intento (`attemptsMade + 1 >= EVT_INTENTOS`), `RegistrarFallo` en una transacción aparte antes de relanzar. Así la fila existe aunque el proceso muera justo después.
6. Un efecto fuera de la base (correo, HTTP) debe ser idempotente por sí mismo; se documenta en el JSDoc de `@SuscribirEvento`.

**`RegistrarFallo`**: con el tenant del evento, crea `EventoFallido` o, si ya existe por `(consumidor, event_id)`, `registrarFallo` sumando los intentos (un reproceso que vuelve a fallar). Log `warn` con `consumidor`, `event_id`, `event_type`, `tenant_id`, `intentos`.

**`ListarFallidos({ consumidor?, event_type?, estado? = 'FALLIDO', limite? = 50 })`**: filas del tenant por `fallido_en` descendente, `limite` hasta 100.

**`ReprocesarFallidos({ ids, actor })`** (TR-RF-095), de 1 a 100 ids:

1. Por cada id: inexistente u otro tenant → omitido `NO_ENCONTRADO`; estado distinto de `FALLIDO` → omitido `NO_FALLIDO`.
2. `LecturaOutbox.buscar(eventId)` recupera el sobre completo (la RLS deja ver solo el propio tenant).
3. `iniciarReproceso(actor, ahora)` y guardado con `WHERE version = :anterior`.
4. Encola en `evt-<consumidor>` con `idTrabajo = <event_id>-r<version>` (distinto del original, que sigue en la lista de fallidos de BullMQ). Se encola dentro de la transacción: si el worker lo toma antes del commit, su `marcarProcesado` espera el bloqueo de la fila.
5. Respuesta `{ reprocesados, omitidos: [{ id, motivo }] }`. El registro del resultado son `reprocesado_por`, `reprocesado_en` y el estado final; más log `info` sin datos personales.

### Configuración (`apps/worker/src/config/env.ts` y `.env.example`)

| Variable | Defecto | Uso |
| --- | --- | --- |
| `DATABASE_URL`, `REDIS_URL` | — | Mismas que la api. El worker no recibe `SUPABASE_SECRET_KEY` (regla 9) |
| `EVT_INTERVALO_MS` | 1000 | Sondeo del relay |
| `EVT_MARGEN_SEG` | 2 | Margen de TR-RN-035 |
| `EVT_LOTE` | 500 | Filas por lectura |
| `EVT_REBARRIDO_SEG` | 60 | Cada cuánto se relee la ventana |
| `EVT_VENTANA_SEG` | 300 | Tamaño de la ventana del re-barrido |
| `EVT_INTENTOS` | 8 | Intentos por entrega (RF-095) |
| `EVT_BACKOFF_MS` | 5000 | Base del backoff exponencial |
| `EVT_BACKOFF_MAX_MS` | 600000 | Tope del backoff (10 min) |
| `EVT_CONCURRENCIA` | 5 | Trabajos simultáneos por consumidor |

La api solo usa `REDIS_URL`, `EVT_INTENTOS`, `EVT_BACKOFF_MS` y `EVT_BACKOFF_MAX_MS` (para encolar reprocesos).

### Permisos (manifiesto PLAT `1.4.0` y `PERMISOS_EVT`)

| Código | `alcance_minimo` | `sensible` | Uso |
| --- | --- | --- | --- |
| `plat.evento.consultar` | `TENANT` | no | `GET /v1/evt/fallidos` |
| `plat.evento.reprocesar` | `TENANT` | sí | `POST /v1/evt/fallidos/reprocesar`. aal2 y MFA ≤ 15 min |

- Rol nuevo `PLAT_ADMIN_EVENTOS` con los dos permisos y `plat.sesion.contexto`. Sin módulo ni opción de menú.
- `plat.sistema.job` (RF-093) no se declara: el relay no tiene actor ni endpoint.

### HTTP (`apps/api/src/eventos/fallidos.controller.ts`)

Todas con `@ApiBearerAuth()`, `X-Sucursal-Id` (lo exige `PermisoGuard`), zod (400 `SOLICITUD_INVALIDA`) y errores `{ codigo, mensaje }`.

| Método y ruta | Permiso | Entrada | Éxito |
| --- | --- | --- | --- |
| `GET /v1/evt/fallidos` | `plat.evento.consultar` | query `consumidor?`, `event_type?`, `estado?`, `limite?` | 200 `[{ id, consumidor, event_id, event_type, aggregate_type, aggregate_id, error, intentos, estado, fallido_en, reprocesado_por, reprocesado_en }]` |
| `POST /v1/evt/fallidos/reprocesar` | `plat.evento.reprocesar` | `{ ids: uuid[] }` (1 a 100) | 200 `{ reprocesados, omitidos: [{ id, motivo }] }` |

- El controlador vive en `apps/api` porque `comp:evt` no puede importar `seguridad` (PL-10). La lib exporta los casos de uso.
- Ningún campo de la respuesta lleva el payload del evento.

### Eventos

El relay es agnóstico del tipo. Este spec no publica eventos propios.

## Plan de implementación

1. **Migración y funciones SQL.**
   - `db/01e_sync_relay.sql`, su inverso y `db/tests/01e_sync_relay.test.sql` con un rol sin `BYPASSRLS` (`sync_test_app`).
   - Casos: `read_events` devuelve filas de dos tenants; excluye las de `created_at` dentro del margen; respeta `p_cursor` y `p_limite`; `read_events_ventana` devuelve solo filas `<= p_hasta_seq` dentro de la ventana; un rol sin `EXECUTE` no puede llamarlas; `sync_test_app` sigue sin ver otro tenant con `SELECT` directo sobre `sync.outbox`; RLS de `evento_procesado` y `evento_fallido` entre dos tenants; `ux_fallido`; `DELETE` sobre `evento_fallido` no borra filas de otro tenant ni del propio; límites inválidos lanzan error.
   - Verificar: `pnpm nx test migrar` y `db:up` / `db:down` / `db:up` en CI. En local, con PGlite (no es PostgreSQL 16 de CI).
2. **Lib `eventos` vacía y `bullmq`.**
   - `project.json`, `tsconfig*.json`, `jest.config.mjs` y `src/index.ts` copiados de `correlativos`; alias en `tsconfig.base.json`; etiqueta `comp:evt`. `bullmq` con versión exacta.
   - Verificar: `pnpm nx run eventos:lint eventos:build` y `pnpm nx test boundaries-test` (evt no importa `seg`, `org`, `cfg` ni `seq`).
3. **Dominio.**
   - `evento-entregado.ts`, `nombre-consumidor.ts`, `evento-fallido.ts`, `errores.ts`, `permisos-evt.ts`.
   - Pruebas: formato del nombre; transiciones de `EventoFallido` (reprocesar desde `PROCESADO` o `REPROCESANDO` falla; `registrarFallo` suma intentos; error truncado a 1 000).
   - Verificar: `pnpm nx test eventos` y cobertura de `src/domain/**` ≥ 70 %.
4. **Suscripciones y entrega.**
   - `@SuscribirEvento`, `RegistroSuscripciones` por descubrimiento, `EntregarEvento`, `RegistrarFallo`, `RegistroProcesados` y `RepositorioFallidos` TypeORM, `Worker` de BullMQ por consumidor.
   - Pruebas de integración con consumidores de prueba `prueba-a` y `prueba-b` suscritos a `cita.creada`: TR-CA-229 (entregar dos veces el mismo evento llama al manejador una vez); manejador que falla revierte la fila de procesado; al agotar 8 intentos (backoff de 10 ms en la prueba) hay una fila `FALLIDO` con 8 intentos y el último error; el efecto ve solo el tenant del evento; nombre de consumidor duplicado o inválido falla al arrancar.
   - Verificar: `pnpm nx test eventos` en CI.
5. **Relay.**
   - `DespacharLote`, `CursorRelay`, `LectorOutbox`, `ColaEventos`.
   - Pruebas de integración: TR-CA-228 (un `cita.creada` publicado con `OutboxPublisher` lo procesan `prueba-a` y `prueba-b` una vez cada uno); TR-CA-230 con margen 5 s (el 1001 confirma 2 s después del 1002 y se entregan los dos); re-barrido (con margen 1 s, una transacción abierta 3 s confirma con `seq` menor al cursor y se entrega en el siguiente re-barrido); Redis caído no avanza el cursor; dos relays en paralelo: cada evento se encola una vez por consumidor y el cursor nunca retrocede; reinicio: 200 eventos, se cierra el worker a la mitad con `close(true)`, se arranca otro y al final `sync.evento_procesado` tiene 200 filas por consumidor y el manejador corrió 200 veces por consumidor.
   - Verificar: `pnpm nx test eventos` en CI.
6. **`apps/worker`.**
   - `main.ts` con `createApplicationContext`, `WorkerModule` con `KernelInfraModule` y `EventosModule.registrarWorker`, ciclo del relay, `enableShutdownHooks` (detiene el ciclo y cierra los `Worker` esperando los trabajos en curso), `env.ts` con zod.
   - Verificar: `pnpm nx run worker:build` y `pnpm nx run worker:serve` arranca con `.env` y loguea el ciclo sin errores con 0 suscriptores.
7. **Fallidos, controlador y manifiesto.**
   - `ListarFallidos`, `ReprocesarFallidos`, `LecturaOutbox`, `EventosModule.registrarApi`, `fallidos.controller.ts`, registro en `AppModule`, manifiesto PLAT `1.4.0`.
   - Pruebas: TR-CA-233 (12 eventos fallidos de `prueba-a` por un error que se corrige; reprocesar el lote deja los 12 en `PROCESADO` y la lista por defecto vacía); TR-CA-234 (un fallido con fila de procesado ya existente pasa a `PROCESADO` sin llamar al manejador); id de otro tenant omitido `NO_ENCONTRADO`; id en `REPROCESANDO` omitido `NO_FALLIDO`; reproceso que vuelve a fallar queda `FALLIDO` con intentos sumados. Supertest: cada fila de la tabla HTTP; sin permiso 403 `SIN_PERMISO`; reprocesar con aal1 401 step-up; más de 100 ids 400; aplicar el manifiesto dos veces da 0 cambios.
   - Verificar: `pnpm nx run-many -t lint test build` con código 0 y las rutas en `/v1/docs`.
8. **Nube, dev (manual).**
   - `pnpm db:up:remoto` y `pnpm manifiesto:aplicar:remoto` del PLAT `1.4.0`. Revisar con el MCP que `sync` no aparece en la Data API, que `sync_lector` es `NOLOGIN` sin `BYPASSRLS` y `get_advisors` sin alertas nuevas de RLS.
   - Prueba de humo: worker local (Redis de compose, base de dev) con un consumidor de humo registrado solo en ese arranque. Publicar 20 eventos de prueba en un tenant temporal; medir el retraso entre `created_at` y `procesado_en` y reportar el p95 (objetivo < 5 s). Forzar 1 fallo, verlo en `GET /v1/evt/fallidos` y reprocesarlo con aal2. Borrar los datos de prueba con la conexión de migración.
   - Evidencia en `docs/ops/supabase-ambientes.md`.

## Criterios de aceptación

**Despacho (TR-RF-093, TR-RN-034, TR-RN-035, TR-RNF-106):**

- [ ] Con `prueba-a` y `prueba-b` suscritos a `cita.creada`, un `cita.creada` publicado se procesa una sola vez en cada uno (TR-CA-228).
- [ ] Un evento entregado de nuevo tras procesarse no vuelve a ejecutar el manejador (TR-CA-229).
- [ ] Con margen de 5 s, el evento 1001 confirmado 2 s después del 1002 se entrega y no se salta (TR-CA-230).
- [ ] `sync.read_events` no devuelve filas con `created_at` dentro del margen.
- [ ] Una transacción que confirma con `seq` menor al cursor se entrega en el siguiente re-barrido.
- [ ] Un evento cuyo tipo no tiene suscriptores no se encola y el cursor avanza.
- [ ] Con Redis caído, el cursor no avanza y al volver Redis se entregan los eventos pendientes.
- [ ] Tras cerrar el worker a mitad de 200 eventos y arrancar otro, cada consumidor tiene 200 filas en `sync.evento_procesado` y el manejador corrió 200 veces.
- [ ] Dos relays a la vez encolan cada evento una vez por consumidor y el cursor nunca retrocede (TR-RNF-028).
- [ ] El efecto del manejador corre con `app.tenant_id` igual al `tenant_id` del evento.
- [ ] El p95 del retraso en la prueba de humo de dev se reporta en `docs/ops/supabase-ambientes.md`; si no baja de 5 s, se registra como desviación.

**Fallidos y reproceso (TR-RF-095):**

- [ ] Un manejador que falla 8 veces deja una fila `FALLIDO` con `intentos = 8` y el último error, sin payload.
- [ ] Reprocesar en lote 12 eventos fallidos tras corregir el error deja los 12 en `PROCESADO` y fuera de la lista por defecto (TR-CA-233).
- [ ] Reprocesar un fallido ya procesado por otra vía lo marca `PROCESADO` sin ejecutar el manejador (TR-CA-234).
- [ ] Un reproceso que vuelve a fallar queda `FALLIDO` con los intentos sumados.
- [ ] Reprocesar guarda `reprocesado_por` y `reprocesado_en`; ids de otro tenant o que no están en `FALLIDO` vuelven en `omitidos` con su motivo.
- [ ] `GET /v1/evt/fallidos` filtra por consumidor, tipo y estado y solo devuelve filas del tenant del token.

**Aislamiento, seguridad, migraciones y calidad:**

- [ ] Con `sync_test_app`, `SELECT` directo sobre `sync.outbox` sigue sin ver otro tenant; solo las funciones `read_events*` leen entre tenants.
- [ ] `anon` y `authenticated` no pueden ejecutar `sync.read_events` ni `sync.read_events_ventana`.
- [ ] Desde el tenant A no se lee ni escribe ninguna fila de `sync.evento_procesado` ni de `sync.evento_fallido` de B.
- [ ] Sin `plat.evento.consultar` o `plat.evento.reprocesar` las rutas responden 403; reprocesar con aal1 responde 401 step-up.
- [ ] Ningún log del relay, del worker ni de la api incluye el payload del evento.
- [ ] `db:up && db:down && db:up` termina con 0 en CI y `db:down` deja la base como la dejó el spec 10.
- [ ] `src/domain` no importa `@nestjs/*`, `typeorm` ni `bullmq`. `eventos` no importa `seguridad`, `org`, `parametros` ni `correlativos` (Nx en CI).
- [ ] `apps/worker` no lee `SUPABASE_SECRET_KEY`.
- [ ] Cobertura de líneas de `src/domain/**` ≥ 70 %.
- [ ] Las 2 rutas figuran en `/v1/docs` con sus códigos de error.
- [ ] El código nuevo sigue la sección «Código limpio» de `CLAUDE.md` y pasó por `code-simplifier`.
- [ ] `pnpm nx run-many -t lint test build` termina con código 0 y `nx affected` está en verde en CI.

**Nube (verificación manual, evidencia en `docs/ops/supabase-ambientes.md`):**

- [ ] En dev, `01e_sync_relay.sql` está aplicada y el manifiesto PLAT `1.4.0` figura en `seg.manifiesto_aplicado`.
- [ ] En dev, `sync` no está expuesto en la Data API y `sync_lector` es `NOLOGIN` sin `BYPASSRLS`.
- [ ] En dev, la prueba de humo entrega los 20 eventos, muestra y reprocesa el fallido, y los datos de prueba se borran.
- [ ] Las horas reales de E-02 quedan registradas en el plan.

## Decisiones

- **Sí:** dependencia del 06 y del 10 además del 02. `@Permiso` y el manifiesto son del 06; el `1.4.0` parte del `1.3.0` del 10.
- **Sí:** lectura entre tenants con `sync.read_events` `SECURITY DEFINER`. Decisión del usuario. Es lo que nombra TR-RN-035.
- **Sí:** dueño `sync_lector` `NOLOGIN` con política `TO sync_lector USING (true)`. `FORCE RLS` alcanza al dueño de la tabla y en Supabase no se puede crear un rol con `BYPASSRLS`; así no depende de que `postgres` lo tenga.
- **No:** rol del relay con login propio. Otra credencial y otra `DATABASE_URL` para el worker.
- **No:** `LISTEN/NOTIFY`. No funciona con el pooler en modo transacción de Supabase.
- **Sí:** cursor en `sync.relay_cursor`, avanzado tras encolar. Decisión del usuario. Sobrevive a perder Redis.
- **Sí:** bloqueo del cursor con `FOR UPDATE NOWAIT` por ciclo. Varias instancias del worker no duplican ni saltan. Los bloqueos asesores de sesión no sirven con el pooler en modo transacción.
- **Sí:** cursor inicial en 0. Los eventos ya existentes no tienen suscriptores; se leen y no se encolan.
- **Sí:** re-barrido de ventana con `jobId`. Decisión del usuario. `created_at` es la hora de inicio de la transacción; una transacción más larga que el margen quedaría saltada.
- **Sí:** margen de 2 s por defecto. Decisión del usuario. Con 5 s el p95 < 5 s de TR-RNF-106 es inalcanzable; la regla dice «margen configurado». Desviación del defecto del SRS.
- **Sí:** margen y demás valores por entorno, no por CFG. Los parámetros de CFG son por tenant y el relay es global.
- **Sí:** una cola BullMQ por consumidor (`evt-<consumidor>`). Un consumidor lento o caído no frena a los demás.
- **Sí:** `bullmq` directo detrás de puertos, sin `@nestjs/bullmq`. Menos acoplamiento con NestJS 12 y control explícito de `jobId`, reintentos y cierre.
- **Sí:** 8 intentos con backoff exponencial base 5 s y tope 10 min. Decisión del usuario.
- **Sí:** sin orden garantizado, ni por agregado. Decisión del usuario. El consumidor que lo necesite compara `version`; AUD encadena por su lado.
- **Sí:** `@SuscribirEvento` con descubrimiento de NestJS y efecto en la misma transacción que `sync.evento_procesado`. Decisión del usuario.
- **Sí:** `sync.evento_procesado` sin FK a `sync.outbox`. Permite purgar el outbox en el futuro sin tocar la idempotencia.
- **Sí:** cola de fallidos en `sync.evento_fallido`. Decisión del usuario. Filtrable por consumidor, tipo y tenant; sobrevive a perder Redis.
- **Sí:** la fila de fallido se escribe dentro del procesador en el último intento, no en el evento `failed` de BullMQ. Si el proceso muere justo después, la fila ya existe.
- **No:** persistir `REINTENTANDO`. Es el estado del trabajo en BullMQ.
- **Sí:** reproceso con `jobId` nuevo (`<event_id>-r<version>`). El original sigue en la lista de fallidos de BullMQ y su id no se puede reutilizar.
- **Sí:** consumidores solo de prueba. Decisión del usuario. Los reales llegan con 20, 21 y R2.
- **Sí:** endpoints de listar y reprocesar. Decisión del usuario.
- **Sí:** cada tenant ve solo sus fallidos. Decisión del usuario. La vista entre tenants para soporte necesita un actor de plataforma; va con la consola.
- **Sí:** controlador en `apps/api`. Decisión del usuario. PL-10 deja a `evt` depender solo de `kernel`; abrir `evt → seg` arriesga un ciclo si SEG se suscribe a eventos.
- **Sí:** rol nuevo `PLAT_ADMIN_EVENTOS` sin opción de menú. Decisión del usuario. No hay pantalla todavía.
- **Sí:** `plat.evento.reprocesar` sensible (aal2) y alcance `TENANT` en los dos permisos. Propuesta de redacción: revisar al aprobar.
- **No:** declarar `plat.sistema.job`. El relay no tiene actor ni endpoint.
- **No:** evento propio por reproceso. El contexto pide no inventar nombres; `reprocesado_por` y `reprocesado_en` son el registro.
- **No:** registro versionado de esquemas (RF-094) en este spec. Supera las horas; el relay no valida payload. Se propone una fila nueva en el roadmap.
- **Sí:** el inverso no borra `sync_lector`. El rol es del clúster y lo comparten las bases temporales de CI.
- **Sí:** worker local + prueba de reinicio en CI; caos con kill y staging van con el spec 21. Decisión del usuario.
- **Sí:** sin PostgreSQL ni Supabase locales. Pruebas SQL y de integración solo en CI con `TEST_DATABASE_URL`; en local se saltan o se verifican con PGlite, avisando que no es PostgreSQL 16. Redis local por compose.

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| Transacción más larga que `EVT_VENTANA_SEG` (5 min) confirma con un `seq` ya pasado y su evento se pierde | Las transacciones de la app son cortas. Se documenta en el JSDoc de `UnitOfWork`; OBS (spec 21) puede contar outbox contra procesados para detectarlo. |
| `ALTER FUNCTION ... OWNER TO sync_lector` falla en Supabase por falta de membresía o de `CREATE` en `sync` | La migración otorga `CREATE` en `sync` y la crea el mismo rol que crea `sync_lector`. Se valida primero en CI y luego en dev en el paso 8. |
| Un manejador hace un efecto externo (correo) y la transacción revierte después | Se reentrega y el efecto se repite. El JSDoc de `@SuscribirEvento` exige que esos efectos sean idempotentes por `event_id`. |
| BullMQ con NestJS 12 o Node 24 tiene incompatibilidades | Se usa `bullmq` sin el paquete de Nest; la versión se fija tras consultar la documentación en el paso 2. |
| El p95 < 5 s no se alcanza contra Supabase dev desde la laptop | Se mide y reporta en la prueba de humo; la medición definitiva va con staging (spec 21). |
| `sync.evento_procesado` crece sin límite | Fuera de alcance; la purga se decide con OBS o con un spec de mantenimiento. |
| Payload con datos personales viaja en Redis | Redis es interno; los logs nunca llevan el payload (TR-RNF-026). El cifrado en reposo de Redis se decide con staging. |

## Lo que **no** está en este spec

- Publicar en el outbox (spec 02) y registro de esquemas RF-094 (sin spec).
- Consumidores reales: AUD (20), OBS (21), NOT (R2).
- Pantalla de fallidos y vista entre tenants (consola, spec 17).
- Orden por agregado y reentrega del histórico a consumidores nuevos.
- Eventos de plataforma sin tenant.
- OpenTelemetry, métricas, caos con kill en CI y despliegue en staging (spec 21).
- Purga del outbox y de procesados.
