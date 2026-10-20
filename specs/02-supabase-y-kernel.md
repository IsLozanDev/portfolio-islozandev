# SPEC 02 — Proyectos Supabase, kernel y kernel-infra con outbox transaccional

> **Status:** Aprobado
> **Depends on:** SPEC 01
> **Date:** 2026-10-19
> **Objective:** Dejar configurados los proyectos Supabase dev y prod y construir las libs `kernel` y `kernel-infra` con unidad de trabajo, contexto de tenant y publicación de eventos en `sync.outbox` dentro de la misma transacción del cambio de negocio.

## Por qué existe este spec

Cubre F-04 (3 h) y F-06 (5 h) del Sprint 0 (R0): 8 h de 10. Es la raíz del grafo PL-10 (K → ORG → SEG, K → EVT): los specs 03, 04 y 11 lo necesitan. Contexto de apoyo: `docs/spec-context/02-supabase-y-kernel.md`.

Aplica las reglas de arquitectura 2, 3, 4, 6, 8, 9 y 10 de `CLAUDE.md`. La 3 (doble barrera) y la 4 (outbox en la misma transacción) pasan de convención a código probado.

Cubre **TR-RF-092** (Publicar evento de dominio en el outbox), con las reglas **TR-RN-001** y **TR-RN-034**, y los criterios **TR-CA-225, TR-CA-226 y TR-CA-227**.

RNF propios: **TR-RNF-010** (aislamiento por tenant), **TR-RNF-011** (TLS y secretos fuera del repo), **TR-RNF-106** (outbox al menos una vez; el despacho completo es del spec 11) y **TR-RNF-117** (solo `schema_version` en la fila; el registro versionado es del spec 11).
RNF heredados: 008, 012, 024, 025 (cobertura de dominio ≥ 70 % en `kernel`), 026.

Historias del backlog: **F-04** (sin RF; tipo Ops, componente TR-SEG) y **F-06** (TR-RF-092; tipo Back, componente Kernel).

## Alcance

**In:**

- **Supabase (F-04)**, proyectos `dev` (ya existe, `project_ref` en memoria del proyecto) y `prod` (se crea):
  - Claves de firma JWT asimétricas ES256 en ambos; JWKS en `/auth/v1/.well-known/jwks.json`.
  - Data API sin esquemas de plataforma expuestos (`seg`, `org`, `sync` y los siguientes).
  - SMTP propio con Resend (`smtp.resend.com`) y plantillas de correo de Auth en español: invitación, recuperación de clave y confirmación.
  - Documento `docs/ops/supabase-ambientes.md` con el checklist manual, el `project_ref` (no secreto) de cada ambiente y la evidencia de cada paso.
  - Plantillas en `supabase/templates/` y su registro en `supabase/config.toml` (`[auth.email.template.*]`).
  - Variable `DATABASE_MIGRATION_URL` (conexión de sesión o directa, ver Decisiones) en `.env.example`; el runner `tools/migrar/cli.mjs` la usa solo con `--remoto` (scripts `db:up:remoto` y `db:down:remoto`); sin el flag sigue usando `DATABASE_URL`.
- **`libs/plataforma/kernel`** (`type:domain`, sin NestJS ni TypeORM): `AggregateRoot`, `DomainEvent`, `Result`, errores de dominio y los puertos `Clock`, `IdGenerator`, `TenantContext`, `UnitOfWork`, `EventPublisher` y `EventSchemaValidator`.
- **`libs/plataforma/kernel-infra`** (`type:backend`): `AlsTenantContext`, `TypeOrmUnitOfWork`, `OutboxPublisher`, `InMemoryEventSchemaValidator`, `SystemClock`, `uuidV7`, `HttpExceptionFilter` y `KernelInfraModule`.
- **Migración** `db/01e_sync_outbox.sql` con su inverso `db/rollback/01e_sync_outbox.sql`: esquema `sync`, tabla `sync.outbox`, RLS por tenant, esquema fuera de la Data API.
- Pruebas unitarias de dominio, pruebas de integración de `kernel-infra` contra PostgreSQL 16 y prueba SQL del outbox.

**Out of scope (para otros specs):**

