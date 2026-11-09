# SPEC 20a — Auditoría: registro inmutable con hash encadenado, acceso a datos sensibles y consumo de eventos de plataforma

> **Status:** Aprobado
> **Depends on:** SPEC 03, SPEC 06, SPEC 11, SPEC 12
> **Date:** 2026-11-09
> **Objective:** Crear `libs/plataforma/auditoria` (TR-AUD) con `aud.evento_auditoria` de solo inserción y hash SHA-256 encadenado por tenant calculado en la base, `AuditoriaPort` (`registrar`, `registrarAccesoSensible`) y `@Auditable` en la misma transacción del caso de uso, y un consumidor del outbox que audita los eventos de ORG y suscripción con el actor, la IP y el trace que ahora viajan en `sync.outbox`.

## Por qué existe este spec

Fila 20 de `docs/roadmap-specs.md` (E-01). Contexto de apoyo: `docs/spec-context/20-aud-auditoria.md`. Su sección 9 (ambigüedades y preguntas) queda resuelta por las Decisiones de este spec y del 20b.

El 20 del roadmap se parte en tres:

- **20a** (este): registro, inmutabilidad, acceso sensible, `@Auditable` y consumidor de eventos. ~9 h.
- **20b**: consulta paginada con alcance, detalle, exportación XLSX auditada, `VerificarIntegridad` y tarea diaria (TR-RF-086, TR-RNF-112). ~6 h.
- **20c**: visor en `admin-cliente` (lista y detalle con diferencias).

Junto superaba las 10 h (13-15 h estimadas). El roadmap suma las filas 20a, 20b y 20c al aprobar este spec.

Lo que hay en el código hoy (revisado al redactar):

- No existe `libs/plataforma/auditoria` ni el esquema `aud`. `tools/boundaries-test` ya tiene el fixture `comp:aud` y prueba que `comp:cfg`, `comp:seq` y `comp:cat` **no** importan `comp:aud`, y que `comp:aud` sí importa `comp:evt` (PL-10: `SEG --> AUD`, `EVT --> AUD`). Por eso las libs de plataforma no pueden llamar a `AuditoriaPort`: sus operaciones llegan a la auditoría por el outbox.
- `sync.outbox` no guarda quién hizo la operación: no tiene usuario, IP ni trace. `OutboxPublisher` toma `tenantId` y `branchId` de `TenantContext`.
- `TenantScope` (kernel) tiene `tenantId` y `branchId?`. `ContextoTenantInterceptor` (seguridad) lo arma con el tenant del token y la sucursal verificada por `PermisoGuard`.
- `TypeOrmUnitOfWork.run` reutiliza la transacción activa si ya hay una: una llamada anidada corre en la misma transacción.
- `sync.read_events` y `sync.read_events_ventana` devuelven `SETOF sync.outbox`.
- ORG publica `empresa.creada`, `empresa.actualizada`, `sucursal.creada`, `sucursal.actualizada`, `sucursal.inactivada`, `unidad.creada`, `unidad.actualizada`; el spec 12 publica `tenant.creado`, `suscripcion.cambiada`, `suscripcion.por_vencer` y `suscripcion.vencida`. El payload es la foto del agregado tras el cambio.
- `seg.evento_seguridad` es la bitácora de seguridad (specs 18 y 18b) y no se toca.

RF cubiertos:

- **TR-RF-084** registrar evento de auditoría inmutable.
- **TR-RF-085** registrar acceso a datos sensibles.

Criterios del SRS: TR-CA-209, 210, 211, 212. Los de concurrencia, transacción revertida, consumo de eventos y enmascarado son propios de este spec. TR-CA-213 y 214 van con el 20b.

Reglas: **TR-RN-028** (solo inserción, ningún rol modifica ni elimina, hash encadenado, conservación mínima 5 años), **TR-RN-011** (solo la finalidad `SOPORTE` con ticket; la bitácora de soporte es del spec 18), **TR-RN-034** (consumidor idempotente por `event_id`).

RNF propios:

- **TR-RNF-013**: toda operación auditada guarda usuario, fecha, origen y contexto. Una operación que no pudo auditarse no se confirma.
- **TR-RNF-112** (parte): la cadena queda bien formada por construcción; la verificación diaria es del 20b.
- **TR-RNF-016**: el acceso sensible guarda finalidad declarada.
- **TR-RNF-026**: `antes` y `despues` se enmascaran; ningún log lleva su contenido.
- **TR-RNF-008**: un evento reentregado no duplica el registro.

RNF heredados: 001, 010, 011, 012, 024/119, 025, 101, 106.

Historias del backlog: **E-01** (parte). Estimado: 9 h.

## Alcance

**In:**

