# SPEC 03 — Dominio org: tenant, empresa, sucursal, unidad, suscripción y estados

> **Status:** Aprobado
> **Depends on:** SPEC 02
> **Date:** 2026-10-19
> **Objective:** Construir la lib `libs/plataforma/org` con la jerarquía tenant → empresa → sucursal → unidad, la suscripción por producto y el cambio de estado del tenant, sobre una migración `org` corregida con RLS forzada y eventos por outbox.

## Por qué existe este spec

Fila 03 de `docs/roadmap-specs.md` (versión 2): O-01 (6 h) y la parte de O-03 sin tarea diaria, unas 9 h. El alta con asistente, la siembra, la invitación al propietario y el vencimiento (RF-001, RF-007) pasan al spec 12, porque usan membresías, CFG, SEQ y el relay, que se construyen después. Contexto de apoyo: `docs/spec-context/03-org-dominio-y-alta-tenant.md` (escrito antes de la partición; sus secciones 1, 5 y 9 sobre el alcance quedan superadas por este spec).

PL-10 pone `K → ORG → SEG`: org solo depende de `kernel`. Todo lo que el SRS atribuye a SEG, IDN, CAT, NOT o AUD se resuelve con un puerto o con un evento, nunca con un import.

Cubre **TR-RF-002, 003, 004, 005 y 006**, con las reglas **TR-RN-001, 002, 003, 004, 005 y 006**, y los criterios **TR-CA-004 a TR-CA-018** (con las partes diferidas que se indican en los criterios).

RNF propios: **TR-RNF-010** (aislamiento), **TR-RNF-008** (idempotencia), **TR-RNF-027** (límites por suscripción sin cambiar código).
RNF heredados: 012, 013 y 112 (historial de estado, la auditoría completa es del spec AUD), 024/119, 025 (cobertura de `domain/` ≥ 70 %), 026, 106.

Historias del backlog: **O-01** completa y **O-03** sin la tarea diaria.

## Alcance

**In:**

- **Migración** `db/01a_org.sql` y su inverso `db/rollback/01a_org.sql`: tablas `org.tenant`, `org.suscripcion`, `org.empresa`, `org.sucursal`, `org.unidad_operativa` y `org.tenant_estado_historial`, con las correcciones listadas en "Base de código reutilizada". Prueba SQL `db/tests/01a_org.test.sql`.
- **Validador de RUC** módulo 11 de SUNAT (TR-RN-002) en `libs/shared/util` (`validarRuc`).
- **Lib `libs/plataforma/org`** (`scope:plataforma`, `type:backend`, `comp:org`) con `domain · application · infrastructure · test` e `index.ts`:
  - Agregados `Tenant`, `Suscripcion`, `Empresa`, `Sucursal`, `UnidadOperativa`.
  - Casos de uso: `CrearTenant` (interno, mínimo), `RegistrarEmpresa`, `EditarEmpresa`, `RegistrarSucursal`, `EditarSucursal`, `InactivarSucursal`, `MarcarSucursalPrincipal`, `RegistrarUnidad`, `EditarUnidad`, `InactivarUnidad`, `GestionarSuscripcion`, `CambiarEstadoTenant`.
  - Puertos `PadronRucPort` (adaptador nulo) y `UsoUsuariosPort` (adaptador que devuelve 0).
  - Repositorios TypeORM sobre el `EntityManager` de `TypeOrmUnitOfWork`.
  - Esquemas JSON de los eventos de org registrados en `InMemoryEventSchemaValidator`.
  - `OrgModule` de NestJS.
- **Cableado en `apps/api`**: `KernelInfraModule` con el `DataSource` de `DATABASE_URL` y `OrgModule`. Sin controladores.
- Pruebas unitarias de dominio y de casos de uso; pruebas de integración contra PostgreSQL 16 de compose y CI.

**Out of scope (para otros specs):**

