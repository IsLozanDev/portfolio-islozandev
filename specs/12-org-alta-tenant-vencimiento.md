# SPEC 12 — Org: alta transaccional de tenant con propietario y series, y tarea diaria de vencimiento

> **Status:** Implementado
> **Depends on:** SPEC 03, SPEC 06, SPEC 08, SPEC 09, SPEC 10, SPEC 11
> **Date:** 2026-10-25
> **Objective:** Dar de alta un tenant en una sola transacción (tenant, suscripción, empresa, sucursal principal, series B001/F001 y propietario invitado con `PLAT_PROPIETARIO`) desde `POST /v1/org/tenants`, llamado por un administrador del tenant operador `plataforma`, y vencer suscripciones con una tarea diaria en el worker que avisa, pasa a `VENCIDA` y suspende al agotar la gracia.

## Por qué existe este spec

Fila 12 de `docs/roadmap-specs.md` (O-02 y la parte de vencimiento de O-03). Contexto de apoyo: `docs/spec-context/03-org-dominio-y-alta-tenant.md`, solo las partes de RF-001 y RF-007. Sus secciones 1, 5 y 9 sobre alcance quedan superadas por el spec 03 y por este.

El spec 03 dejó `CrearTenant` mínimo y reservó `VENCIDA` a esta tarea. El 08 dejó la invitación con token propio de 72 h. El 09 dejó `ParametroPort`. El 10 dejó `CrearSerie` exportado. El 11 dejó el worker y el patrón de lectura entre tenants con una función `SECURITY DEFINER`.

Hallazgos al leer el código que cambian lo que pide el SRS:

- Los roles predefinidos son globales (`seg.rol.tenant_id` nulo). Sembrar roles por tenant no hace falta: la suscripción ya los habilita (TR-RN-006).
- Los parámetros resuelven a `valor_defecto` si no hay valor. Sembrar valores no hace falta: basta con declarar las definiciones en el manifiesto.
- `PermisoGuard` exige `tenant_id` en el token. El "administrador de plataforma" del SRS no existe como actor. Se crea el tenant operador `plataforma`.
- `InvitarUsuario` (spec 08) exige que el otorgante cubra el alcance dentro del tenant. El administrador del operador no es miembro del tenant nuevo. Hace falta un caso de uso propio para el propietario.
- `org` no puede importar `seguridad` ni `correlativos` (PL-10). La orquestación vive en `apps/api`, como el controlador de fallidos del spec 11.

RF cubiertos:

- **TR-RF-001** dar de alta un tenant (sin asistente de UI; la consola es el spec 17).
- **TR-RF-007** controlar vencimiento de prueba y suscripción.

Criterios del SRS: **TR-CA-001, 002, 003, 019, 020 y 021**. Los de propietario existente, operador, fallo de Supabase, gracia con varios productos y aislamiento son propios.

Reglas: **TR-RN-001**, **TR-RN-002**, **TR-RN-003**, **TR-RN-005**, **TR-RN-006**.

RNF propios:

- **TR-RNF-029**: alta en menos de 15 min. Sin asistente, la llamada a la API tarda segundos; la prueba cronometrada va con la consola (spec 17).
- **TR-RNF-008**: el alta repetida choca por `codigo` único; la tarea repetida el mismo día no duplica avisos ni transiciones.
- **TR-RNF-010**: la tarea lee entre tenants solo con una función `SECURITY DEFINER`; cada efecto corre con el tenant de la suscripción.
- **TR-RNF-005**: la tarea no depende de la api; corre en el worker.

RNF heredados: 011 (secret key solo en `apps/api`), 012, 013 y 112 (historial de estado del spec 03), 024/119, 025, 026 (logs sin correo ni RUC), 101, 106.

Historias del backlog: **O-02** completa y **O-03** (parte de la tarea diaria). Estimado: 12-14 h. Decisión del usuario: un solo spec.

## Alcance

**In:**

- **Migración** `db/01a_org_alta.sql`, su inverso `db/rollback/01a_org_alta.sql` y prueba `db/tests/01a_org_alta.test.sql`. Ordena después de `01a_org.sql` y antes de `01b_seg.sql` por nombre; no referencia `seg`.
- **`libs/plataforma/org`**:
  - `CrearTenant` acepta el `id` del tenant desde fuera (el orquestador lo necesita antes de abrir la transacción).
  - Dominio: `Suscripcion.vencer(fecha)`, `diasParaVencer(fecha)`, `diasVencida(fecha)`; `AvisoVencimiento`; regla de suspensión por gracia; eventos `suscripcion.por_vencer` y `suscripcion.vencida`.
  - Casos de uso: `RevisarVencimientos` (tarea diaria) y `ProcesarVencimientosTenant` (un tenant).
  - Puertos: `SuscripcionesARevisar` (lectura entre tenants), `RepositorioAvisos`, `DiasGracia`.
  - Permiso `plat.tenant.crear` en las constantes.
- **`libs/plataforma/seguridad`**: caso de uso `InvitarPropietario` exportado en `index.ts`.
- **`libs/plataforma/correlativos`**: caso de uso `SembrarSeriesIniciales` exportado en `index.ts`.
- **`apps/api`**:
  - `apps/api/src/org/alta-tenant.ts` (orquestador), `alta-tenant.controller.ts`, `alta-tenant.http.ts` (DTO, zod, OpenAPI).
  - `apps/api/src/cli/sembrar-plataforma.ts` y script `pnpm plataforma:sembrar <correo>` (y `:remoto`).
  - `ORG_TENANT_OPERADOR` (por defecto `plataforma`) en `config/env.ts` y `.env.example`.