- **Migración** `db/01e_sync_traza.sql` (columnas `actor_id`, `ip`, `trace_id` en `sync.outbox`), su inverso y su prueba.
- **Migración** `db/01g_aud.sql` (esquema `aud`, tabla, triggers, funciones de hash, RLS y permisos), su inverso y su prueba.
- **Kernel**: `TenantScope` suma `actorId?`, `ip?` y `traceId?`. `OutboxPublisher` los copia al outbox.
- **Seguridad**: `ContextoTenantInterceptor` llena `actorId` (usuario del token), `ip` (la de la petición) y `traceId` (de `traceparent`, si viene y es válido).
- **Eventos**: `EventoEntregado` suma `actorId`, `ip` y `traceId`.
- **Lib nueva** `libs/plataforma/auditoria` (proyecto `auditoria`, etiquetas `scope:plataforma`, `type:backend`, `comp:aud`, alias `@vitrina/plataforma/auditoria`). Estructura `domain · application · infrastructure · interface · test`, con build, Jest y tsconfig copiados de `eventos`.
- **Dominio**: `EntradaAuditoria`, `EntradaAccesoSensible`, catálogos de `RecursoSensible` y `Finalidad`, `enmascararCampos`, `limitarTamano`, errores.
- **Aplicación**: `AuditoriaPort` (puerto público), `RegistrarEvento` y `RegistrarAccesoSensible` (lo implementan), `AuditarEventoDePlataforma` (consumidor).
- **Infraestructura**: `RegistroAuditoria` TypeORM (entidad `EntitySchema`, inserción con `QueryBuilder`).
- **Interfaz**: interceptor `@Auditable(...)` y consumidor `auditoria` con `@SuscribirEvento` por cada tipo de `EVENTOS_AUDITADOS`.
- **`AuditoriaModule`** con `registrarApi(...)` y `registrarWorker(...)`; `apps/api` y `apps/worker` lo registran.
- **Pruebas**: dominio (Jest), SQL contra PostgreSQL 16, integración con PostgreSQL 16 y Redis 7 (solo en CI), HTTP con supertest para `@Auditable`.
- **Nube, dev (manual)**: las dos migraciones y humo con una sucursal real.

**Out of scope (para otros specs):**

- Consulta, detalle, exportación XLSX y permisos `plat.auditoria.consultar` y `plat.auditoria.exportar` (20b).
- `VerificarIntegridad` y tarea diaria (20b).
- Visor en `admin-cliente` (20c).
- Usos reales de `@Auditable` y de `AuditoriaPort` en productos: el primero es SazónPOS (spec 25, anulación de TR-CA-209).
- Auditar eventos de CFG, SEQ, CAT y SEG. `seq.numero.emitido` no se audita (volumen alto, sin valor de auditoría).
- Particionado, archivado y retención automatizada (5 años sin purga; spec posterior).
- ARCO e incidentes (R2).
- OpenTelemetry: `trace_id` se toma de `traceparent` si viene; generarlo es del spec 21.
- `seg.evento_seguridad` no se migra a `aud`.
- Declarar `plat.auditoria.registrar` y `plat.auditoria.acceso_sensible`: no tienen endpoint ni actor que los asigne.
- Proyecto prod (plan de migración a producción).

## Base de código reutilizada

**Se conserva (como patrón):**

- `db/01e_sync_outbox.sql`: RLS `ENABLE + FORCE` con `NULLIF(current_setting('app.tenant_id', true), '')::uuid`, trigger de solo inserción que falla también para el dueño, `REVOKE` a `anon` y `authenticated` si existen.
- `db/01e_sync_relay.sql` y su prueba: rol de prueba sin `BYPASSRLS`, funciones con `search_path = ''`.
- `kernel-infra`: `TypeOrmUnitOfWork` (transacción anidada reutilizada), `AlsTenantContext`, `OutboxPublisher`, `uuid-v7`.
- `eventos`: `@SuscribirEvento`, `EntregarEvento` (efecto en la misma transacción que `sync.evento_procesado`), estructura de la lib.
- Spec 18b: «falla cerrado» cuando la auditoría no se escribe (`AUDITORIA_NO_DISPONIBLE`).

**Cambia:**

- `TenantScope`, `OutboxPublisher`, `ContextoTenantInterceptor`, `EventoEntregado` y el mapeo de `LectorOutbox` y `LecturaOutbox`.
- `apps/api/src/app.module.ts` y `apps/worker/src/worker.module.ts` registran `AuditoriaModule`.

**No existe** y se escribe desde cero: el esquema `aud`, la lib `auditoria` y sus pruebas.

## Modelo de datos

### Migración `db/01e_sync_traza.sql`

```sql
ALTER TABLE sync.outbox
  ADD COLUMN actor_id uuid        NULL,                                         -- usuario que hizo la operación; NULL = sistema
  ADD COLUMN ip       inet        NULL,
  ADD COLUMN trace_id varchar(32) NULL CHECK (trace_id ~ '^[0-9a-f]{32}$');
```