- Alta con asistente, siembra de parámetros, series y roles, invitación al propietario por Admin API (RF-001, TR-CA-001 a 003, spec 12). `CrearTenant` aquí no invita ni siembra.
- Tarea diaria de vencimientos, avisos y paso a `VENCIDA` (RF-007, TR-CA-019 a 021, spec 12).
- Controladores `/v1/org/*`, OpenAPI y `@Permiso` (spec 07 en adelante; la consola es el spec 17). Aquí solo se declaran los códigos de permiso como constantes.
- Consulta real al padrón (TR-IDN, R2). TR-CA-006 (advertencia NO HABIDO) queda diferido.
- Catálogos `TIPO_UNIDAD` y `UBIGEO` (spec 19a, `CatalogoPort`). Aquí lista cerrada y formato.
- Conteo real de usuarios activos para `limite_usuarios` (necesita `seg.membresia`, spec 08).
- TR-RN-010, último propietario activo (specs 08 y 12).
- Correo al propietario al suspender (TR-NOT, R2): se publica el evento, nadie lo consume todavía.
- Cierre de sesiones al suspender o dar de baja (specs 04 y 05; el hook de token ya no entrega tenants en `SUSPENDIDO` o `BAJA`).
- Restricción "solo consulta y pago" para tenants suspendidos (guard del spec 07).
- Invalidación de la caché de permisos y disponibilidad de roles del producto nuevo (TR-CA-015, consumidores de seguridad en specs 06 y 07).
- Inactivar empresa (cascada sobre sucursales, unidades y series).
- Purga de datos tras 90 días en `BAJA`.
- Relay del outbox (spec 11).

## Base de código reutilizada

Fuente: `docs/Plataforma_Plan_Mermaid_Estructura_Codigo/Plataforma_Plan/codigo/`. No hay código de org en TypeScript: la lib se escribe desde cero siguiendo el patrón hexagonal de `libs/plataforma/seguridad/`.

**Se conserva de `db/01a_org.sql`:**

- Esquema `org`, las cinco tablas y sus columnas.
- FK compuestas `(tenant_id, id)` entre empresa, sucursal y unidad.
- CHECK de RUC `^(10|15|17|20)\d{9}$`, `UNIQUE (tenant_id, ruc)`, `UNIQUE (empresa_id, codigo)` en sucursal.
- `ux_sucursal_principal`, `ck_unidad_sin_sucursal` (TR-RN-004), `UNIQUE (empresa_id, tipo, codigo)`, `ix_unidad_sucursal`.
- Políticas por `current_setting('app.tenant_id', true)::uuid`.

**Cambia:**

- Archivo reversible con su inverso en `db/rollback/`. La cabecera dice PostgreSQL 16.
- `ENABLE` y `FORCE ROW LEVEL SECURITY` en todas las tablas, incluida `org.tenant` (política `id = app.tenant_id`).
- Políticas por operación (`SELECT`, `INSERT`, `UPDATE`) con `USING` y `WITH CHECK`; sin `DELETE`. Nada se borra: se inactiva o cambia de estado.
- `REVOKE ALL` sobre el esquema `org` a `anon, authenticated` (bloque `DO` que comprueba que existan, como en `01e_sync_outbox.sql`).
- `tenant.estado` sin default; columnas `estado_motivo`, `estado_cambiado_en`, `baja_en`.
- `suscripcion` con `id uuid` propio (el outbox exige `aggregate_id` uuid) y `UNIQUE (tenant_id, producto_codigo)`.
- `suscripcion.producto_codigo` con CHECK de los nueve productos. Sin FK a `seg.producto`: seg depende de org, no al revés.
- CHECK de `plan` (`BASICO|PRO|EMPRESA`) y de límites `>= 1`.
- `version bigint` en cada tabla de agregado para la versión del outbox y la concurrencia optimista.
- La sucursal principal lleva siempre el establecimiento `0000`, y solo ella.
- `UNIQUE (empresa_id, codigo_establecimiento_sunat)` cuando no es nulo.
- `padre_id` de unidad con FK compuesta `(tenant_id, padre_id)`; la misma empresa se valida en el dominio.
- Ids sin default en SQL: los genera `IdGenerator` (UUID v7).
- Tabla nueva `org.tenant_estado_historial`.