- Relay, worker BullMQ, `sync.read_events`, margen de antigüedad (TR-RN-035), `@SuscribirEvento`, reproceso (spec 11, RF-093 y RF-095).
- Registro de esquemas de eventos versionado y compatibilidad hacia atrás (TR-RNF-117 completo, spec 11). Aquí solo un validador en memoria.
- Hook de token (`tenant_id`, `tipo_usuario`) y espejo `auth.users` → `seg.usuario` (spec 04).
- Verificador JWKS, guards, `@Permiso`, `X-Sucursal-Id` (specs 05 y 07). Nada pone aún el tenant en el contexto desde una petición HTTP.
- `plat.evento.publicar` como permiso con guard: es un permiso lógico del puerto, no hay endpoint.
- Proyecto `staging` (spec 21, E-04). El docx lo cita; el plan solo habla de dev y prod.
- Plan Pro y respaldos de prod (TR-RNF-006, P-01, sprint 11).
- Adaptador de correo de TR-NOT con Resend (spec de notificaciones, R2). Aquí Resend es solo el SMTP de Supabase Auth.
- Cableado de `KernelInfraModule` en `apps/api` (lo hace el spec 03 con la primera lib que lo use).
- Tabla `sync.outbox` con columnas de estado de despacho (`dispatched_at`, reintentos). El relay lee por cursor.

## Base de código reutilizada

Fuente: `docs/Plataforma_Plan_Mermaid_Estructura_Codigo/Plataforma_Plan/`.

**No existe código de kernel ni kernel-infra en `codigo/`:** se escribe desde cero. `codigo/db/01e_sync_outbox.sql` tampoco existe.

**Se conserva:**

- `codigo/db/01a_org.sql`: patrón de RLS con `current_setting('app.tenant_id', true)::uuid`.
- `codigo/supabase/migrations/20261102000000_seg_supabase_auth.sql` (líneas 99-100): patrón `REVOKE` a `anon, authenticated`. Se replica para `sync`.
- `codigo/supabase/tests/00_simular_supabase_SOLO_PRUEBAS.sql` y `correr_pruebas.sh`: patrón de prueba SQL contra PostgreSQL local, para la prueba de `sync.outbox`.
- `codigo/libs/plataforma/seguridad/src/infrastructure/supabase-jwks.verificador.ts`: confirma ES256 con `jose` (referencia para el checklist F-04; el verificador es del spec 05).
- Convenciones de `seguridad/package.json` y `tsconfig.json`: ESM, imports con `.js`, NestJS `^12.2.0`, TS `~5.9.3`.

**Cambia:**

- Los nombres del árbol `estructura_backend.txt` están en español (`agregado.ts`, `unidad-de-trabajo.port.ts`, ...). Se usan los del plan en inglés (F-06: AggregateRoot, DomainEvent, UnitOfWork, AlsTenantContext, OutboxPublisher), ver tabla de equivalencias.
- `seguridad` no usa kernel (sin `AsyncLocalStorage`, UoW ni outbox). Los specs 04 y 06 la adaptan; este spec no la toca.
- El esquema de roles que asume `01a_org.sql` (`ENABLE` sin `FORCE`) se corrige en el spec 03. `sync.outbox` nace con `FORCE`.

## Modelo de datos

### Tabla `sync.outbox`

Columnas de TR-RF-092 más `seq` (cursor para el relay) y `created_at`.

```sql
CREATE SCHEMA sync;

CREATE TABLE sync.outbox (
  seq            bigint GENERATED ALWAYS AS IDENTITY,
  event_id       uuid        PRIMARY KEY,
  tenant_id      uuid        NOT NULL,
  sede_id        uuid,
  aggregate_type text        NOT NULL CHECK (char_length(aggregate_type) BETWEEN 1 AND 40),
  aggregate_id   uuid        NOT NULL,
  event_type     text        NOT NULL CHECK (char_length(event_type) BETWEEN 1 AND 60),
  version        bigint      NOT NULL,
  origin         text        NOT NULL DEFAULT 'CLOUD' CHECK (origin IN ('CLOUD', 'EDGE')),
  payload        jsonb       NOT NULL,
  schema_version smallint    NOT NULL,
  occurred_at    timestamptz NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX outbox_seq_uq ON sync.outbox (seq);
CREATE INDEX outbox_tenant_aggregate_ix ON sync.outbox (tenant_id, aggregate_type, aggregate_id, version);
```