- Ordena después de `01e_sync_relay.sql` por nombre. El runner aplica por conjunto (`migraciones._migraciones`), así que en dev entra aunque `01f_*` ya esté aplicada.
- Sin FK de `actor_id` a `seg.usuario`: `sync` no depende de `seg`.
- La prueba verifica que `sync.read_events` y `sync.read_events_ventana` devuelven las tres columnas nuevas. Si no las devuelven (cuerpo ya analizado), la migración las recrea igual que en `01e_sync_relay.sql`.
- El inverso borra las tres columnas.

### Migración `db/01g_aud.sql`

```sql
CREATE SCHEMA aud;

CREATE TABLE aud.evento_auditoria (
  id                 uuid         PRIMARY KEY,                       -- uuid v7 de la app
  tenant_id          uuid         NOT NULL,
  numero             bigint       NOT NULL,                          -- lo pone el trigger: 1, 2, 3... por tenant
  tipo               varchar(16)  NOT NULL CHECK (tipo IN ('OPERACION', 'ACCESO_SENSIBLE')),
  origen             varchar(8)   NOT NULL CHECK (origen IN ('DIRECTO', 'EVENTO')),
  event_id           uuid         NULL,                              -- solo origen EVENTO
  accion             varchar(80)  NOT NULL CHECK (accion ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*){1,3}$'),
  entidad_tipo       varchar(40)  NOT NULL,
  entidad_id         varchar(80)  NOT NULL,                          -- texto: admite «V-000981» además de uuid
  usuario_id         uuid         NULL,                              -- NULL = sistema
  sucursal_id        uuid         NULL,
  antes              jsonb        NULL,
  despues            jsonb        NULL,
  motivo             varchar(500) NULL,
  persona_titular_id uuid         NULL,
  finalidad          varchar(20)  NULL CHECK (finalidad IN ('ATENCION', 'AUDITORIA_MEDICA', 'SOPORTE', 'OTRO')),
  ticket             varchar(40)  NULL,
  ip                 inet         NULL,
  trace_id           varchar(32)  NULL,
  ocurrido_en        timestamptz  NOT NULL,
  registrado_en      timestamptz  NOT NULL DEFAULT now(),
  hash_anterior      char(64)     NOT NULL,                          -- lo pone el trigger; 64 ceros en el primero
  hash               char(64)     NOT NULL,                          -- lo pone el trigger
  CONSTRAINT ux_evento_auditoria_numero UNIQUE (tenant_id, numero),
  CONSTRAINT ux_evento_auditoria_evento UNIQUE (event_id),
  CONSTRAINT ck_evento_auditoria_origen CHECK ((origen = 'EVENTO') = (event_id IS NOT NULL)),
  CONSTRAINT ck_evento_auditoria_sensible CHECK (
    tipo = 'OPERACION'
    OR (usuario_id IS NOT NULL AND persona_titular_id IS NOT NULL AND finalidad IS NOT NULL
        AND entidad_tipo IN ('HISTORIA_CLINICA', 'NOTA_SESION', 'EXPEDIENTE', 'DATOS_PORTABLES'))),
  CONSTRAINT ck_evento_auditoria_soporte CHECK (finalidad IS DISTINCT FROM 'SOPORTE' OR ticket IS NOT NULL)
);
CREATE INDEX evento_auditoria_tenant_fecha_ix ON aud.evento_auditoria (tenant_id, ocurrido_en DESC);
```

**Funciones (`SET search_path = ''`):**

| Función | Qué hace |
| --- | --- |
| `aud.contenido_canonico(e aud.evento_auditoria) RETURNS text` `IMMUTABLE` | `jsonb_build_object(...)::text` con todas las columnas salvo `hash`, `registrado_en` y `hash_anterior`. `ocurrido_en` va como microsegundos desde epoch (`bigint`) para no depender de `TimeZone`. `jsonb` ordena las claves, así que el texto es determinista |
| `aud.calcular_hash(e aud.evento_auditoria, p_hash_anterior char(64)) RETURNS char(64)` `IMMUTABLE` | `encode(sha256(convert_to(p_hash_anterior \|\| aud.contenido_canonico(e), 'UTF8')), 'hex')`. La reutiliza el verificador del 20b |
| `aud.encadenar()` trigger `BEFORE INSERT FOR EACH ROW` | `pg_advisory_xact_lock(<clase aud>, hashtext(NEW.tenant_id::text))`; lee `numero` y `hash` del último del tenant (`ORDER BY numero DESC LIMIT 1`); pone `numero = último + 1`, `hash_anterior` y `hash`. Ignora lo que traiga el `INSERT` en esas tres columnas |
| `aud.solo_insercion()` trigger `BEFORE UPDATE OR DELETE OR TRUNCATE FOR EACH STATEMENT` | `RAISE EXCEPTION 'aud.evento_auditoria es de solo inserción (TR-RN-028)'`. Alcanza al dueño y a `postgres` |