## Modelo de datos

### Tablas (`db/01a_org.sql`)

```sql
CREATE TABLE org.tenant (
  id                 uuid PRIMARY KEY,
  codigo             varchar(30)  NOT NULL UNIQUE CHECK (codigo ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length(codigo) >= 3),
  nombre             varchar(150) NOT NULL CHECK (char_length(nombre) >= 3),
  estado             varchar(15)  NOT NULL CHECK (estado IN ('PRUEBA','ACTIVO','SUSPENDIDO','BAJA')),
  estado_motivo      varchar(500) NULL,
  estado_cambiado_en timestamptz  NULL,
  baja_en            timestamptz  NULL,
  version            bigint       NOT NULL,
  creado_en          timestamptz  NOT NULL DEFAULT now(),
  CHECK ((estado = 'BAJA') = (baja_en IS NOT NULL))
);

CREATE TABLE org.suscripcion (
  id                uuid PRIMARY KEY,
  tenant_id         uuid        NOT NULL REFERENCES org.tenant (id),
  producto_codigo   varchar(5)  NOT NULL CHECK (producto_codigo IN ('REST','PSI','COL','LIB','GYM','CLI','DOC','ECO','LEX')),
  edicion           varchar(30) NULL,
  plan              varchar(30) NOT NULL CHECK (plan IN ('BASICO','PRO','EMPRESA')),
  estado            varchar(15) NOT NULL CHECK (estado IN ('PRUEBA','ACTIVA','VENCIDA','CANCELADA')),
  limite_sucursales int  NULL CHECK (limite_sucursales >= 1),
  limite_usuarios   int  NULL CHECK (limite_usuarios >= 1),
  vigente_hasta     date NULL,
  version           bigint NOT NULL,
  UNIQUE (tenant_id, producto_codigo)
);

-- empresa: columnas de 01a + version; razon_social 1-200, nombre_comercial 0-150,
--   direccion_fiscal 0-250, ubigeo ^\d{6}$.
-- sucursal: columnas de 01a + version, más:
--   CHECK (NOT es_principal OR codigo_establecimiento_sunat = '0000')
--   CHECK (es_principal OR codigo_establecimiento_sunat IS DISTINCT FROM '0000')
--   CHECK (NOT es_principal OR activo)
--   UNIQUE (empresa_id, codigo_establecimiento_sunat)  -- NULL no colisiona
-- unidad_operativa: columnas de 01a + version, FK (tenant_id, padre_id) → (tenant_id, id),
--   UNIQUE (tenant_id, id), CHECK (padre_id IS DISTINCT FROM id).

CREATE TABLE org.tenant_estado_historial (
  id              uuid PRIMARY KEY,
  tenant_id       uuid        NOT NULL REFERENCES org.tenant (id),
  estado_anterior varchar(15) NOT NULL,
  estado_nuevo    varchar(15) NOT NULL,
  motivo          varchar(500) NOT NULL CHECK (char_length(motivo) >= 10),
  fecha_efectiva  timestamptz NOT NULL,
  actor_id        uuid        NULL,          -- seg.usuario; sin FK, seg viene después
  registrado_en   timestamptz NOT NULL DEFAULT now()
);
```

RLS: `org.tenant` por `id`; las demás por `tenant_id`. El historial es de solo inserción (`SELECT` e `INSERT`).

Rollback: `DROP SCHEMA org CASCADE`.

### Dominio (`libs/plataforma/org/src/domain`)