RLS y permisos:

- `ENABLE` y `FORCE ROW LEVEL SECURITY`.
- Política `outbox_tenant` para `SELECT` e `INSERT`: `tenant_id = current_setting('app.tenant_id', true)::uuid` (`USING` y `WITH CHECK`). Sin `UPDATE` ni `DELETE`: el outbox es de solo inserción para el rol de la aplicación.
- `REVOKE ALL ON SCHEMA sync` y `ON ALL TABLES IN SCHEMA sync` a `anon, authenticated`, dentro de un bloque `DO` que comprueba que el rol exista (en `postgres:16` plano de CI no existen).
- El relay (spec 11) leerá entre tenants con un rol propio o con `sync.read_events` `SECURITY DEFINER`; la elección es suya.

Rollback: `DROP SCHEMA sync CASCADE`.

### Kernel (`libs/plataforma/kernel/src`)

```ts
export interface DomainEvent<P = unknown> {
  readonly eventType: string;        // 'venta.registrada', 1-60
  readonly aggregateType: string;    // 'venta', 1-40
  readonly aggregateId: string;      // uuid
  readonly aggregateVersion: number; // versión del agregado tras el cambio
  readonly schemaVersion: number;    // smallint
  readonly payload: P;
  readonly occurredAt: Date;
}

export abstract class AggregateRoot {
  protected constructor(readonly id: string, version: number);
  get version(): number;
  protected raise(event: Omit<DomainEvent, 'aggregateId' | 'aggregateVersion' | 'occurredAt'>): void; // incrementa version
  pullEvents(): DomainEvent[];       // devuelve y vacía
}

export type Result<T, E = DomainError> = { ok: true; value: T } | { ok: false; error: E };

export interface TenantScope { readonly tenantId: string; readonly branchId?: string }
export interface TenantContext { current(): TenantScope; run<T>(scope: TenantScope, fn: () => Promise<T>): Promise<T> }
export interface UnitOfWork { run<T>(work: () => Promise<T>): Promise<T> }
export interface EventPublisher { publish(event: DomainEvent): Promise<void> }
export interface EventSchemaValidator { validate(event: DomainEvent): void } // lanza EventSchemaValidationError
export interface Clock { now(): Date }
export interface IdGenerator { next(): string }
```

Errores (`domain-errors.ts`): `DomainError` (abstracta, con `code`), `ValidationError`, `NotFoundError`, `ConflictError`, `ForbiddenError`, `EventSchemaValidationError extends ValidationError`, `MissingTenantContextError`, `NoActiveTransactionError`.

`EventPublisher.publish` es la interfaz `EventoPort.publicar(evento)` del SRS.

### Kernel-infra (`libs/plataforma/kernel-infra/src`)

- `AlsTenantContext`: `AsyncLocalStorage<TenantScope>`. `current()` lanza `MissingTenantContextError` si no hay scope.
- `TypeOrmUnitOfWork.run(work)`: exige tenant en el contexto; abre una transacción con `DataSource.transaction`; ejecuta `SELECT set_config('app.tenant_id', $1, true)` como primera sentencia; guarda el `EntityManager` en un segundo `AsyncLocalStorage`; expone `manager` (lanza `NoActiveTransactionError` fuera de `run`). Las llamadas anidadas a `run` reutilizan la transacción activa.
- `OutboxPublisher.publish(event)`: (1) exige transacción activa; (2) `EventSchemaValidator.validate`; (3) inserta en `sync.outbox` con `event_id = IdGenerator.next()`, `tenant_id` y `sede_id` del `TenantContext`, `origin = 'CLOUD'`; (4) no hace commit, lo hace el UoW.
- `InMemoryEventSchemaValidator`: registro `Map<'eventType@schemaVersion', JSON Schema>` con `register(...)`; valida con `ajv`. Tipo sin esquema registrado: lanza `EventSchemaValidationError`.
- `SystemClock`, `uuidV7()` (paquete `uuid`), `HttpExceptionFilter` (mapea `DomainError`: `ValidationError` → 422, `NotFoundError` → 404, `ConflictError` → 409, `ForbiddenError` → 403; cualquier otro → 500 sin detalle interno ni datos personales, RNF-026), `KernelInfraModule.register({ dataSource, validator })` con `useFactory`.