- `<clase aud>` es una constante entera con nombre en la migración, para no chocar con otros bloqueos asesores.
- El bloqueo es de transacción (`xact`): funciona con el pooler en modo transacción y se libera al confirmar o revertir.
- Cualquier vía de inserción queda encadenada: el adaptador inserta con TypeORM y el trigger completa el hash.

**RLS y permisos:**

- `ENABLE + FORCE ROW LEVEL SECURITY`. Políticas `SELECT` e `INSERT` con `tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid`. Sin políticas de `UPDATE` ni `DELETE`.
- `REVOKE ALL ON SCHEMA aud, ALL TABLES IN SCHEMA aud FROM PUBLIC`, y de `anon` y `authenticated` si existen (regla 8). `GRANT USAGE` y `SELECT, INSERT` al rol de la aplicación; `REVOKE UPDATE, DELETE, TRUNCATE` explícito.
- El inverso falla con mensaje claro si `aud.evento_auditoria` tiene filas (TR-RN-028: no se borra auditoría ni por rollback). Sin filas, borra el esquema.

### Dominio (`domain/`)

```ts
export type TipoRecursoSensible = 'HISTORIA_CLINICA' | 'NOTA_SESION' | 'EXPEDIENTE' | 'DATOS_PORTABLES';
export type Finalidad = 'ATENCION' | 'AUDITORIA_MEDICA' | 'SOPORTE' | 'OTRO';

export interface EntradaAuditoria {
  accion: string;                 // formato producto.recurso.accion, p. ej. rest.venta.anular
  entidadTipo: string;
  entidadId: string;
  antes?: unknown;
  despues?: unknown;
  motivo?: string;
  enmascarar?: readonly string[]; // claves extra a las de CAMPOS_ENMASCARADOS
}

export interface EntradaAccesoSensible {
  recursoTipo: TipoRecursoSensible;
  recursoId: string;
  personaTitularId: string;
  finalidad: Finalidad;
  ticket?: string;                // obligatorio si finalidad = SOPORTE
}

export const ACCION_ACCESO_SENSIBLE = 'aud.dato_sensible.acceder';
export const CAMPOS_ENMASCARADOS = ['clave', 'contrasena', 'password', 'token', 'secreto', 'secret',
                                    'numero_documento', 'dni'] as const;
export const VALOR_ENMASCARADO = '***';
export const TAMANO_MAXIMO_JSON_BYTES = 64 * 1024;
```

- `enmascararCampos(valor, claves)`: recorre objetos y arreglos y reemplaza por `***` el valor de toda clave cuyo nombre en minúsculas está en la lista. No muta la entrada.
- `limitarTamano(valor)`: si el JSON supera 64 KB, devuelve `{ "_truncado": true, "bytes": n }`.
- Validaciones (errores de dominio): `accion` con el formato del CHECK (`AccionInvalidaError`), `motivo` hasta 500, `entidadId` hasta 80, `ticket` obligatorio con `SOPORTE` (`TicketRequeridoError`), `ticket` hasta 40.

### Puerto público y casos de uso (`application/`)

```ts
export interface AuditoriaPort {
  registrar(entrada: EntradaAuditoria): Promise<void>;
  registrarAccesoSensible(entrada: EntradaAccesoSensible): Promise<void>;
}
```

- Lo implementan `RegistrarEvento` y `RegistrarAccesoSensible`. Exige transacción activa: sin `UnitOfWork.run` alrededor lanza `NoActiveTransactionError` del kernel. Corre en la transacción del caso de uso que lo llama: si la operación se revierte, no queda registro; si la inserción falla, la operación tampoco se confirma (TR-RNF-013).
- Toma `tenantId`, `branchId`, `actorId`, `ip` y `traceId` de `TenantContext.current()`. `ocurrido_en` lo da `Clock`. `origen = 'DIRECTO'`.
- `registrarAccesoSensible` exige `actorId` (`ActorRequeridoError`): un acceso sensible siempre tiene una persona que lo ve. Guarda `entidad_tipo = recursoTipo`, `entidad_id = recursoId` y `accion = ACCION_ACCESO_SENSIBLE`.
- `AuditarEventoDePlataforma(evento: EventoEntregado)`: `origen = 'EVENTO'`, `event_id`, `accion = eventType`, `entidad_tipo = aggregateType`, `entidad_id = aggregateId`, `usuario_id = actorId`, `sucursal_id = sedeId`, `ip`, `trace_id`, `ocurrido_en = occurredAt`, `antes = null`, `despues = payload` enmascarado y limitado.

### Puerto de persistencia

```ts
RegistroAuditoria { insertar(fila: FilaAuditoria): Promise<void> }   // FilaAuditoria sin numero, hash_anterior ni hash
```