- **`apps/worker`**: `VencimientosModule` con un job scheduler de BullMQ (`0 6 * * *`, `America/Lima`), y `apps/worker/src/cli/ejecutar-vencimientos.ts` con script `pnpm vencimientos:ejecutar [--fecha AAAA-MM-DD]`.
- **Manifiesto PLAT** `1.5.0`: permiso `plat.tenant.crear`, roles `PLAT_ADMIN_TENANTS` y `PLAT_PROPIETARIO`, parámetros `plat.suscripcion.dias_gracia` y `plat.suscripcion.dias_prueba`.
- **Pruebas**: dominio (Jest), SQL contra PostgreSQL 16, integración con PostgreSQL 16 y Redis 7 (solo en CI) y proveedor de identidad falso, HTTP con supertest.
- **Nube, dev (manual)**: migración, manifiesto `1.5.0`, siembra del operador con un correo real, alta de un tenant de prueba y una corrida manual de la tarea.

**Out of scope (para otros specs):**

- Asistente de alta en la consola y prueba cronometrada de TR-RNF-029 (spec 17).
- Consulta al padrón RUC (TR-IDN, R2). Se usa el `PadronRucPort` nulo del spec 03; la razón social viene en el comando.
- Correo de avisos de vencimiento y de suspensión (TR-NOT, R2). Aquí se publican los eventos; nadie los consume todavía.
- Roles predefinidos por producto (`REST_*`, etc.). Llegan con el manifiesto de cada producto (spec 22 para SazónPOS).
- Series distintas de B001 y F001 o por producto.
- Límites de sucursales y usuarios en el alta. Se fijan después con `GestionarSuscripcion` (spec 03).
- Renovación o pago de la suscripción. `VENCIDA → ACTIVA` sigue por `GestionarSuscripcion`.
- Reactivación automática del tenant al renovar.
- Vista entre tenants para el operador (listar tenants): consola, spec 17.
- Clave de idempotencia por cabecera. El `codigo` único cubre los reintentos.
- Proyecto prod (plan de migración a producción).

## Base de código reutilizada

No hay alta de tenant ni tarea de vencimientos en `docs/Plataforma_Plan_Mermaid_Estructura_Codigo/Plataforma_Plan/codigo/`. Todo se escribe desde cero.

**Se conserva (como patrón):**

- Spec 03: `CrearTenant`, `RegistrarEmpresa` (crea empresa y sucursal principal `0000`), `GestionarSuscripcion`, `CambiarEstadoTenant` (con historial y no-op al mismo estado), `PadronRucPort` nulo, `validarRuc`.
- Spec 08: `ProveedorIdentidad` (`invitar` antes de la transacción, `enviarEnlace` después del commit), `Invitacion.emitir`, token de 32 bytes con hash sha256, `SEG_URL_INVITACION`, `SEG_INVITACION_HORAS`, `ProveedorIdentidadFalso`.
- Spec 09: `ParametroPort.resolver`.
- Spec 10: `Serie.crear` y sus validaciones SUNAT.
- Spec 11: rol `NOLOGIN` dueño de una función `SECURITY DEFINER` con política `TO <rol> USING (true)`; `apps/worker` con `createApplicationContext` y cierre ordenado; `bullmq` `6.3.11`.
- `kernel-infra`: `TypeOrmUnitOfWork` es reentrante (un `run` dentro de otro reutiliza la transacción). El orquestador abre una sola transacción y los casos de uso internos la comparten.
- `apps/api/src/cli/aplicar-manifiesto.ts`: conexión de migración con `--remoto` e impresión del host.

**Cambia:**

- `CrearTenant` recibe `id` opcional en el comando.
- `plat.manifiesto.json` pasa a `1.5.0`.
- `apps/api/src/app.module.ts` registra el controlador de alta.
- `apps/worker/src/worker.module.ts` registra `VencimientosModule` y `ParametrosModule`.

## Modelo de datos

### Migración `db/01a_org_alta.sql`

```sql
-- Avisos enviados por la tarea diaria (TR-CA-021).
CREATE TABLE org.aviso_vencimiento (
  id              uuid        PRIMARY KEY,
  tenant_id       uuid        NOT NULL REFERENCES org.tenant (id),
  suscripcion_id  uuid        NOT NULL REFERENCES org.suscripcion (id),
  dias_antes      smallint    NOT NULL CHECK (dias_antes IN (7, 3, 1)),
  vigente_hasta   date        NOT NULL,     -- fecha avisada; una renovación genera avisos nuevos
  fecha_ejecucion date        NOT NULL,
  registrado_en   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ux_aviso UNIQUE (suscripcion_id, vigente_hasta, dias_antes)
);
-- RLS ENABLE + FORCE: SELECT e INSERT con tenant_id = app.tenant_id. Sin UPDATE ni DELETE.

-- Lector de la tarea diaria. Mismo patrón que sync_lector (spec 11).
CREATE ROLE org_lector NOLOGIN;              -- dentro de DO ... IF NOT EXISTS
GRANT USAGE, CREATE ON SCHEMA org TO org_lector;
GRANT SELECT ON org.suscripcion, org.tenant TO org_lector;
CREATE POLICY suscripcion_vencimientos ON org.suscripcion FOR SELECT TO org_lector USING (true);
CREATE POLICY tenant_vencimientos      ON org.tenant      FOR SELECT TO org_lector USING (true);

-- SECURITY DEFINER, dueño org_lector, SET search_path = ''.
-- Devuelve solo ids y fechas: tenant_id, suscripcion_id, estado, vigente_hasta.
-- Filas con estado IN ('PRUEBA','ACTIVA','VENCIDA'), vigente_hasta NOT NULL,
-- vigente_hasta <= p_fecha + 7 y tenant en estado PRUEBA o ACTIVO.
org.suscripciones_a_revisar(p_fecha date) RETURNS TABLE (...)

-- SECURITY DEFINER, dueño org_lector, SET search_path = ''. Id o NULL (agregado al implementar los pasos 7 y 8).
org.tenant_por_codigo(p_codigo varchar) RETURNS uuid
```