### Equivalencias de nombres

| Plan (código) | Árbol `estructura_backend.txt` | SRS / DB |
| --- | --- | --- |
| `AggregateRoot` | `agregado.ts` | — |
| `DomainEvent` | `evento-dominio.ts` | evento de dominio |
| `Result` | `resultado.ts` | — |
| `Clock`, `IdGenerator` | `reloj.port.ts`, `id.port.ts` | — |
| `UnitOfWork` | `unidad-de-trabajo.port.ts` | — |
| `TenantContext` / `AlsTenantContext` | `contexto-tenant.port.ts` / `als-contexto-tenant.ts` | `app.tenant_id` |
| `EventPublisher` | — | `EventoPort.publicar` |
| `OutboxPublisher` | `outbox.publicador.ts` | `sync.outbox` |
| `TypeOrmUnitOfWork` | `typeorm-unidad-de-trabajo.ts` | — |
| `SystemClock`, `uuid-v7.ts` | `reloj-sistema.ts`, `uuid-v7.ts` | — |
| `HttpExceptionFilter` | `filtro-errores.http.ts` | — |
| `branchId` | — | `sede_id` (sucursal) |

Archivos en kebab-case en inglés: `aggregate-root.ts`, `domain-event.ts`, `result.ts`, `domain-errors.ts`, `clock.port.ts`, `id-generator.port.ts`, `tenant-context.port.ts`, `unit-of-work.port.ts`, `event-publisher.port.ts`, `event-schema-validator.port.ts`; en kernel-infra `als-tenant-context.ts`, `typeorm-unit-of-work.ts`, `outbox.publisher.ts`, `in-memory-event-schema-validator.ts`, `system-clock.ts`, `uuid-v7.ts`, `http-exception.filter.ts`, `kernel-infra.module.ts`. Los dos `index.ts` exponen solo la API pública.

## Plan de implementación

1. **Errores, `Result` y puertos simples** en `kernel`: `domain-errors.ts`, `result.ts`, `clock.port.ts`, `id-generator.port.ts`. Verificar: `pnpm nx build kernel` y `pnpm nx lint kernel`.
2. **`DomainEvent` y `AggregateRoot`** con prueba unitaria (versión crece por evento, `pullEvents` vacía, `aggregateId` y `aggregateVersion` se completan). Agregar target `test` a `kernel`. Verificar: `pnpm nx test kernel`.
3. **Puertos restantes** en `kernel`: `tenant-context`, `unit-of-work`, `event-publisher`, `event-schema-validator`; `index.ts`. Verificar: `pnpm nx run-many -t lint build -p kernel kernel-infra` y que `kernel` no importe NestJS, TypeORM ni Supabase (lint de capa del spec 01).
4. **Migración del outbox**: `db/01e_sync_outbox.sql` y su inverso. Prueba SQL con el patrón de `correr_pruebas.sh` (rol de prueba sin `BYPASSRLS`): inserta con el tenant correcto, falla con otro tenant, `SELECT` no ve otro tenant, `UPDATE` y `DELETE` fallan, `CHECK` de `origin`. Verificar: `pnpm db:up && pnpm db:down && pnpm db:up` sobre PostgreSQL 16 de compose.
5. **Utilidades de kernel-infra**: `AlsTenantContext`, `SystemClock`, `uuidV7`, con pruebas (contexto aislado entre dos `run` concurrentes; UUID versión 7 y orden creciente). Verificar: `pnpm nx test kernel-infra`.
6. **`TypeOrmUnitOfWork`** con prueba de integración contra PostgreSQL 16 (`DATABASE_URL`): `current_setting('app.tenant_id')` vale el tenant dentro de `run` y queda vacío después; revierte si `work` lanza; `run` sin tenant lanza `MissingTenantContextError`; anidado reutiliza la tx. Verificar: `pnpm nx test kernel-infra`.
7. **`InMemoryEventSchemaValidator` y `OutboxPublisher`** con las pruebas de integración de los tres GWT (ver criterios). Verificar: `pnpm nx test kernel-infra`.
8. **`HttpExceptionFilter` y `KernelInfraModule`** con prueba unitaria del mapeo de códigos HTTP. Verificar: `pnpm nx test kernel-infra`.
9. **Runner y entorno**: `tools/migrar/cli.mjs` acepta `--remoto` y entonces usa `DATABASE_MIGRATION_URL` (imprime el host de destino); sin el flag usa `DATABASE_URL`. Scripts `db:up:remoto` y `db:down:remoto`. `.env.example` agrega `DATABASE_MIGRATION_URL=` vacío; CI mantiene `DATABASE_URL`. Verificar: `pnpm nx test migrar` y `pnpm nx run-many -t lint test build` con código 0.
10. **F-04, parte repositorio**: `supabase/templates/{invite,recovery,confirmation}.html` en español, entradas en `supabase/config.toml`, `docs/ops/supabase-ambientes.md` con el checklist. Verificar: `pnpm supabase:start` levanta y Mailpit local muestra la plantilla de invitación en español.
11. **F-04, parte nube (manual)**: el usuario entrega credenciales cuando se pidan; nada se guarda en el repo. Por ambiente: crear `prod`; activar claves de firma ES256 y rotar fuera de la clave heredada; dejar en Settings → API → Exposed schemas solo lo estrictamente necesario (ningún esquema de plataforma); configurar SMTP de Resend y pegar las plantillas; aplicar `db/01e_sync_outbox.sql` con `pnpm db:up:remoto`. Verificar: ver criterios F-04. Registrar la evidencia en `docs/ops/supabase-ambientes.md`.