- `infrastructure/typeorm/`: entidad `EntitySchema` `EventoAuditoriaEntidad`, `ENTIDADES_AUDITORIA`, inserción con `QueryBuilder` sobre `uow.manager`. Las tres columnas del trigger se omiten en el `INSERT`.
- Sin SQL crudo en el adaptador: el cálculo del hash vive en el trigger (regla 11: función de base de datos).
- Si la inserción falla, el adaptador lanza `AuditoriaNoDisponibleError` (`AUDITORIA_NO_DISPONIBLE`, 503) con log `error` sin `antes`, `despues` ni `motivo`.

### `@Auditable` (`interface/auditable.interceptor.ts`)

```ts
@Auditable({ accion: 'rest.venta.anular', entidadTipo: 'venta', parametroId: 'id', enmascarar: ['tarjeta'] })
```

- Interceptor de método. Corre dentro de `ContextoTenantInterceptor` (global), así que ya tiene el `TenantContext` de la petición.
- Abre `UnitOfWork.run` alrededor del handler: el caso de uso del handler reutiliza esa transacción. Tras la respuesta llama a `AuditoriaPort.registrar` con `entidadId = req.params[parametroId]`, `despues` = cuerpo de la respuesta y `motivo` = `req.body.motivo` si es texto. Luego confirma.
- Si el handler lanza, no registra y la transacción se revierte.
- `antes` no lo conoce el interceptor: el caso de uso que necesite antes y después llama a `AuditoriaPort.registrar` directamente (es el camino de TR-CA-209).

### Consumidor (`interface/auditoria.consumidor.ts`)

- `EVENTOS_AUDITADOS`: `tenant.creado`, `tenant.suspendido`, `tenant.reactivado`, `tenant.dado_de_baja`, `suscripcion.cambiada`, `suscripcion.vencida`, `empresa.creada`, `empresa.actualizada`, `sucursal.creada`, `sucursal.actualizada`, `sucursal.inactivada`, `unidad.creada`, `unidad.actualizada`, `unidad.inactivada`. `suscripcion.por_vencer` no: es un aviso, no una operación.
- Un método con `@SuscribirEvento(tipo, { consumidor: 'auditoria' })` por tipo, todos llaman a `AuditarEventoDePlataforma`. Corre en la transacción de `EntregarEvento` con el tenant del evento.
- Idempotencia doble: `sync.evento_procesado` (spec 11) y `ux_evento_auditoria_evento`.
- `tenant.creado` y los de suscripción que publica el sistema (tarea diaria) llegan con `actor_id` NULL y se guardan como sistema.

### Contexto (`TenantScope` y `ContextoTenantInterceptor`)

```ts
export interface TenantScope {
  readonly tenantId: string;
  readonly branchId?: string;
  readonly actorId?: string;   // usuario del token
  readonly ip?: string;
  readonly traceId?: string;   // 32 hex de traceparent (W3C)
}
```

- Campos opcionales: los `run({ tenantId })` existentes siguen compilando y quedan como sistema.
- `traceId` solo se toma si `traceparent` cumple `^00-[0-9a-f]{32}-[0-9a-f]{16}-[0-9a-f]{2}$` y el trace no son ceros; si no, queda vacío.

### Eventos

No publica eventos propios.

## Plan de implementación

1. **Actor en el outbox.**
   - `db/01e_sync_traza.sql`, su inverso y su prueba. `TenantScope`, `OutboxPublisher`, `ContextoTenantInterceptor`, `EventoEntregado`, `LectorOutbox` y `LecturaOutbox`.
   - Pruebas: publicar dentro de un scope con `actorId`, `ip` y `traceId` deja las tres columnas en `sync.outbox` y llegan en `EventoEntregado`; `traceparent` inválido deja `trace_id` NULL; `run({ tenantId })` sin actor deja NULL. Las pruebas existentes de `eventos`, `org` y `seguridad` siguen verdes.
   - Verificar: `pnpm nx test migrar kernel-infra seguridad eventos`.
2. **Migración `01g_aud.sql`.**
   - Migración, inverso y `db/tests/01g_aud.test.sql` con rol sin `BYPASSRLS`.
   - Casos: el primer registro del tenant tiene `numero = 1` y `hash_anterior` de 64 ceros; el segundo encadena con el hash del primero; `numero` y `hash` que trae el `INSERT` se ignoran; recalcular con `aud.calcular_hash` da el `hash` guardado; dos tenants llevan cadenas independientes; `UPDATE`, `DELETE` y `TRUNCATE` fallan con el rol de la app **y** con el dueño (TR-CA-210); el tenant A no ve ni inserta filas de B; CHECKs de acceso sensible, `SOPORTE` sin ticket y `origen`/`event_id`; `event_id` repetido falla; `anon` y `authenticated` sin acceso; el inverso falla si hay filas.
   - Verificar: `pnpm nx test migrar` en CI y `db:up` / `db:down` / `db:up` sin filas. En local con PGlite (no es PostgreSQL 16).