- `REVOKE EXECUTE ... FROM PUBLIC`, `anon` y `authenticated`; `GRANT EXECUTE` al rol que corre la migración y, en la prueba SQL, al rol de prueba.
- El inverso borra función, políticas, tabla y permisos de `org_lector`. No borra el rol (es del clúster, como `sync_lector`).

### Manifiesto PLAT `1.5.0`

| Elemento | Detalle |
| --- | --- |
| Permiso `plat.tenant.crear` | `alcance_minimo` `TENANT`, **sensible** (aal2 y MFA ≤ 15 min, precondición de RF-001) |
| Rol `PLAT_ADMIN_TENANTS` | `plat.tenant.crear`, `plat.sesion.contexto` |
| Rol `PLAT_PROPIETARIO` | Todos los permisos de `PLAT_ADMIN_SEGURIDAD`, `PLAT_ADMIN_CONFIGURACION` y `PLAT_ADMIN_EVENTOS`. **No** incluye `plat.tenant.crear` |
| Parámetro `plat.suscripcion.dias_gracia` | `NUMERO`, defecto `5`, `alcance_maximo` `TENANT` (RF-007) |
| Parámetro `plat.suscripcion.dias_prueba` | `NUMERO`, defecto `15`, `alcance_maximo` `TENANT` |

`plat.sistema.job` no se declara: la tarea no tiene actor ni endpoint (mismo criterio que el spec 11).

### Dominio de org (agregados)

```ts
// Suscripcion (se agrega)
diasParaVencer(fecha: FechaCalendario): number | null;  // vigente_hasta - fecha; null sin vigente_hasta
diasVencida(fecha: FechaCalendario): number | null;     // fecha - vigente_hasta, si > 0
vencer(fecha: FechaCalendario): void;                    // PRUEBA|ACTIVA -> VENCIDA si fecha > vigente_hasta; ya VENCIDA: no-op

// domain/aviso-vencimiento.ts
const DIAS_AVISO = [7, 3, 1] as const;

// domain/regla-gracia.ts (función pura)
debeSuspenderse(suscripciones, diasGracia, fecha): boolean
// true si ninguna está en PRUEBA o ACTIVA, al menos una está VENCIDA
// y la vencida más reciente tiene diasVencida >= diasGracia.
```

- `FechaCalendario` es la fecha en `America/Lima` del instante del `Clock`. `vigente_hasta` es el último día con servicio.
- TR-CA-019: vence el 13/10, corre el 10/10, `diasParaVencer = 3`. TR-CA-020: `diasVencida = 5` y `dias_gracia = 5`, se suspende.
- La suspensión usa `Tenant.cambiarEstado('SUSPENDIDO', motivo)` con el motivo constante «Fin del periodo de gracia de la suscripción» y `actor_id` nulo. Publica `tenant.suspendido` y escribe el historial (spec 03).

### Eventos nuevos de org (`schema_version = 1`, `aggregate_type` `suscripcion`)

| `event_type` | Payload |
| --- | --- |
| `suscripcion.por_vencer` | `producto_codigo`, `vigente_hasta`, `dias_antes` |
| `suscripcion.vencida` | `producto_codigo`, `vigente_hasta`, `estado_anterior` |

`tenant.creado`, `suscripcion.cambiada`, `empresa.creada`, `sucursal.creada` y `tenant.suspendido` no cambian (spec 03). Seguridad y correlativos publican los suyos (`membresia.invitada`, `asignacion.otorgada`, `serie.creada`).

### Puertos de org (`application/ports/`)

```ts
SuscripcionesARevisar { listar(fecha): { tenantId, suscripcionId }[] }   // org.suscripciones_a_revisar
RepositorioAvisos     { registrar(aviso): boolean }                       // false si choca con ux_aviso
DiasGracia            { de(tenantId): number }                            // ParametroPort; adaptador en apps/worker
```

SQL crudo justificado por la regla 11: la llamada a `org.suscripciones_a_revisar`. Lo demás con entidades TypeORM (`orIgnore()` en `RepositorioAvisos`).

### Casos de uso: puntos no obvios

**Orquestador `AltaTenant`** (`apps/api/src/org/alta-tenant.ts`, TR-RF-001). Comando:

```ts
{ codigo, nombre, productoCodigo, plan, modalidad: 'PRUEBA' | 'ACTIVO', vigenteHasta?,
  ruc, razonSocial, nombreComercial?, correoPropietario, nombrePropietario,
  actor: { usuarioId, tenantId } }
```