```ts
type EstadoTenant = 'PRUEBA' | 'ACTIVO' | 'SUSPENDIDO' | 'BAJA';
const TRANSICIONES: Record<EstadoTenant, EstadoTenant[]> = {
  PRUEBA: ['ACTIVO', 'SUSPENDIDO', 'BAJA'],
  ACTIVO: ['SUSPENDIDO', 'BAJA'],
  SUSPENDIDO: ['ACTIVO', 'BAJA'],
  BAJA: [],
};

type ProductoCodigo = 'REST' | 'PSI' | 'COL' | 'LIB' | 'GYM' | 'CLI' | 'DOC' | 'ECO' | 'LEX';
type Plan = 'BASICO' | 'PRO' | 'EMPRESA';
type EstadoSuscripcion = 'PRUEBA' | 'ACTIVA' | 'VENCIDA' | 'CANCELADA';

const TIPOS_UNIDAD = ['ALMACEN', 'CAJA', 'PUNTO_VENTA', 'CONSULTORIO', 'VENTANILLA',
  'SALON', 'ESTACION_PRODUCCION', 'FARMACIA', 'OFICINA'] as const; // lo reemplaza CatalogoPort (19a)
```

Agregados (extienden `AggregateRoot` de `kernel`): `Tenant`, `Suscripcion`, `Empresa`, `Sucursal`, `UnidadOperativa`. Los value objects `Ruc`, `Ubigeo`, `CodigoEstablecimiento` y `CodigoTenant` validan formato en el constructor.

Reglas que viven en el dominio (no en SQL ni en el caso de uso):

- Matriz de transiciones y motivo de 10 a 500 caracteres (TR-RN-005, TR-CA-017, TR-CA-018).
- Límite de sucursales (TR-RN-006, TR-CA-008): se cuentan las sucursales **activas del tenant** (todas sus empresas). El tope es el menor `limite_sucursales` no nulo entre las suscripciones en `PRUEBA` o `ACTIVA`. Sin suscripciones vigentes o con todos nulos, no hay tope.
- Límites nuevos no menores al uso actual (TR-CA-014).
- Unidad sin sucursal solo si es `ALMACEN` (TR-RN-004, TR-CA-011); `padre_id` de la misma empresa.

### Puertos (`application/ports`)

```ts
interface PadronRucPort { consultar(ruc: string): Promise<DatosPadron | null> } // nulo: siempre null
interface UsoUsuariosPort { activos(tenantId: string, producto: ProductoCodigo): Promise<number> } // provisional: 0
```

`DatosPadron = { razonSocial, estado, condicion }`. Con `null` la razón social se toma del comando y es obligatoria.

### Eventos (`schema_version = 1`, `aggregate_type` = nombre del agregado en minúscula)

| `event_type` | Payload mínimo |
| --- | --- |
| `tenant.creado` | `codigo`, `nombre`, `estado` |
| `tenant.suspendido`, `tenant.reactivado`, `tenant.dado_de_baja` | `estado_anterior`, `motivo`, `fecha_efectiva` |
| `suscripcion.cambiada` | `producto_codigo`, `plan`, `estado`, `limite_sucursales`, `limite_usuarios`, `vigente_hasta`, `nueva` (bool) |
| `empresa.creada`, `empresa.actualizada` | `ruc`, `razon_social`, `nombre_comercial` |
| `sucursal.creada`, `sucursal.actualizada`, `sucursal.inactivada` | `empresa_id`, `codigo`, `nombre`, `es_principal`, `codigo_establecimiento_sunat` |
| `unidad.creada`, `unidad.actualizada`, `unidad.inactivada` | `empresa_id`, `sucursal_id`, `tipo`, `codigo` |

`PRUEBA → ACTIVO` publica `tenant.reactivado`. Los esquemas viven en `infrastructure/event-schemas.ts` y `registrarEsquemasOrg(validator)` los registra.

### Permisos (`application/permisos.ts`, solo constantes)

`plat.empresa.crear`, `plat.sucursal.gestionar`, `plat.unidad.gestionar`, `plat.suscripcion.gestionar`, `plat.tenant.cambiar_estado`. `plat.tenant.crear` se declara en el spec 12. Los toma el manifiesto del spec 06 y el `@Permiso` del 07.