3. **Lib `auditoria` y dominio.**
   - `project.json`, `tsconfig*.json`, `jest.config.mjs`, `src/index.ts` (exporta `AuditoriaPort`, tipos de entrada, `Auditable` y `AuditoriaModule`), alias en `tsconfig.base.json`, etiqueta `comp:aud`.
   - Dominio con pruebas: formato de `accion`; `enmascararCampos` en objetos anidados y arreglos sin mutar la entrada; claves extra; `limitarTamano` a 64 KB; `SOPORTE` sin ticket falla.
   - Verificar: `pnpm nx run auditoria:lint auditoria:build`, `pnpm nx test auditoria boundaries-test` y cobertura de `src/domain/**` ≥ 70 %.
4. **Registro directo.**
   - `RegistrarEvento`, `RegistrarAccesoSensible`, `RegistroAuditoria` TypeORM y `AuditoriaModule.registrarApi`.
   - Pruebas de integración: TR-CA-209 con un caso de uso de prueba «anular venta» (`V-000981`, antes `EMITIDA`, después `ANULADA`, motivo) que guarda la fila con antes, después, motivo y hash encadenado; el mismo caso de uso que lanza después de registrar no deja fila; sin transacción lanza `NoActiveTransactionError`; TR-CA-211 (médico, `HISTORIA_CLINICA` de un titular, `ATENCION`: fila con usuario, finalidad y fecha); TR-CA-212 (`EXPEDIENTE`, `SOPORTE` con ticket `TCK-1042`); `SOPORTE` sin ticket falla; campo `clave` en `antes` queda `***`; 50 registros en paralelo del mismo tenant dejan `numero` 1 a 50 sin huecos y la cadena recalculada coincide.
   - Verificar: `pnpm nx test auditoria` en CI.
5. **`@Auditable`.**
   - Decorador e interceptor; controlador de prueba en `src/test/`.
   - Supertest: una ruta con `@Auditable` que responde 200 deja una fila con `entidad_id` del parámetro, `despues` igual a la respuesta, motivo del cuerpo, usuario, sucursal e IP de la petición; si el handler lanza, no hay fila y el cambio de negocio de prueba tampoco quedó; si la inserción falla, responde 503 `AUDITORIA_NO_DISPONIBLE` y el cambio no quedó.
   - Verificar: `pnpm nx test auditoria`.
6. **Consumidor de eventos de plataforma.**
   - `AuditarEventoDePlataforma`, `auditoria.consumidor.ts`, `AuditoriaModule.registrarWorker`, registro en `apps/worker` y en `apps/api`.
   - Contrastar `EVENTOS_AUDITADOS` con los `eventType` que publican `org` y el alta de tenant (búsqueda en el código); si aparece uno nuevo de ORG o suscripción, se suma o se anota en Decisiones.
   - Pruebas de integración: crear una sucursal con actor, IP y trace en el scope deja una fila `origen = 'EVENTO'` con `accion = 'sucursal.creada'`, `usuario_id`, `sucursal_id`, `ip`, `trace_id` y `despues` igual al payload; entregar dos veces el mismo evento deja una fila; `seq.numero.emitido` y `suscripcion.por_vencer` no dejan fila; un evento sin actor queda con `usuario_id` NULL.
   - Verificar: `pnpm nx run-many -t lint test build` con código 0.
7. **Cierre de calidad.**
   - `code-simplifier` sobre los archivos nuevos y modificados; revisar su diff.
8. **Nube, dev (manual).**
   - `pnpm db:up:remoto` con `01e_sync_traza.sql` y `01g_aud.sql`. Con el MCP: `aud` no aparece en la Data API, `get_advisors` sin alertas nuevas de RLS, y un `UPDATE` sobre `aud.evento_auditoria` con la conexión de migración falla.
   - Humo: worker y api locales contra dev; crear una sucursal desde `admin-cliente` y ver su fila en `aud.evento_auditoria` con el usuario real e IP. La fila de humo **no** se borra (solo inserción); se usa el tenant de pruebas de dev.
   - Evidencia en `docs/ops/supabase-ambientes.md`.

## Criterios de aceptación

**Registro y cadena (TR-RF-084, TR-RN-028):**

- [ ] Al confirmar la anulación de prueba de `V-000981` queda una fila con antes, después, motivo y hash encadenado al anterior del tenant (TR-CA-209).
- [ ] Si el caso de uso se revierte después de registrar, no queda fila.
- [ ] Si la inserción de auditoría falla, la operación no se confirma y la API responde 503 `AUDITORIA_NO_DISPONIBLE`.
- [ ] `AuditoriaPort` sin transacción activa lanza `NoActiveTransactionError`.
- [ ] El primer registro de un tenant tiene `numero = 1` y `hash_anterior` de 64 ceros; cada siguiente encadena con el `hash` del anterior y `aud.calcular_hash` reproduce el `hash` guardado.
- [ ] 50 registros en paralelo de un tenant dejan `numero` 1 a 50 sin huecos ni repetidos y la cadena es válida.
- [ ] `numero`, `hash_anterior` y `hash` enviados en el `INSERT` se ignoran.
- [ ] `UPDATE`, `DELETE` y `TRUNCATE` sobre `aud.evento_auditoria` fallan con el rol de la aplicación y con el dueño de la tabla (TR-CA-210).
- [ ] Las claves de `CAMPOS_ENMASCARADOS` y las de `enmascarar` quedan `***` en `antes` y `despues`; un JSON de más de 64 KB queda como `{ _truncado, bytes }`.