## Criterios de aceptación

**Outbox y kernel (TR-RF-092):**

- [ ] **TR-CA-225:** una prueba de integración llama a `OutboxPublisher.publish` con `venta.registrada` dentro de `UnitOfWork.run`; tras confirmar existe una fila en `sync.outbox` con `event_type = 'venta.registrada'` y `version` igual a `aggregateVersion`.
- [ ] **TR-CA-226:** en la misma transacción se publica el evento y luego `work` lanza un error; tras la reversión `SELECT count(*) FROM sync.outbox WHERE aggregate_id = $1` devuelve 0.
- [ ] **TR-CA-227:** con un esquema registrado para `cita.creada` que exige `fecha_hora`, publicar sin `fecha_hora` lanza `EventSchemaValidationError`, la transacción se revierte y no queda fila.
- [ ] La fila insertada lleva `tenant_id` y `sede_id` del `TenantContext`, `origin = 'CLOUD'` y `event_id` UUID v7.
- [ ] `OutboxPublisher.publish` fuera de `UnitOfWork.run` lanza `NoActiveTransactionError`.
- [ ] `UnitOfWork.run` sin tenant en el contexto lanza `MissingTenantContextError` y no abre transacción.
- [ ] Dentro de `run`, `current_setting('app.tenant_id', true)` es el tenant del contexto; fuera de `run` está vacío (el `SET LOCAL` no se filtra a la conexión del pool).

**Aislamiento (TR-RNF-010, TR-RN-001):**

- [ ] Con un rol sin `BYPASSRLS`, desde el tenant A un `SELECT` sobre `sync.outbox` no devuelve filas del tenant B y un `INSERT` con `tenant_id` de B falla.
- [ ] Para el rol de la aplicación, `UPDATE` y `DELETE` sobre `sync.outbox` fallan.
- [ ] `anon` y `authenticated` no tienen `USAGE` sobre `sync` en la base de dev (comprobado con `has_schema_privilege`).

**Migración (regla 6):**

- [ ] `pnpm db:up && pnpm db:down && pnpm db:up` termina con 0 contra PostgreSQL 16 y `db:down` deja la base sin el esquema `sync`.
- [ ] CI ejecuta la migración y las pruebas de integración de `kernel-infra` contra `postgres:16` y quedan en verde.

**Arquitectura (DoD):**

- [ ] `kernel` no importa `@nestjs/*`, `typeorm` ni `@supabase/*`; el lint falla si se agrega alguno.
- [ ] `kernel-infra` solo importa de `kernel` por su `index.ts` y ningún proyecto accede a sus archivos internos.
- [ ] Cobertura de líneas de `kernel` ≥ 70 % reportada por `pnpm nx test kernel --coverage`.
- [ ] `pnpm nx run-many -t lint test build` termina con código 0 y `nx affected` es verde en CI.

**F-04 (verificación manual, evidencia en `docs/ops/supabase-ambientes.md`):**