## Plan de implementación

1. **Migración** `db/01a_org.sql`, inverso y `db/tests/01a_org.test.sql` con un rol sin `BYPASSRLS`: aislamiento entre dos tenants en las seis tablas, `DELETE` falla, CHECKs de RUC, plan, límites, principal `0000` y unidad sin sucursal. Verificar: `pnpm db:up && pnpm db:down && pnpm db:up` y la prueba SQL en verde.
2. **`validarRuc`** en `libs/shared/util` con pruebas (20601234561 válido, 20601234560 inválido, prefijo 11 inválido, 10 dígitos inválido). Verificar: `pnpm nx test shared-util`.
3. **Lib `org`**: `project.json` con tags y alias `@vitrina/plataforma/org`, carpetas de capa, `index.ts` vacío. Verificar: `pnpm nx lint org` y `build`.
4. **Dominio `Tenant` y `Suscripcion`**: transiciones, motivo, límites contra uso. Pruebas unitarias. Verificar: `pnpm nx test org`.
5. **Dominio `Empresa`, `Sucursal`, `UnidadOperativa`** y value objects: principal `0000`, traslado de principal, inactivar principal rechazado, tope de sucursales, reglas de unidad. Pruebas unitarias. Verificar: `pnpm nx test org`.
6. **Repositorios TypeORM** en `infrastructure/typeorm` y esquemas de eventos. Prueba de integración: guardar y leer cada agregado dentro de `UnitOfWork.run`; conflicto de versión lanza `ConflictError`. Verificar: `pnpm nx test org`.
7. **`CrearTenant`, `RegistrarEmpresa`, `EditarEmpresa`** con `PadronRucPort` nulo. Integración de TR-CA-004 y 005. Verificar: `pnpm nx test org`.
8. **Casos de uso de sucursal** (registrar, editar, inactivar, marcar principal). Integración de TR-CA-007, 008 y 009. Verificar: `pnpm nx test org`.
9. **Casos de uso de unidad**. Integración de TR-CA-010, 011 y 012. Verificar: `pnpm nx test org`.
10. **`GestionarSuscripcion` y `CambiarEstadoTenant`** con historial. Integración de TR-CA-013, 014 (con `UsoUsuariosPort` falso), 016, 017 y 018. Verificar: `pnpm nx test org`.
11. **`OrgModule` y cableado en `apps/api`**: `DataSource` desde `DATABASE_URL`, `KernelInfraModule.register`, `registrarEsquemasOrg`, `OrgModule`. Verificar: `pnpm nx serve api` arranca y `GET /v1/salud` sigue en 200; `pnpm nx run-many -t lint test build` con código 0.

## Criterios de aceptación

**Empresa (TR-RF-002):**

- [ ] **TR-CA-004 (adaptado):** con tenant en `ACTIVO`, `RegistrarEmpresa` con RUC 20512345678 y razón social del comando deja la empresa activa y una sucursal principal con establecimiento `0000`, en una sola transacción, con `empresa.creada` y `sucursal.creada` en `sync.outbox`.
- [ ] **TR-CA-005:** registrar otra vez el RUC 20512345678 en el mismo tenant falla con «La empresa ya está registrada en este tenant» y no deja filas nuevas ni eventos.
- [ ] El mismo RUC se puede registrar en otro tenant.
- [ ] Un RUC con dígito verificador inválido (20601234560) falla con «RUC inválido» antes de abrir la transacción.
- [ ] `RegistrarEmpresa` falla si el tenant está en `SUSPENDIDO` o `BAJA`.

**Sucursal (TR-RF-003):**