**Acceso sensible (TR-RF-085):**

- [ ] Un médico que abre la historia clínica de un titular deja una fila `ACCESO_SENSIBLE` con usuario, finalidad `ATENCION` y fecha (TR-CA-211).
- [ ] Un agente con finalidad `SOPORTE` deja la fila con su ticket; sin ticket el registro falla en el dominio y en la base (TR-CA-212).
- [ ] Sin actor en el contexto, `registrarAccesoSensible` falla.

**`@Auditable`:**

- [ ] Una ruta con `@Auditable` deja una fila con acción, entidad, `despues`, motivo, usuario, sucursal e IP de la petición en la misma transacción del caso de uso.
- [ ] Si el handler lanza, no hay fila ni cambio de negocio.

**Eventos de plataforma (TR-RN-034, TR-RNF-008):**

- [ ] `sync.outbox` guarda `actor_id`, `ip` y `trace_id` del contexto; `traceparent` inválido deja `trace_id` NULL.
- [ ] Cada tipo de `EVENTOS_AUDITADOS` deja una fila `origen = 'EVENTO'` con su `event_id`, actor, sucursal, IP, trace y `despues` = payload enmascarado.
- [ ] Un evento reentregado deja una sola fila.
- [ ] `seq.numero.emitido` y `suscripcion.por_vencer` no dejan fila.

**Aislamiento, seguridad, migraciones y calidad:**

- [ ] Desde el tenant A no se lee ni inserta ninguna fila de B en `aud.evento_auditoria`.
- [ ] `anon` y `authenticated` no tienen acceso al esquema `aud`.
- [ ] El inverso de `01g_aud.sql` falla si hay filas; `db:up && db:down && db:up` sin filas termina con 0 en CI.
- [ ] Ningún log incluye `antes`, `despues`, `motivo` ni el payload.
- [ ] `src/domain` no importa `@nestjs/*` ni `typeorm`. `auditoria` solo importa `kernel`, `kernel-infra`, `seguridad`, `eventos` y `shared` (Nx en CI).
- [ ] Cobertura de líneas de `src/domain/**` ≥ 70 %.
- [ ] El código nuevo sigue la sección «Código limpio» de `CLAUDE.md` y pasó por `code-simplifier`.
- [ ] `pnpm nx run-many -t lint test build` termina con código 0 y `nx affected` está en verde en CI.

**Nube (verificación manual, evidencia en `docs/ops/supabase-ambientes.md`):**

- [ ] En dev, `01e_sync_traza.sql` y `01g_aud.sql` están aplicadas; `aud` no está en la Data API y `get_advisors` no tiene alertas nuevas de RLS.
- [ ] En dev, crear una sucursal deja su fila de auditoría con el usuario real.
- [ ] Las horas reales de E-01 (parte 20a) quedan registradas en el plan.

## Decisiones