- [ ] Existen los proyectos `dev` y `prod`, cada uno con su `project_ref` anotado.
- [ ] `GET {SUPABASE_URL}/auth/v1/.well-known/jwks.json` de cada ambiente devuelve una clave con `kty = EC`, `crv = P-256` y `alg = ES256`.
- [ ] El login de prueba en dev (usuario creado a mano) devuelve un `access_token` cuya cabecera dice `alg: ES256` y cuyo `kid` está en el JWKS (hito H0).
- [ ] `GET {SUPABASE_URL}/rest/v1/` con la publishable key no lista las tablas de `sync`, `seg` ni `org`.
- [ ] Un correo de invitación enviado desde dev llega desde el SMTP de Resend con la plantilla en español.
- [ ] Ninguna clave, contraseña ni API key aparece en el repo (`git grep` por `sb_secret`, `re_` y `eyJ` sin resultados) y `.env` sigue en `.gitignore`.
- [ ] Las horas reales de F-04 y F-06 quedan registradas en el plan (DoD).

## Decisiones

- **Sí:** solo `dev` y `prod`, como pide F-04. El docx menciona staging; entra con E-04 (spec 21). Así F-04 cabe en 3 h.
- **Sí:** nombres de código en inglés (los del plan, F-06). El árbol de estructura está en español; la tabla de equivalencias evita ambigüedad y los specs siguientes usan el inglés. Decisión del usuario.
- **Sí:** columnas de DB con los nombres de TR-RF-092 (`sede_id`, `event_type`, ...). Son contrato con el SRS y con el relay; `branchId` es el nombre en código.
- **Sí:** TypeORM para el UoW. El árbol ya nombra `typeorm-unidad-de-trabajo.ts` y las libs TR usan repositorios TypeORM; `pg` directo obligaría a reescribir ese contrato.
- **Sí:** `set_config('app.tenant_id', $1, true)` como primera sentencia de la transacción. Equivale a `SET LOCAL`, admite parámetros y funciona con el pooler en modo transacción.
- **Sí:** la aplicación usa el pooler de dev en el puerto 6543 (modo transacción). Las migraciones usan conexión directa (`db.ebkwqvuynccawujsaedh.supabase.co:5432`) en `DATABASE_MIGRATION_URL`. La directa de Supabase es solo IPv6 salvo con el add-on IPv4; si la red de desarrollo no tiene IPv6, se usa el session pooler (puerto 5432 del mismo host del pooler). En modo transacción fallan DDL con `PREPARE` y bloqueos de sesión; el 6543 es lo que se usará en prod.
- **Sí:** el MCP de Supabase (`read_only=true`) solo verifica: tablas, RLS, advisors y esquemas expuestos tras aplicar la migración. No aplica migraciones; eso lo hace el runner `tools/migrar` con `--remoto` y `DATABASE_MIGRATION_URL`.
- **Sí:** el runner usa la variable remota solo con `--remoto`. Con ambas variables en `.env`, preferirla por defecto haría que `pnpm db:up` local migrara Supabase sin aviso.
- **No:** todo por 6543 ni todo por conexión directa. Lo primero rompe migraciones; lo segundo no prueba lo que corre en producción y consume más conexiones.
- **Sí:** validador de esquemas como puerto con implementación en memoria. Cubre TR-CA-227 sin adelantar el registro versionado (TR-RNF-117), que es del spec 11.
- **No:** registro completo de esquemas aquí. Rebasa las 10 h y pisa al spec 11.
- **Sí:** `sync.outbox` y su DDL se entregan aquí, no en el spec 11. RF-092 necesita la tabla para publicar; el relay solo la lee. Corresponde a la fila 02 de `docs/roadmap-specs.md`.
- **Sí:** `seq bigint identity` como cursor. Da un orden estable y barato para el relay; el margen de 5 s de TR-RN-035 absorbe transacciones que confirman fuera de orden.
- **No:** columnas de estado de despacho en la tabla. El relay lee por cursor y mantiene su propio offset; evita `UPDATE` sobre una tabla de solo inserción.
- **Sí:** `FORCE ROW LEVEL SECURITY` y sin políticas de `UPDATE`/`DELETE`. En Supabase el rol de conexión es dueño de las tablas y sin `FORCE` se saltaría la RLS (la doble barrera de la regla 3 quedaría en una sola).
- **Sí:** UoW sin tenant falla (`MissingTenantContextError`). No hay "modo sistema" implícito; las tareas sin tenant (relay, vencimientos) tendrán su propio camino en su spec.
- **Sí:** `Result`, errores de dominio, `HttpExceptionFilter`, `Clock`, `IdGenerator` y `uuidV7` en versión mínima. El árbol y el roadmap los nombran y los specs 03 y 04 los usan desde el primer caso de uso.
- **Sí:** `plat.evento.publicar` es un permiso lógico del puerto, sin `@Permiso` ni endpoint. No hay guard hasta el spec 07 y agregar HTTP solo para probarlo ensancha la superficie.
- **Sí:** integración de `kernel-infra` contra el PostgreSQL 16 de compose y del job de CI; F-04 con checklist manual. Supabase no es automatizable en CI sin credenciales (regla 9) y el spec 01 ya decidió probar `db/` contra `postgres:16` plano.
- **Sí:** Resend como SMTP de Supabase Auth, decisión previa del usuario para el correo. La API key la entrega el usuario y vive solo en el panel de Supabase.
- **Sí:** plantillas de correo en español dentro de este spec. El docx (3.1) las pide junto con el SMTP y la invitación la usa el spec 08.
- **Sí:** paquetes `uuid` y `ajv` en vez de escribir UUID v7 y un validador JSON Schema. Son piezas con casos borde que no aportan valor propio.

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| El dueño de la tabla (`postgres.<ref>` en Supabase, `postgres` en CI) ignora la RLS aun con `FORCE` si es superusuario | Las pruebas de aislamiento corren con un rol sin `BYPASSRLS` creado en el setup. En prod, la aplicación debe conectarse con un rol sin ese atributo; se documenta en `docs/ops/supabase-ambientes.md` y lo cierra el spec 03 junto con la corrección de `01a_org.sql`. |
| `set_config(..., true)` y el pooler 6543 mezclan el tenant entre peticiones | Prueba del criterio "fuera de `run` está vacío". `is_local = true` limita el valor a la transacción, que en modo transacción es la unidad que se asigna a una conexión. |
| Fuga del contexto ALS entre peticiones concurrentes | Prueba con dos `run` concurrentes de tenants distintos. |
| Relay del spec 11 necesita leer entre tenants y la RLS lo impide | Se declara aquí como pendiente del spec 11 (rol propio o `sync.read_events` `SECURITY DEFINER`). La tabla ya lleva `seq` e índice para ello. |
| `created_at DEFAULT now()` es la hora de inicio de la transacción, no la de commit | Es el motivo del margen de TR-RN-035; el cursor usa `seq`, no `created_at`. |
| SMTP de Resend sin dominio verificado solo envía a la cuenta propietaria | Verificar el dominio de envío antes del paso 11; si no hay dominio, la prueba de correo usa la dirección propietaria y se anota en la evidencia. |
| Rotar a ES256 en un proyecto con usuarios o tokens previos invalida sesiones | `dev` y `prod` no tienen usuarios reales todavía; el orden del paso 11 se hace antes del spec 04. |
| La publishable key y las claves ES256 requieren pasos solo disponibles en el panel; el MCP es de solo lectura | El checklist es manual y deja evidencia por paso; el MCP en `read_only` sirve para comprobar el resultado. |
| F-04 depende de acciones del usuario y bloquea el cierre del spec | Los pasos 1 a 10 se implementan y se prueban sin Supabase; solo el paso 11 y los criterios F-04 quedan a la espera. |

## Lo que **no** está en este spec

- Relay, worker, `sync.read_events`, suscriptores y reproceso de eventos (spec 11).
- Registro de esquemas versionado y compatibilidad hacia atrás (spec 11).
- Hook de token y espejo de `auth.users` (spec 04); verificador JWKS y guards (specs 05 y 07).
- `@Permiso` sobre `plat.evento.publicar` y cualquier endpoint HTTP.
- Proyecto `staging` (spec 21) y plan Pro con respaldos de `prod` (P-01).
- Adaptador de correo de TR-NOT con Resend (R2).
- Cableado de `KernelInfraModule` en `apps/api` y corrección de `01a_org.sql` (spec 03).

Cada uno entra en su propio spec cuando su sprint lo pida.