1. El tenant del actor debe ser el operador (`codigo = ORG_TENANT_OPERADOR`); si no, `OperadorRequeridoError` (403). Un propietario de cliente puede asignarse `PLAT_ADMIN_TENANTS` (los predefinidos son globales); esta comprobación lo frena.
2. Validaciones antes de tocar Supabase: `CodigoTenant`, `validarRuc` (TR-CA-003, «RUC inválido»), producto distinto de `PLAT`, `ACTIVO` exige `vigenteHasta` futuro, correo y nombre (3-150). Si el `codigo` ya existe (`org.tenant_por_codigo`): `TenantDuplicadoError` «El código de tenant ya existe» (TR-CA-002).
3. `vigenteHasta` en `PRUEBA` sin valor: hoy + `plat.suscripcion.dias_prueba` (`ParametroPort` sin tenant de cliente, resuelve el defecto).
4. `InvitarPropietario.prepararIdentidad(correo, nombre)`: si el correo no tiene `seg.usuario`, `ProveedorIdentidad.invitar` (crea `auth.users`; el trigger crea `seg.usuario`). Va antes de la transacción, como en el spec 08.
5. `id` nuevo con `IdGenerator`; `TenantContext.run({ tenantId: id })` y **una** `UnitOfWork.run`:
   - `CrearTenant` con estado `PRUEBA` o `ACTIVO` según la modalidad.
   - `GestionarSuscripcion` (alta del producto con plan, estado `PRUEBA` o `ACTIVA` y `vigente_hasta`).
   - `RegistrarEmpresa` (empresa y sucursal principal `0000`).
   - `SembrarSeriesIniciales` en la sucursal principal.
   - `InvitarPropietario.registrar` (membresía, asignación, invitación).
6. Después del commit, si el usuario ya existía: `ProveedorIdentidad.enviarEnlace`. Si falla, el alta queda y la respuesta trae `correo_enviado: false`.
7. Un `UNIQUE` violado por carrera en `codigo` da `TenantDuplicadoError` y la transacción revierte todo. El `auth.users` creado en el paso 4 se reutiliza en el siguiente intento (riesgo aceptado en el spec 08).

**`InvitarPropietario`** (seguridad, exportado). Dos métodos:

- `prepararIdentidad(correo, nombre)` → `{ usuarioId, usuarioNuevo }`. Normaliza el correo. Fallo de Supabase: `IdentidadNoDisponibleError` (503) y nada escrito.
- `registrar({ usuarioId, usuarioNuevo, invitadoPor })` en la transacción activa (exige `TenantContext`):
  - `Membresia.invitar` con `es_propietario = true`.
  - `Asignacion.otorgar` de `PLAT_PROPIETARIO` con alcance `TENANT`, sin vigencia final.
  - `Invitacion.emitir` (72 h, hash del token). `marcarInterno` si el usuario es nuevo.
  - Eventos `membresia.invitada` y `asignacion.otorgada` en el outbox.
  - Devuelve `{ membresiaId, invitacionId, expiraEn, token }`.
- No aplica la regla del otorgante (TR-RN-008) ni el límite de usuarios: `PLAT` no tiene límite y el tenant no tiene miembros todavía. Por eso es un caso de uso aparte y no un modo de `InvitarUsuario`.
- `es_propietario` se agrega como parámetro de `Membresia.invitar` (por defecto `false`; `InvitarUsuario` no cambia).

**`SembrarSeriesIniciales({ empresaId, sucursalId, creadoPor })`** (correlativos, exportado):

- En la transacción activa crea `BOLETA` `B001` y `FACTURA` `F001`, 8 dígitos, reinicio `NUNCA`, `ultimo_numero = 0`, con `Serie.crear`. Publica `serie.creada` por cada una.
- No llama a `AlcanceActor.cubre`: el administrador del operador no es miembro del tenant nuevo. `creado_por` es su `seg.usuario` (FK global, válida).
- Solo lo usa el alta. `CrearSerie` no cambia.

**`RevisarVencimientos({ fecha })`** (org, TR-RF-007):

1. `SuscripcionesARevisar.listar(fecha)` y agrupa por tenant.
2. Por tenant, `ProcesarVencimientosTenant` en `TenantContext.run({ tenantId })` y su propia `UnitOfWork.run`. Un tenant que falla se loguea (`warn`, sin datos personales) y no detiene a los demás.
3. Devuelve `{ fecha, avisos, vencidas, suspendidos, fallidos }` y lo loguea en `info`.

**`ProcesarVencimientosTenant({ tenantId, fecha })`**:

1. Lee las suscripciones y el tenant con la RLS del tenant.
2. Avisos: si `diasParaVencer ∈ DIAS_AVISO` y `RepositorioAvisos.registrar` devuelve `true`, publica `suscripcion.por_vencer`. Si devuelve `false`, ya se avisó (TR-CA-021).
3. Vencimiento: `vencer(fecha)` en las vencidas; publica `suscripcion.vencida`; guardado con `version`.
4. Gracia: si `debeSuspenderse(suscripciones, DiasGracia.de(tenantId), fecha)` y el tenant está en `PRUEBA` o `ACTIVO`, lo suspende. Ya `SUSPENDIDO` o `BAJA`: nada (la función SQL ni lo devuelve).

### Ejecución de la tarea

- `VencimientosModule` en `apps/worker` registra con `upsertJobScheduler` el scheduler `org-vencimientos` (patrón `0 6 * * *`, `tz: 'America/Lima'`) sobre la cola `org-vencimientos`. Varias instancias del worker comparten el scheduler: BullMQ crea un solo trabajo por disparo. API exacta de `bullmq` `6.3.11` confirmada con ctx7 al implementar.
- El procesador calcula `fecha` con el `Clock` en `America/Lima` y llama a `RevisarVencimientos`. Sin reintentos de BullMQ: la siguiente corrida o la manual retoma.
- `pnpm vencimientos:ejecutar [--fecha AAAA-MM-DD]` corre lo mismo una vez, sin Redis. Por defecto la fecha de hoy en Lima. Con `--remoto` usa `DATABASE_MIGRATION_URL` e imprime el host.

### HTTP (`apps/api/src/org/alta-tenant.controller.ts`)