- [ ] **TR-CA-007:** con 1 sucursal y tope 3, registrar «Cayma» con establecimiento `0002` y ubigeo `040103` la deja activa.
- [ ] **TR-CA-008:** con `limite_sucursales = 2` en REST y 2 sucursales activas, la tercera falla con «Su plan permite 2 sucursales; amplíe su plan».
- [ ] **TR-CA-009:** `MarcarSucursalPrincipal` sobre «Cayma» deja `es_principal` y `0000` en «Cayma» y quita ambos de «Centro» en la misma transacción; nunca hay dos principales.
- [ ] Inactivar la sucursal principal falla con «Marque otra sucursal como principal antes de inactivar esta».
- [ ] Un código de sucursal repetido en la misma empresa falla; un establecimiento repetido en la misma empresa falla.

**Unidad (TR-RF-004):**

- [ ] **TR-CA-010:** registrar `CAJA` con código `CAJA-01` en «Cayma» la deja activa en esa sucursal.
- [ ] **TR-CA-011:** registrar `CONSULTORIO` sin sucursal falla con «Solo los almacenes pueden registrarse sin sucursal».
- [ ] **TR-CA-012:** registrar `ALMACEN` sin sucursal lo deja a nivel de empresa (`sucursal_id` nulo).
- [ ] Un tipo fuera de `TIPOS_UNIDAD` falla; un `padre_id` de otra empresa falla.

**Suscripción (TR-RF-005):**

- [ ] **TR-CA-013:** cambiar CLI de `BASICO` a `PRO` con `limite_sucursales = 5` deja esos valores y publica `suscripcion.cambiada`.
- [ ] **TR-CA-014 (con puerto falso):** con `UsoUsuariosPort` que devuelve 12, fijar `limite_usuarios = 10` falla con «Hay 12 usuarios activos; el límite no puede ser menor».
- [ ] Fijar `limite_sucursales` menor que las sucursales activas falla con el mensaje equivalente.
- [ ] **TR-CA-015 (parte org):** agregar DOC en `BASICO` crea la suscripción y publica `suscripcion.cambiada` con `nueva = true`. La disponibilidad de roles es del consumidor de seguridad.
- [ ] Fijar `estado = VENCIDA` a mano falla: lo pone solo la tarea diaria del spec 12.
- [ ] `GestionarSuscripcion` falla si el tenant está en `BAJA`.

**Estado del tenant (TR-RF-006):**

- [ ] **TR-CA-016 (parte org):** `ACTIVO → SUSPENDIDO` con motivo «Deuda de 60 días» deja el tenant `SUSPENDIDO`, una fila en `org.tenant_estado_historial` y `tenant.suspendido` en el outbox.
- [ ] **TR-CA-017:** `BAJA → ACTIVO` falla con «Un tenant dado de baja no puede reactivarse; cree uno nuevo o restaure desde respaldo».
- [ ] **TR-CA-018:** `SUSPENDIDO` sin motivo (o con menos de 10 caracteres) falla y el estado no cambia.
- [ ] Cada transición de la matriz que no figura en `TRANSICIONES` falla, y cada una que figura pasa (prueba parametrizada).
- [ ] Pasar a `BAJA` fija `baja_en`.
- [ ] Repetir el cambio al estado actual termina sin error, sin fila de historial y sin evento (TR-RNF-008).

**Aislamiento y transacciones (TR-RNF-010, regla 4):**

- [ ] Con un rol sin `BYPASSRLS`, desde el tenant A no se lee ni se escribe ninguna fila del tenant B en las seis tablas.
- [ ] Un caso de uso que falla después de publicar un evento no deja filas de negocio ni en `sync.outbox`.
- [ ] Cada evento publicado pasa su esquema JSON y su `version` en el outbox coincide con la columna `version` del agregado.
- [ ] `anon` y `authenticated` no tienen `USAGE` sobre `org` en la base de dev.

**Migración y arquitectura (DoD):**