- **Sí:** partir el 20 en 20a (registro), 20b (consulta, exportación, integridad) y 20c (visor). Decisión del usuario. Junto llegaba a 13-15 h.
- **Sí:** captura mixta. Decisión del usuario. `AuditoriaPort` y `@Auditable` en la misma transacción para quien puede importar `comp:aud` (productos, `apps/api`); consumidor del outbox para las libs de plataforma, que por PL-10 no pueden importarlo.
- **No:** solo outbox. La auditoría de productos quedaría asíncrona y dependería del worker para cumplir «100 % auditadas».
- **Sí:** el registro directo falla cerrado: si no se audita, la operación no se confirma. Mismo criterio que el 18b.
- **Sí:** hash en la base. Decisión del usuario. Se implementa con un trigger `BEFORE INSERT` (`aud.encadenar`) en vez de una función que el adaptador llame: el cálculo es el mismo, pero cualquier vía de inserción queda encadenada y el adaptador inserta con TypeORM sin SQL crudo.
- **Sí:** SHA-256 con `sha256()` nativo de PostgreSQL 16, sin `pgcrypto`. Contenido canónico con `jsonb::text` (claves ordenadas) y `ocurrido_en` en microsegundos desde epoch, independiente de `TimeZone`.
- **Sí:** serializar por tenant con `pg_advisory_xact_lock`. Funciona con el pooler en modo transacción (spec 11 descartó los de sesión, no los de transacción).
- **Sí:** cadena por tenant con `numero` secuencial. El verificador del 20b recorre por `numero` y detecta huecos.
- **Sí:** solo inserción en tres capas: trigger por sentencia (alcanza al dueño), `REVOKE UPDATE, DELETE, TRUNCATE` y RLS sin políticas de cambio. El inverso no borra filas.
- **Sí:** acceso sensible en la misma tabla con `tipo`. Decisión del usuario. Una sola cadena verificable; `entidad_tipo` y `entidad_id` guardan el recurso.
- **Sí:** `ticket` obligatorio con `SOPORTE` en dominio y en la base (TR-CA-212). El enlace con el acceso de soporte del spec 18 no se valida aquí.
- **Sí:** actor, IP y trace como columnas de `sync.outbox` y campos opcionales de `TenantScope`. Decisión del usuario. Sirve a todos los consumidores; ponerlo en cada payload era inconsistente.
- **Sí:** `trace_id` solo de `traceparent`. Generar trazas es del spec 21.
- **Sí:** auditar ORG y suscripción por evento. Decisión del usuario. `seq.numero.emitido` no (volumen alto, sin valor); `suscripcion.por_vencer` no (aviso, no operación).
- **Sí:** sumar a `EVENTOS_AUDITADOS` `tenant.suspendido`, `tenant.reactivado`, `tenant.dado_de_baja` y `unidad.inactivada`. Decisión del usuario al implementar el paso 6: el contraste con lo que publica ORG los encontró fuera de la lista y son operaciones de usuario, con el mismo valor de auditoría que `sucursal.inactivada`.
- **Sí:** en eventos, `antes = null` y `despues = payload`. El payload es la foto tras el cambio; reconstruir el antes exigiría leer el evento previo del agregado.
- **Sí:** `@Auditable` incluido y probado con un controlador de prueba, sin uso real. Decisión del usuario. El primer uso es el spec 25.
- **Sí:** `@Auditable` abre la transacción alrededor del handler y el caso de uso la reutiliza (`TypeOrmUnitOfWork` anidado). Así la fila y el cambio confirman juntos.
- **No:** `@Auditable` con `antes`. El interceptor no lo conoce; el caso de uso que lo necesite llama a `AuditoriaPort`.
- **Sí:** enmascarado por lista de claves con defecto y extras por llamada; tope de 64 KB por JSON. Propuesta de redacción: revisar la lista al aprobar.
- **Sí:** sin particionado. Decisión del usuario. Tabla simple con índices; particionar y archivar va a un spec posterior.
- **Sí:** conservación de 5 años sin purga automática (TR-RN-028).
- **No:** declarar `plat.auditoria.registrar` y `plat.auditoria.acceso_sensible`. Son llamadas internas sin endpoint. Los permisos de consulta y exportación son del 20b.
- **Sí:** `entidad_id` como texto. Los productos identifican entidades con códigos (`V-000981`), no siempre uuid.
- **Sí:** nombres de columna `sucursal_id` (como `X-Sucursal-Id`), no `sede_id` del outbox.
- **Sí:** sin PostgreSQL ni Supabase locales. Pruebas SQL y de integración en CI; en local con PGlite, avisando que no es PostgreSQL 16.

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| El bloqueo por tenant serializa las transacciones que auditan: una transacción larga frena al resto del tenant | Las transacciones de la app son cortas. La prueba de 50 en paralelo mide la contención; si duele, se mueve la inserción al final del caso de uso. Se documenta en el JSDoc de `AuditoriaPort`. |
| `sha256()` o `jsonb::text` se comportan distinto en PGlite que en PostgreSQL 16 | La prueba SQL de CI con PostgreSQL 16 es la que vale; PGlite solo es apoyo local. |
| `read_events` no devuelve las columnas nuevas del outbox | La prueba de `01e_sync_traza.sql` lo verifica; si falla, la migración recrea las funciones. |
| `ALTER TABLE sync.outbox` bloquea el outbox en dev mientras corre | Columnas `NULL` sin defecto: el cambio es solo de catálogo e instantáneo. |
| Una fila de auditoría mal enmascarada guarda un dato personal para siempre (no se puede borrar) | Lista por defecto amplia, pruebas de enmascarado y revisión de cada `@Auditable` en su spec. |
| El rollback en un ambiente con filas falla | Es intencional (TR-RN-028). Se documenta en la prueba de ida y vuelta, que corre sin filas. |
| Eventos de plataforma emitidos sin actor (tareas del worker) se ven como «sistema» | Es correcto para tareas; las operaciones de usuario pasan por `ContextoTenantInterceptor`. |

## Lo que **no** está en este spec

- Consulta, detalle, exportación, permisos y verificación de integridad (20b).
- Visor en `admin-cliente` (20c).
- Usos reales de `@Auditable` y `AuditoriaPort` (spec 25 en adelante).
- Auditar eventos de CFG, SEQ, CAT y SEG.
- Particionado, archivado y retención automatizada.
- ARCO e incidentes (R2).
- Generación de trazas OpenTelemetry (spec 21).