| Método y ruta | Permiso | Cuerpo | Éxito |
| --- | --- | --- | --- |
| `POST /v1/org/tenants` | `plat.tenant.crear` (sensible) | `{ codigo, nombre, producto_codigo, plan, modalidad, vigente_hasta?, ruc, razon_social, nombre_comercial?, correo_propietario, nombre_propietario }` | 201 `{ tenant_id, estado, suscripcion_id, vigente_hasta, empresa_id, sucursal_id, membresia_id, invitacion_id, expira_en, usuario_nuevo, correo_enviado }` |

Errores `{ codigo, mensaje }`:

| `codigo` | HTTP | Mensaje |
| --- | --- | --- |
| `SOLICITUD_INVALIDA` | 400 | Campos inválidos (zod) |
| `RUC_INVALIDO` | 400 | «RUC inválido» (TR-CA-003) |
| `OPERADOR_REQUERIDO` | 403 | Solo el tenant operador puede dar de alta tenants |
| `TENANT_DUPLICADO` | 409 | «El código de tenant ya existe» (TR-CA-002) |
| `IDENTIDAD_NO_DISPONIBLE` | 503 | El proveedor de identidad no respondió |
| `MFA_REQUERIDA` | 401 | Step-up (spec 05) |

- `@ApiBearerAuth()`, `X-Sucursal-Id` (lo exige `PermisoGuard`; el operador tiene sucursal principal propia) y OpenAPI con cada código.
- El controlador vive en `apps/api` porque orquesta `org`, `seguridad` y `correlativos`.
- La respuesta y los logs no llevan el token de invitación, el correo ni el RUC.

### CLI del operador (`pnpm plataforma:sembrar <correo> [--nombre <nombre>] [--remoto]`)

Con la conexión de migración (sin `--remoto`, `DATABASE_URL`) y la secret key:

1. Si no existe el tenant `ORG_TENANT_OPERADOR`, lo crea con `CrearTenant` (`ACTIVO`, nombre «Plataforma», sin suscripción), empresa con el RUC de `ORG_OPERADOR_RUC` y su sucursal principal.
2. Invita al correo con `InvitarPropietario` y además le otorga `PLAT_ADMIN_TENANTS` con alcance `TENANT`.
3. Idempotente: con tenant y membresía ya existentes no cambia nada y sale con 0. Imprime el host de destino; nunca imprime el token.

| Variable | Tipo | Uso |
| --- | --- | --- |
| `ORG_TENANT_OPERADOR` | cadena, por defecto `plataforma` | Código del tenant operador (api y CLI) |
| `ORG_OPERADOR_RUC` | 11 dígitos, requerida solo en el CLI | RUC de la empresa del operador |

## Plan de implementación

1. **Migración.**
   - `db/01a_org_alta.sql`, su inverso y `db/tests/01a_org_alta.test.sql` con un rol sin `BYPASSRLS`.
   - Casos: `suscripciones_a_revisar` devuelve filas de dos tenants; excluye `CANCELADA`, sin `vigente_hasta`, más de 7 días en el futuro y tenants `SUSPENDIDO` o `BAJA`; `anon` y `authenticated` no la ejecutan; `ux_aviso`; RLS de `org.aviso_vencimiento` entre dos tenants; `DELETE` no borra.
   - Verificar: `pnpm nx test migrar`; en local con PGlite (no es PostgreSQL 16), en CI `db:up` / `db:down` / `db:up`.
2. **Dominio de vencimiento en org.**
   - `vencer`, `diasParaVencer`, `diasVencida`, `DIAS_AVISO`, `debeSuspenderse`, eventos y esquemas; `id` opcional en `CrearTenant`; constante `plat.tenant.crear`.
   - Pruebas: TR-CA-019 (13/10 contra 10/10 da 3); día 0 no avisa; `vencer` antes de la fecha no cambia; gracia 4 de 5 no suspende, 5 de 5 sí; con otra suscripción `ACTIVA` no suspende; todas `CANCELADA` no suspende.
   - Verificar: `pnpm nx test org` y cobertura de `src/domain/**` ≥ 70 %.
3. **Tarea diaria en org.**
   - Puertos y adaptadores TypeORM (`SuscripcionesARevisar`, `RepositorioAvisos`), `RevisarVencimientos`, `ProcesarVencimientosTenant`.
   - Pruebas de integración con `DiasGracia` falso: TR-CA-019 (un `suscripcion.por_vencer` con `dias_antes = 3`); TR-CA-020 (tenant `SUSPENDIDO`, historial y `tenant.suspendido`); TR-CA-021 (segunda corrida el mismo día: 0 eventos nuevos y 0 filas nuevas); `suscripcion.vencida` una sola vez; un tenant que lanza no frena a otro; el efecto corre con `app.tenant_id` de su tenant.
   - Verificar: `pnpm nx test org` en CI.
4. **`SembrarSeriesIniciales`.**
   - Caso de uso y export en `correlativos`.
   - Pruebas: crea B001 y F001 con 8 dígitos en la sucursal dada; `serie.creada` por cada una; sin `TenantContext` falla; segunda llamada da `SerieDuplicadaError`.
   - Verificar: `pnpm nx test correlativos`.
5. **`InvitarPropietario`.**
   - `es_propietario` en `Membresia.invitar`, caso de uso y export.
   - Pruebas con `ProveedorIdentidadFalso`: correo nuevo crea usuario `INTERNO`, membresía `INVITADO` propietaria y asignación `PLAT_PROPIETARIO` `TENANT`; correo existente no crea usuario; Supabase caído da 503 sin escribir; aceptar la invitación (spec 08) deja al propietario `ACTIVO` con los permisos del rol.
   - Verificar: `pnpm nx test seguridad`.