- [ ] `pnpm db:up && pnpm db:down && pnpm db:up` termina con 0 contra PostgreSQL 16 y `db:down` deja la base sin el esquema `org`.
- [ ] `org` solo importa de `kernel`, `kernel-infra` y `shared`; `domain/` no importa NestJS, TypeORM ni Supabase (lint).
- [ ] Cobertura de líneas de `libs/plataforma/org/src/domain` ≥ 70 %.
- [ ] `pnpm nx serve api` arranca con `OrgModule` y `GET /v1/salud` responde 200.
- [ ] `pnpm nx run-many -t lint test build` termina con código 0 y `nx affected` está en verde en CI.
- [ ] La migración queda aplicada en Supabase dev con `pnpm db:up:remoto` y el MCP confirma RLS activa en las seis tablas.
- [ ] Las horas reales de O-01 y O-03 (parcial) quedan registradas en el plan.

## Decisiones

- **Sí:** corte del roadmap v2, RF-002 a RF-006. Decisión del usuario. RF-001 y RF-007 necesitan membresías, CFG, SEQ y relay.
- **Sí:** `CrearTenant` interno y mínimo (código, nombre, estado inicial `PRUEBA` o `ACTIVO`, publica `tenant.creado`). Sin él no hay forma de probar el resto. El spec 12 lo envuelve con el asistente.
- **Sí:** sin capa HTTP. Decisión del usuario. Sin guard ni JWKS, un endpoint quedaría sin autorización. Los controladores llegan con `@Permiso`.
- **No:** controladores sin guard detrás de un flag, ni un guard falso. Superficie abierta o código a retirar.
- **Sí:** `PadronRucPort` con adaptador nulo y razón social manual. Decisión del usuario. El caso de uso no cambia cuando llegue TR-IDN en R2.
- **Sí:** RUC solo por módulo 11 en `libs/shared/util`. La estructura del plan lo ubica ahí y lo reusarán personas e identidad.
- **Sí:** matriz `PRUEBA → ACTIVO|SUSPENDIDO|BAJA`, `ACTIVO → SUSPENDIDO|BAJA`, `SUSPENDIDO → ACTIVO|BAJA`, `BAJA` terminal. Decisión del usuario. Cumple CA-017 y permite reactivar.
- **Sí:** eventos `tenant.reactivado` y `tenant.dado_de_baja`, que el SRS no cita. Sin ellos el consumidor de seguridad no sabe reponer ni retirar el tenant del token.
- **Sí:** historial de estados en tabla propia, de solo inserción. RF-006 pide motivo y auditoría; AUD (spec 16) consumirá los eventos, pero el motivo no puede depender de que AUD exista.
- **Sí:** estado del tenant y estado de suscripción independientes. Un tenant `ACTIVO` puede tener una suscripción `VENCIDA`; RN-006 los combina al calcular permisos (spec 07).
- **Sí:** `VENCIDA` reservado a la tarea diaria. RF-005 deja editar el estado y se solapa con RF-007; un solo dueño evita estados contradictorios.
- **Sí:** crear, editar e inactivar sucursal y unidad; crear y editar empresa. Decisión del usuario.
- **No:** inactivar empresa. Arrastra sucursales, unidades y series; se especifica cuando haga falta.
- **Sí:** la principal siempre es `0000`, solo ella, y no se puede inactivar. Decisión del usuario. Garantiza exactamente una principal por empresa activa (TR-RN-003).
- **Sí:** al trasladar la principal, la anterior queda con establecimiento nulo. No puede quedarse con `0000`; el usuario le asigna otro código al editarla.
- **Sí:** sucursal principal creada con código `PRINCIPAL` y nombre `Principal` al registrar la empresa. El SRS no da valores; son editables.
- **Sí:** tope de sucursales por tenant, el menor de las suscripciones vigentes. Las sucursales no son de un producto y RN-006 dice "no se exceden límites". Con un solo producto (CA-008) da lo mismo. Pendiente de confirmar al revisar este borrador (ver Riesgos).
- **Sí:** `UsoUsuariosPort` provisional que devuelve 0. El conteo real necesita `seg.membresia` (spec 08); CA-014 se prueba con un falso.
- **Sí:** tipos de unidad como lista cerrada en el dominio y ubigeo solo por formato. Decisión del usuario. El spec 19a los cambia por `CatalogoPort`.
- **Sí:** TR-RN-010 fuera de este spec. Decisión del usuario. No hay membresías; queda para los specs 08 y 12.
- **Sí:** `suscripcion.id` uuid propio con `UNIQUE (tenant_id, producto_codigo)`. El outbox exige `aggregate_id` uuid; la consulta de `seg.permisos_efectivos` por tenant y producto sigue funcionando.
- **No:** FK de `suscripcion.producto_codigo` a `seg.producto`. Invierte la dependencia `ORG → SEG`; el CHECK cubre la lista mientras tanto.
- **Sí:** columna `version` en cada agregado. Da la versión del outbox y bloqueo optimista con un `UPDATE ... WHERE version = $n`.
- **Sí:** `FORCE ROW LEVEL SECURITY` y políticas sin `DELETE`. Mismo criterio que `sync.outbox` en el spec 02.
- **Sí:** `CrearTenant` corre con `TenantContext.run({ tenantId: idNuevo })`. La política de `org.tenant` es por `id`; no hace falta un modo sistema.
- **Sí:** el correo al propietario y el cierre de sesiones se dejan a consumidores del evento. Org no depende de NOT ni de SEG.
- **Sí:** repetir el cambio al mismo estado es un no-op exitoso. Cubre reintentos (RNF-008) sin tabla de claves de idempotencia.
- **No:** tabla de claves de idempotencia. Ningún caso de uso de este spec la necesita: las altas chocan por `UNIQUE` y las ediciones por `version`.
- **Sí:** cablear `KernelInfraModule` y `OrgModule` en `apps/api`. El spec 02 lo dejó para la primera lib que lo use.

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| La regla del tope de sucursales (el menor entre suscripciones) no es la que quiere el negocio | Está aislada en una función del dominio con su prueba. Se confirma al aprobar el spec; cambiarla a "el mayor" toca una línea y una prueba. |
| `ux_sucursal_principal` no es diferible y el traslado de principal choca con el índice | El repositorio quita la marca de la anterior antes de marcar la nueva, en la misma transacción. Lo cubre TR-CA-009. |
| Sin RN-010, un tenant puede quedar suspendido sin propietario activo | Ningún usuario existe todavía; el spec 08 agrega la comprobación antes de abrir la consola. |
| `UsoUsuariosPort` devuelve 0 y en dev deja bajar `limite_usuarios` por debajo del uso real | No hay usuarios hasta el spec 08, que reemplaza el adaptador. Se anota en la tabla del roadmap. |
| Los eventos de org no tienen consumidor y nadie nota un payload mal formado | Cada esquema se valida al publicar (spec 02) y hay prueba por tipo de evento. |
| Tenants creados aquí sin alta completa (sin propietario, sin roles) quedan en dev | Se crean solo en pruebas; el spec 12 es el único camino de alta en dev real. |
| `typeorm` 1.x cambia la API de `EntitySchema` o transacciones | El UoW del spec 02 ya está probado con la versión instalada; los repositorios usan el mismo `EntityManager`. |

## Lo que **no** está en este spec

- Alta con asistente, siembra, invitación al propietario y tarea diaria de vencimientos (spec 12).
- Endpoints `/v1/org/*`, OpenAPI y `@Permiso` (spec 07 en adelante; consola en el spec 17).
- Padrón RUC y advertencia NO HABIDO (TR-IDN, R2).
- Catálogos `TIPO_UNIDAD` y `UBIGEO` (spec 19a).
- Conteo real de usuarios y regla del último propietario (spec 08).
- Correo de suspensión, cierre de sesiones, caché de permisos y roles por producto (NOT, specs 04, 05, 06 y 07).
- Inactivar empresa y purga tras 90 días en `BAJA`.

Cada uno entra en su propio spec cuando su sprint lo pida.