6. **Manifiesto PLAT `1.5.0`.**
   - Permiso, dos roles y dos parámetros.
   - Verificar: `pnpm manifiesto:aplicar` contra la base de prueba aplica y la segunda vez da 0 cambios; `PLAT_PROPIETARIO` no contiene `plat.tenant.crear`.
7. **Orquestador y endpoint.**
   - `alta-tenant.ts`, controlador, `alta-tenant.http.ts`, `ORG_TENANT_OPERADOR`, registro en `AppModule`.
   - Pruebas de integración y supertest: TR-CA-001 (`polleria-dona-rosa`, REST, `BASICO`, `PRUEBA`, RUC 20601234565: tenant `PRUEBA`, suscripción `PRUEBA` con `vigente_hasta` = hoy + 15, sucursal principal `0000`, B001 y F001, propietario invitado y una llamada a `invitar`); TR-CA-002 (409 y 0 filas nuevas en org, seg, seq y outbox, sin llamada a Supabase); TR-CA-003 (20601234560 da 400 «RUC inválido» sin llamar a Supabase); actor de un tenant cliente con `PLAT_ADMIN_TENANTS` da 403 `OPERADOR_REQUERIDO`; `ACTIVO` sin `vigente_hasta` da 400; fallo en `SembrarSeriesIniciales` (falso) revierte todo; Supabase caído da 503 sin filas; correo existente responde `usuario_nuevo: false` y llama a `enviarEnlace`; sin MFA 401 step-up; sin permiso 403.
   - Verificar: `pnpm nx test api` y la ruta en `/v1/docs`.
8. **CLI del operador.**
   - `sembrar-plataforma.ts`, scripts `plataforma:sembrar` y `plataforma:sembrar:remoto`.
   - Prueba de integración: primera corrida crea tenant, empresa, sucursal y membresía con `PLAT_PROPIETARIO` y `PLAT_ADMIN_TENANTS`; segunda corrida no cambia nada.
   - Verificar: `pnpm nx test api`.
9. **Worker.**
   - `VencimientosModule` con el scheduler, adaptador `DiasGracia` sobre `ParametroPort`, `ParametrosModule` en `WorkerModule`, CLI `ejecutar-vencimientos.ts` y script.
   - Pruebas: el scheduler queda registrado una sola vez aunque arranquen dos workers; el procesador llama a `RevisarVencimientos` con la fecha de Lima (reloj fijo a las 05:30 UTC del 10/10 da 10/10 en Lima, que es 00:30); `dias_gracia` fijado a 3 en un tenant se respeta.
   - Verificar: `pnpm nx run-many -t lint test build` con código 0 y `pnpm nx run worker:serve` arranca y loguea el scheduler.
10. **Nube, dev (manual).**
    - `pnpm db:up:remoto`, `pnpm manifiesto:aplicar:remoto` del `1.5.0`, `pnpm plataforma:sembrar:remoto <correo del usuario>`. Revisar con el MCP que `org_lector` es `NOLOGIN` sin `BYPASSRLS`, que `org` no está en la Data API y `get_advisors` sin alertas nuevas de RLS.
    - Prueba de humo: aceptar la invitación del operador, enrolar MFA, `POST /v1/org/tenants` con un tenant de prueba y un segundo correo real; aceptar como propietario y ver `mi-contexto` con los permisos de `PLAT_PROPIETARIO`. Fijar `vigente_hasta` de la suscripción a hoy + 3 con la conexión de migración y correr `pnpm vencimientos:ejecutar --remoto` dos veces: un solo `suscripcion.por_vencer`. Borrar los datos de prueba (el operador queda).
    - Evidencia en `docs/ops/supabase-ambientes.md`.

## Criterios de aceptación

**Alta (TR-RF-001):**

- [ ] Con `plat.tenant.crear` en el tenant operador y MFA vigente, el alta de `polleria-dona-rosa` (REST, `BASICO`, `PRUEBA`, RUC 20601234565) deja el tenant en `PRUEBA`, la suscripción `PRUEBA` hasta hoy + 15 días, la empresa, la sucursal principal `0000`, las series B001 y F001, la membresía propietaria `INVITADO` con `PLAT_PROPIETARIO` y la invitación enviada (TR-CA-001).
- [ ] Con `polleria-dona-rosa` existente, otra alta con el mismo código responde 409 «El código de tenant ya existe», no llama a Supabase y no deja filas nuevas en `org`, `seg`, `seq` ni `sync.outbox` (TR-CA-002).
- [ ] Con RUC 20601234560 responde 400 «RUC inválido» y no llama a Supabase (TR-CA-003).
- [ ] `tenant.creado`, `suscripcion.cambiada`, `empresa.creada`, `sucursal.creada`, dos `serie.creada`, `membresia.invitada` y `asignacion.otorgada` entran al outbox en la misma transacción, todos con el `tenant_id` nuevo.
- [ ] Si un paso de la transacción falla, no queda ninguna fila del tenant en ningún esquema.
- [ ] Si Supabase falla, la respuesta es 503 y no hay filas.
- [ ] Un propietario con correo ya registrado no genera otro `seg.usuario`, recibe el enlace sin crear usuario y la respuesta trae `usuario_nuevo: false`.
- [ ] `ACTIVO` sin `vigente_hasta` futuro responde 400.
- [ ] Un usuario de un tenant cliente con `PLAT_ADMIN_TENANTS` asignado recibe 403 `OPERADOR_REQUERIDO`.
- [ ] Sin MFA de los últimos 15 min responde 401 step-up; sin el permiso, 403.
- [ ] Tras aceptar la invitación, el propietario tiene en `mi-contexto` los permisos de `PLAT_PROPIETARIO` y no tiene `plat.tenant.crear`.

**Operador:**

- [ ] `pnpm plataforma:sembrar <correo>` crea el tenant `plataforma` `ACTIVO` sin suscripción, su empresa y sucursal principal, y la membresía propietaria del correo con `PLAT_PROPIETARIO` y `PLAT_ADMIN_TENANTS`.
- [ ] Correrlo dos veces sale con 0 y la segunda no cambia filas.

**Vencimiento (TR-RF-007):**

- [ ] Con la suscripción PSI de `psico-andina` hasta el 13/10/2026, la tarea del 10/10/2026 publica un `suscripcion.por_vencer` con `dias_antes = 3` (TR-CA-019).
- [ ] Con una suscripción vencida hace 5 días, `dias_gracia = 5` y ninguna otra vigente, la tarea deja el tenant `SUSPENDIDO`, una fila de historial y `tenant.suspendido` en el outbox (TR-CA-020).
- [ ] Reejecutar la tarea el mismo día no publica avisos ni eventos nuevos ni escribe filas nuevas (TR-CA-021).
- [ ] Una suscripción `PRUEBA` o `ACTIVA` con `vigente_hasta` anterior a la fecha queda `VENCIDA` y publica `suscripcion.vencida` una sola vez.
- [ ] Con una suscripción vencida fuera de gracia y otra `ACTIVA`, el tenant no se suspende.
- [ ] `dias_gracia` fijado en 3 para un tenant suspende a los 3 días.
- [ ] El fallo en un tenant no impide procesar los demás y queda en el log sin datos personales.
- [ ] El scheduler `org-vencimientos` existe una sola vez con dos workers arrancados, con patrón `0 6 * * *` y zona `America/Lima`.

**Aislamiento, seguridad, migraciones y calidad:**

- [ ] Con un rol sin `BYPASSRLS`, desde el tenant A no se lee ni escribe ninguna fila de `org.aviso_vencimiento` de B; solo `org.suscripciones_a_revisar` lee entre tenants y devuelve solo ids y fechas.
- [ ] `anon` y `authenticated` no ejecutan `org.suscripciones_a_revisar`.
- [ ] Los efectos de la tarea corren con `app.tenant_id` igual al tenant de la suscripción.
- [ ] `apps/worker` no lee `SUPABASE_SECRET_KEY`.
- [ ] `org` no importa `seguridad`, `correlativos` ni `parametros`; `src/domain` no importa `@nestjs/*`, `typeorm` ni `bullmq` (Nx en CI).
- [ ] Ningún log ni respuesta incluye el token de invitación, el correo ni el RUC.
- [ ] Cobertura de líneas de `src/domain/**` de `org` ≥ 70 %.
- [ ] `POST /v1/org/tenants` figura en `/v1/docs` con sus códigos de error.
- [ ] `db:up && db:down && db:up` termina con 0 en CI y `db:down` deja la base como la dejó el spec 11.
- [ ] El código nuevo sigue la sección «Código limpio» de `CLAUDE.md` y pasó por `code-simplifier`.
- [ ] `pnpm nx run-many -t lint test build` termina con código 0 y `nx affected` está en verde en CI.

**Nube (verificación manual, evidencia en `docs/ops/supabase-ambientes.md`):**

- [ ] En dev, `01a_org_alta.sql` está aplicada, el manifiesto PLAT `1.5.0` figura en `seg.manifiesto_aplicado` y el tenant `plataforma` existe con su administrador.
- [ ] En dev, un alta real invita a un correo real, el propietario acepta y ve su contexto.
- [ ] En dev, dos corridas manuales de la tarea dejan un solo aviso, y los datos de prueba se borran.
- [ ] Las horas reales de O-02 y O-03 (parte de vencimiento) quedan registradas en el plan.

## Decisiones

- **Sí:** tenant operador `plataforma` con rol `PLAT_ADMIN_TENANTS`. Decisión del usuario. `PermisoGuard` y MFA no cambian; el administrador de plataforma es un miembro más de un tenant.
- **No:** solo CLI sin endpoint. Deja la consola (spec 17) sin API.
- **No:** guard aparte para tokens sin tenant con `tipo = SOPORTE`. Toca seguridad y el hook.
- **Sí:** el alta exige que el actor esté en el tenant operador, además del permiso. Los roles predefinidos son globales y un propietario de cliente puede asignarse `PLAT_ADMIN_TENANTS`.
- **Sí:** orquestación síncrona en `apps/api`, una sola transacción. Decisión del usuario. Todo o nada, y CA-001 se ve en la respuesta. `org` sigue sin importar `seguridad` ni `correlativos`.
- **No:** siembra por eventos con consumidores en el worker. Alta eventual con más modos de fallo y sin respuesta completa.
- **Sí:** no sembrar roles ni valores de parámetros. Los roles predefinidos son globales y los parámetros resuelven al defecto. Desviación del texto de RF-001 paso 5, sin efecto funcional.
- **Sí:** propietario con rol nuevo `PLAT_PROPIETARIO` (alcance `TENANT`) y `es_propietario = true`. Decisión del usuario. `es_propietario` no da permisos por sí solo.
- **Sí:** `PLAT_PROPIETARIO` sin `plat.tenant.crear`. Un cliente no da de alta otros tenants.
- **Sí:** `InvitarPropietario` como caso de uso aparte. La regla del otorgante y el límite de usuarios de `InvitarUsuario` no aplican al primer miembro.
- **Sí:** series B001 y F001 en la principal, 8 dígitos, `NUNCA`. Decisión del usuario. Iguales para todo producto.
- **Sí:** `SembrarSeriesIniciales` sin `AlcanceActor`. El administrador del operador no es miembro del tenant nuevo; el caso de uso solo lo llama el orquestador.
- **Sí:** `PRUEBA` dura `plat.suscripcion.dias_prueba` (defecto 15) si el comando no trae fecha; `ACTIVO` exige `vigente_hasta`. Decisión del usuario. El SRS no da la duración de la prueba.
- **Sí:** avisos como evento `suscripcion.por_vencer` más `org.aviso_vencimiento`. Decisión del usuario. El correo llega con TR-NOT en R2 como consumidor; la tabla da CA-021.
- **No:** correo con Resend en este spec. Adelanta NOT y suma horas.
- **Sí:** `ux_aviso` incluye `vigente_hasta`. Una renovación con fecha nueva vuelve a avisar.
- **Sí:** suspender solo si ninguna suscripción está vigente y la última vencida agotó la gracia. Decisión del usuario. Un producto vencido no apaga a los demás; RN-006 ya le quita los permisos.
- **Sí:** la tarea no reactiva ni renueva. `VENCIDA → ACTIVA` y `SUSPENDIDO → ACTIVO` siguen por `GestionarSuscripcion` y `CambiarEstadoTenant`.
- **Sí:** lectura entre tenants con `org.suscripciones_a_revisar` `SECURITY DEFINER`, dueño `org_lector`. Mismo patrón que el relay del spec 11. Devuelve solo ids y fechas; el resto se lee con la RLS del tenant.
- **Sí:** `org.tenant_por_codigo` `SECURITY DEFINER`, dueño `org_lector`, que devuelve el id o NULL. Decisión del usuario al implementar los pasos 7 y 8. La RLS de `org.tenant` (por `id`) no deja buscar otro tenant por código: TR-CA-002 exige rechazar el duplicado antes de llamar a Supabase, y el CLI del operador necesita el id para ser idempotente. Solo la llaman la api y el CLI; no sale por HTTP.
- **No:** dejar que el duplicado choque en el `INSERT`. Llamaría a Supabase y podría dejar un `auth.users` sin tenant.
- **Sí:** un tenant por transacción en la tarea. El fallo de uno no revierte a los demás.
- **Sí:** job scheduler de BullMQ en el worker con zona `America/Lima`. Una sola ejecución por disparo con varias instancias.
- **Sí:** CLI `pnpm vencimientos:ejecutar` para la reejecución manual de CA-021 y para dev.
- **No:** reintentos automáticos de la tarea. Es idempotente; la siguiente corrida o la manual retoma.
- **Sí:** fechas de calendario en `America/Lima`; `vigente_hasta` es el último día con servicio. Cuadra con TR-CA-019 y 020.
- **Sí:** `plat.tenant.crear` sensible. RF-001 exige MFA vigente.
- **No:** declarar `plat.sistema.job`. La tarea no tiene actor ni endpoint.
- **Sí:** CLI `plataforma:sembrar` idempotente para el operador. Decisión del usuario. Sin él no hay quién llame al endpoint.
- **Sí:** el operador no tiene suscripción. `PLAT` no es un producto contratable (CHECK del spec 03) y sus permisos no dependen de suscripción.
- **Sí:** RUC de prueba válidos (20601234565, 20601234560 inválido), como en el spec 03.
- **Sí:** idempotencia del alta por `codigo` único, sin cabecera. Mismo criterio que el spec 03.
- **Sí:** un solo spec de 12-14 h. Decisión del usuario.

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| `PermisoGuard` deja abierta una transacción con el tenant del actor y el orquestador la reutiliza (el UoW es reentrante), con `app.tenant_id` del operador | Se verifica en el paso 7. Si pasa, el controlador ejecuta el orquestador fuera de esa transacción. La prueba de TR-CA-001 falla por RLS si no se corrige. |
| `inviteUserByEmail` crea el usuario y la transacción falla después | El siguiente intento reutiliza el `seg.usuario` (spec 08). El código queda libre porque la transacción revirtió. |
| El SMTP por defecto de Supabase limita los correos por hora | Suficiente para dev; SMTP propio (Resend) antes de staging, ya anotado en `docs/ops/supabase-ambientes.md`. |
| `ALTER FUNCTION ... OWNER TO org_lector` falla en Supabase | Mismo camino que `sync_lector`, ya probado en dev en el spec 11. |
| La API de job schedulers de `bullmq` 6.3.11 difiere de lo supuesto | Se consulta con ctx7 en el paso 9; queda detrás de `VencimientosModule`. |
| El worker cae a las 06:00 y la tarea de ese día no corre | La siguiente corrida avisa con los días que correspondan (se pierde un aviso intermedio) y vence o suspende igual. CLI manual para recuperar. Alertas en el spec 21. |
| Los eventos `suscripcion.por_vencer` no tienen consumidor hasta R2 | El aviso queda registrado en la tabla y en el outbox; el consumidor de NOT puede procesar los pendientes al llegar. |
| Un propietario de cliente se asigna `PLAT_ADMIN_TENANTS` | No le sirve: el orquestador exige el tenant operador. Lo cubre un criterio. |

## Lo que **no** está en este spec

- Asistente de alta en la consola y prueba cronometrada (spec 17).
- Padrón RUC (TR-IDN, R2) y correos de aviso o suspensión (TR-NOT, R2).
- Roles predefinidos por producto y series por producto (spec 22 y siguientes).
- Límites en el alta, renovación, pago y reactivación automática.
- Listado de tenants para el operador (spec 17).
- Clave de idempotencia por cabecera.
- Prod (plan de migración a producción).

Cada uno entra en su propio spec cuando su sprint lo pida.
