# SPEC 06 — Autorización: roles, perfiles, asignaciones, manifiesto y permisos efectivos

> **Status:** Aprobado
> **Depends on:** SPEC 03, SPEC 04, SPEC 05
> **Date:** 2026-10-21
> **Objective:** Construir en `libs/plataforma/seguridad` el dominio de autorización (manifiesto, roles, perfiles y asignaciones con alcance y vigencia) y su evaluación por petición (permisos efectivos y menú con caché Redis versionada, `@Permiso`, `X-Sucursal-Id` y `GET /v1/seg/mi-contexto`), con aislamiento entre tenants probado.

## Por qué existe este spec

Junta las filas 06 (S-01) y 07 (S-02, S-03, S-05) de `docs/roadmap-specs.md` en un solo spec. Decisión del usuario: no importa pasar el tope de 10 h. Las historias suman 16 h (6 + 5 + 3 + 2); con `mi-contexto`, la versión de seguridad y el CLI del manifiesto, unas 18-20 h. El roadmap no se toca desde este spec: es control propio del usuario.

Contexto de apoyo: `docs/spec-context/06-seg-autorizacion.md`. Su sección 9 (ambigüedades y preguntas) queda resuelta por las Decisiones de este spec.

El spec 04 dejó el esquema `seg` con RLS y sin funciones de permisos. El spec 05 dejó la lib `seguridad` con `AutenticacionGuard`, `MfaGuard`, `@Publico`, `@RequiereMfa` y `GET /v1/seg/sesion`. Falta todo lo que decide **qué** puede hacer un usuario autenticado.

RF cubiertos:

- **TR-RF-008** manifiesto funcional (sin parámetros, indicadores ni reportes aplicados; ver Alcance).
- **TR-RF-011** roles propios del tenant.
- **TR-RF-012** perfiles de puesto.
- **TR-RF-013** asignar rol o perfil con alcance y vigencia.
- **TR-RF-015** permisos efectivos y menú.
- **TR-RF-016** contexto de empresa y sucursal, solo el contrato back. El selector es del spec 15.

Criterios del SRS: TR-CA-022 a 024, 031 a 038 y 041 a 043 se cierran aquí. TR-CA-044 a 046 se cierran en su parte back (la respuesta de `mi-contexto`); la pantalla es del spec 15.

Reglas: **TR-RN-006** (sin suscripción vigente no hay permisos de producto), **TR-RN-007** (formato y cobertura por alcance), **TR-RN-008** (rol o perfil, alcance coherente, vigencia), **TR-RN-009** (lo sensible exige MFA de 15 min como máximo; se reutiliza `mfaVigente` del spec 05).

RNF propios:

- **TR-RNF-010**: doble barrera (contexto de aplicación y RLS) y 0 accesos cruzados en pruebas.
- **TR-RNF-101**: caché Redis, p95 < 20 ms con caché caliente, invalidación ≤ 5 s.
- **TR-RNF-119** y **024**: API pública por `index.ts`, lint de límites en verde.
- **TR-RNF-120**: manifiesto idempotente (0 cambios al repetir) en menos de 30 s.

RNF heredados: 001, 008, 012, 013 (solo `seg.evento_seguridad`; TR-AUD es el spec 20), 025, 026, 106.

Historias del backlog: **S-01**, **S-02**, **S-03** y **S-05**.

## Alcance

**In:**

- **Migración** `db/01b_seg_autorizacion.sql` con su inverso `db/rollback/01b_seg_autorizacion.sql` y prueba `db/tests/01b_seg_autorizacion.test.sql`. Corre después de `01b_seg.sql` por orden de nombre (`.` < `_`). Contiene:
  - Columna `version` en `rol`, `perfil` y `asignacion`.
  - Columna `obsoleto` en `modulo`, `opcion`, `permiso` y `rol`.
  - Columna `seg.membresia.ultima_sucursal_id`.
  - Tablas `seg.manifiesto_aplicado` y `seg.version_seguridad`, y los triggers que suben la versión.
  - Funciones `seg.permisos_efectivos`, `seg.menu_usuario` y `seg.sucursales_accesibles`.
- **Dominio** en `libs/plataforma/seguridad/src/domain/`: `codigo-permiso.ts`, `alcance.ts`, `manifiesto.ts`, `rol.ts`, `perfil.ts`, `asignacion.ts`, `eventos.ts` y errores nuevos en `errores.ts`.
- **Casos de uso** en `application/`: `AplicarManifiesto`, `CrearRol`, `CopiarRol`, `CambiarPermisosRol`, `InactivarRol`, `CrearPerfil`, `CambiarRolesPerfil`, `OtorgarAsignacion`, `ResolverPermisos` y `ObtenerMiContexto`. Cada uno con `UnitOfWork`, `TenantContext` y outbox, como `org`.
- **Puertos** en `application/ports/` y sus adaptadores en `infrastructure/typeorm/` y `infrastructure/redis/`.
- **Interfaz** en `interface/`:
  - `@Permiso(codigo)` y `PermisoGuard` global, después de `MfaGuard`.
  - `ContextoTenantInterceptor`, que corre el handler dentro de `TenantContext.run` con el tenant del token y la sucursal de `X-Sucursal-Id`.
  - `mi-contexto.controller.ts` con `GET /v1/seg/mi-contexto`. Reemplaza a `GET /v1/seg/sesion`, que se elimina.
- **Manifiesto PLAT** `libs/plataforma/seguridad/manifiesto/plat.manifiesto.json` con los permisos de este spec.
- **CLI** `apps/api/src/cli/aplicar-manifiesto.ts` y script `pnpm manifiesto:aplicar <archivo>`.
- **Dependencia** `ioredis` `6.0.0`.
- **`apps/api`**: `REDIS_URL` en `config/env.ts` (url, requerida) y cableado de Redis en `SeguridadModule.register`.
- **Pruebas**: dominio (Jest), integración con PostgreSQL 16 y Redis 7 reales (docker-compose y CI), aislamiento entre dos tenants en SQL y por API, invalidación ≤ 5 s y latencia p95.

**Out of scope (para otros specs):**

- Controladores de administración `/v1/seg/roles`, `/perfiles` y `/asignaciones` (spec 16). Aquí los casos de uso se prueban directo.
- Revocar o editar asignaciones, `ASIGNACION_REVOCADA`, invitar, aceptar y suspender membresías (spec 08, TR-RF-014).
- Selector de sucursal, menú y `*siPermiso` en Angular (specs 13 y 15).
- Aplicar parámetros, indicadores y reportes del manifiesto (CFG spec 09; REP en R3). Aquí solo se validan por esquema.
- Publicar `manifiesto.aplicado` en el outbox. `sync.outbox.tenant_id` es `NOT NULL` y el manifiesto es global (ver Decisiones).
- Handler de invalidación por evento del outbox (cuando exista el relay, spec 11). No hace falta: la versión de seguridad invalida al commit.
- Auditoría TR-AUD (spec 20). Aquí solo `seg.evento_seguridad`.
- Prueba k6 contra staging (spec 21).
- Endpoint de plataforma para aplicar el manifiesto y token de servicio del pipeline.
- Proyecto prod (plan de migración a producción).

## Base de código reutilizada

Fuente: `docs/Plataforma_Plan_Mermaid_Estructura_Codigo/Plataforma_Plan/codigo/`.

**Se conserva:**

- `application/resolver-permisos.use-case.ts`: chequeo de `sucursalesAccesibles` antes de resolver y TTL 60 s.
- `application/ports/permisos.port.ts`: los puertos `PermisosRepositorio` y `CachePermisos` con sus tokens DI.
- `interface/permiso.guard.ts`: orden de chequeos (`SIN_TENANT`, `SIN_SUCURSAL` con regex UUID, `SUCURSAL_NO_ASIGNADA`, `SIN_PERMISO`) y `req.contexto`.
- `infrastructure/cache-permisos.redis.ts`: el SET índice `perm-idx:{tenant}` para borrar sin `KEYS` ni `SCAN`.
- `infrastructure/cache-permisos.memoria.ts`: doble de pruebas.
- `infrastructure/permisos.sql.repositorio.ts`: llamadas a las funciones SQL.
- `db/01b_seg.sql` (base de las funciones): cobertura de alcances, filtro por suscripción `PRUEBA`/`ACTIVA` con `vigente_hasta`, PLAT sin suscripción y vigencia inclusiva con `BETWEEN` (TR-CA-043).
- `test/seguridad.integracion.spec.ts`: casos 11 a 17 (sucursal, permiso, tenant, revocación), adaptados a Jest.

**Cambia:**

- La clave de caché pasa a `perm:{tenant}:{vt}.{vc}:{usuario}:{sucursal}:{unidad|-}`. `vt` es la versión de seguridad del tenant y `vc` la del catálogo. Lleva la unidad y guarda permisos **y** menú.
- La invalidación deja de depender de llamar `invalidarTenant`. Un cambio sube `vt` o `vc` en la misma transacción y la clave vieja deja de leerse. `perm-idx` se conserva para limpiar el tenant.
- `PermisoGuard` deja la MFA a `mfaVigente` del spec 05. Si el permiso es sensible y el MFA no está vigente, responde 401 `MFA_REQUERIDA` (step-up), no 403.
- El 403 `SIN_PERMISO` trae el código del permiso en un campo propio (`permiso`), no solo en el mensaje.
- `ACCESO_DENEGADO` se persiste en `seg.evento_seguridad`. En el código base el hook `registrar` era opcional y nadie lo pasaba.
- El repositorio SQL corre dentro de `UnitOfWork` (fija `app.tenant_id`) y no con un `EjecutorSql` genérico.
- Las funciones SQL pasan a `SECURITY INVOKER` con `search_path = ''` y quedan sujetas a la RLS.
  - Excluyen lo `obsoleto`, los roles inactivos, las membresías no `ACTIVO` y los usuarios no `ACTIVO`.
  - En alcance `UNIDAD` comprueban que la unidad pertenezca a la sucursal pedida.
- `decoradores.ts`: `@Permiso(codigo)` valida el formato `producto.recurso.accion` al decorar. El comentario `plat.rol.editar` desaparece; manda el SRS.
- `TenantContext` por petición desde el token (pendiente del spec 05).

**No existe en el código base** y se escribe desde cero: agregados `rol`, `perfil`, `asignacion` y `manifiesto`, todos los casos de uso salvo `ResolverPermisos`, repositorios TypeORM, eventos, `mi-contexto`, versión de seguridad, CLI y pruebas de aislamiento.

## Modelo de datos

### Migración `db/01b_seg_autorizacion.sql`

```sql
ALTER TABLE seg.rol        ADD COLUMN version bigint NOT NULL DEFAULT 0,
                           ADD COLUMN obsoleto boolean NOT NULL DEFAULT false;
ALTER TABLE seg.perfil     ADD COLUMN version bigint NOT NULL DEFAULT 0;
ALTER TABLE seg.asignacion ADD COLUMN version bigint NOT NULL DEFAULT 0;
ALTER TABLE seg.modulo     ADD COLUMN obsoleto boolean NOT NULL DEFAULT false;
ALTER TABLE seg.opcion     ADD COLUMN obsoleto boolean NOT NULL DEFAULT false;
ALTER TABLE seg.permiso    ADD COLUMN obsoleto boolean NOT NULL DEFAULT false;

ALTER TABLE seg.membresia ADD COLUMN ultima_sucursal_id uuid NULL,
  ADD FOREIGN KEY (tenant_id, ultima_sucursal_id) REFERENCES org.sucursal (tenant_id, id);

-- Historial de manifiestos (global, sin RLS). La versión vigente es la fila más reciente por producto.
CREATE TABLE seg.manifiesto_aplicado (
  id              bigserial   PRIMARY KEY,
  producto_codigo varchar(5)  NOT NULL REFERENCES seg.producto (codigo),
  version         varchar(20) NOT NULL,          -- semver
  hash            char(64)    NOT NULL,          -- sha256 del JSON canónico
  cambios         jsonb       NOT NULL,          -- { insertados, actualizados, obsoletos } por tipo
  aplicado_en     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (producto_codigo, version)
);

-- Versión de seguridad del tenant (TR-RNF-101). La suben triggers; nadie la escribe a mano.
CREATE TABLE seg.version_seguridad (
  tenant_id   uuid        PRIMARY KEY REFERENCES org.tenant (id),
  version     bigint      NOT NULL DEFAULT 1,
  cambiado_en timestamptz NOT NULL DEFAULT now()
);
-- RLS ENABLE + FORCE; SELECT con tenant_id = app.tenant_id; sin políticas de escritura.
```

**Triggers de versión** (`AFTER INSERT OR UPDATE OR DELETE ... FOR EACH ROW`, función `seg.subir_version_seguridad()` `SECURITY DEFINER` con `search_path = ''`):

| Tabla | Cuándo sube | Tenant |
| --- | --- | --- |
| `seg.rol` | cambio de `activo` u `obsoleto` | `tenant_id` del rol; si es nulo (predefinido), no sube (lo cubre `vc`) |
| `seg.rol_permiso` | alta o baja | tenant del rol; si es predefinido, no sube |
| `seg.perfil_rol` | alta o baja | tenant del perfil |
| `seg.asignacion` | alta o cambio | `tenant_id` |
| `seg.membresia` | cambio de `estado` o `hasta` (no de `ultima_sucursal_id`) | `tenant_id` |
| `org.suscripcion` | alta o cambio de `estado` o `vigente_hasta` | `tenant_id` |

La función hace `INSERT ... ON CONFLICT (tenant_id) DO UPDATE SET version = version + 1, cambiado_en = now()`.

La **versión de catálogo** `vc` es `max(seg.manifiesto_aplicado.id)`, o `0` si no hay filas. Cubre los roles predefinidos y el catálogo global.

### Funciones SQL (`SECURITY INVOKER`, `SET search_path = ''`, `STABLE`)

```sql
seg.permisos_efectivos(p_usuario uuid, p_tenant uuid, p_sucursal uuid, p_unidad uuid DEFAULT NULL)
  RETURNS TABLE (permiso_codigo varchar)
seg.menu_usuario(p_usuario uuid, p_tenant uuid, p_sucursal uuid, p_unidad uuid DEFAULT NULL)
  RETURNS TABLE (opcion_id uuid, padre_id uuid, codigo varchar, nombre varchar, ruta varchar, icono varchar, orden smallint)
seg.sucursales_accesibles(p_usuario uuid, p_tenant uuid)
  RETURNS TABLE (sucursal_id uuid, empresa_id uuid, codigo varchar, nombre varchar)
seg.versiones_seguridad(p_tenant uuid)
  RETURNS TABLE (vt bigint, vc bigint)
```

Reglas comunes:

- Si `p_tenant` no es `app.tenant_id`, devuelven 0 filas. Es la primera barrera dentro de la base; la RLS es la segunda.
- Solo cuentan la membresía `ACTIVO` con `hasta` nulo o futuro, el usuario `ACTIVO`, el rol `activo` y no `obsoleto`, y el permiso no `obsoleto`.
- La asignación cuenta con `current_date BETWEEN vigente_desde AND COALESCE(vigente_hasta, 'infinity')` (TR-CA-043).
- Los permisos de productos sin suscripción `PRUEBA` o `ACTIVA` vigente quedan fuera. Los `PLAT` no dependen de suscripción (TR-RN-006, TR-RN-007).
- Cobertura por alcance (TR-RN-007):
  - `TENANT`: cubre todo.
  - `EMPRESA`: cubre las sucursales de esa empresa.
  - `SUCURSAL`: cubre esa sucursal y sus unidades.
  - `UNIDAD`: solo si `p_unidad` es esa unidad y la unidad pertenece a `p_sucursal`.
- `menu_usuario` devuelve las opciones no obsoletas cuyo conjunto de permisos requeridos (`opcion_permiso`) tiene al menos uno en los permisos efectivos. Agrega sus ancestros (`padre_id`).

### Dominio

```ts
// domain/alcance.ts
export type Alcance = 'TENANT' | 'EMPRESA' | 'SUCURSAL' | 'UNIDAD';
export const RANGO_ALCANCE: Record<Alcance, number> = { TENANT: 4, EMPRESA: 3, SUCURSAL: 2, UNIDAD: 1 };

/** Ubicación ya resuelta contra org (la sucursal trae su empresa; la unidad, su sucursal y empresa). */
export interface Ambito { alcance: Alcance; empresaId: string | null; sucursalId: string | null; unidadId: string | null }

/** true si `otorgante` tiene rango >= y su ámbito contiene al `destino` (TR-RF-013). */
export function cubre(otorgante: Ambito, destino: Ambito): boolean;

// domain/codigo-permiso.ts
// ^[a-z]{2,5}\.[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$ y el prefijo = lower(producto_codigo).
export class CodigoPermiso { static de(valor: string, productoCodigo?: string): CodigoPermiso }
```

Agregados (heredan de `AggregateRoot` del kernel, con `version`):

| Agregado | Operaciones | Reglas |
| --- | --- | --- |
| `Rol` | `crear`, `copiarDe(predefinido, codigo, nombre)`, `cambiarPermisos(codigos, catalogo)`, `inactivar()` | Código de 3 a 50 caracteres y nombre de 3 a 100. Permisos del mismo producto y no obsoletos. Un predefinido (`tenantId = null`) no se edita. |
| `Perfil` | `crear(codigo, nombre, roles)`, `cambiarRoles(roles)` | Mismas longitudes. Roles activos, no obsoletos, de productos contratados (TR-CA-035). Al menos un rol. |
| `Asignacion` | `otorgar(datos)` | TR-RN-008: rol o perfil, no ambos ni ninguno; alcance coherente; `vigenteHasta >= vigenteDesde`. El alcance no es menor que el `alcance_minimo` de ningún permiso. |
| `Manifiesto` | `Manifiesto.leer(json)`, `diferencias(actual): CambiosManifiesto` | Ver "Manifiesto". |

Errores de dominio nuevos (heredan de `DomainError`):

| Clase | `code` | Mensaje (SRS) |
| --- | --- | --- |
| `RolPredefinidoNoEditableError` | `ROL_PREDEFINIDO_NO_EDITABLE` | «Los roles predefinidos no se editan; cree una copia» |
| `RolOPerfilError` | `ASIGNACION_ROL_O_PERFIL` | «Seleccione un rol o un perfil, no ambos» |
| `VigenciaInvalidaError` | `VIGENCIA_INVALIDA` | «La vigencia hasta no puede ser anterior a la vigencia desde» |
| `AlcanceIncoherenteError` | `ALCANCE_INCOHERENTE` | El alcance no corresponde a la empresa, sucursal o unidad indicadas |
| `AlcanceInsuficienteError(permisos)` | `ALCANCE_INSUFICIENTE` | Alcance menor que el `alcance_minimo` de los permisos listados |
| `OtorganteSinAlcanceError` | `OTORGANTE_SIN_ALCANCE` | El otorgante no tiene un alcance igual o mayor sobre el destino |
| `PermisoAjenoAlProductoError(codigos)` | `PERMISO_AJENO_AL_PRODUCTO` | Permisos de otro producto u obsoletos |
| `ProductoNoContratadoError(producto)` | `PRODUCTO_NO_CONTRATADO` | Sin suscripción vigente al producto |
| `MembresiaNoAsignableError` | `MEMBRESIA_NO_ASIGNABLE` | La membresía no está `ACTIVO` ni `INVITADO` |
| `ManifiestoInvalidoError(detalles)` | `MANIFIESTO_INVALIDO` | Lista cada error con su ruta (p. ej. `permisos[3].codigo: rest-caja-cerrar`) |

### Manifiesto (TR-RF-008)

```json
{
  "producto_codigo": "REST",
  "nombre": "Restaurante",
  "version": "1.5.0",
  "modulos":   [{ "codigo": "caja", "nombre": "Caja", "orden": 1 }],
  "opciones":  [{ "codigo": "rest.caja", "modulo": "caja", "padre": null, "nombre": "Caja",
                  "ruta": "/caja", "icono": "point_of_sale", "orden": 1, "permisos": ["rest.caja.abrir"] }],
  "permisos":  [{ "codigo": "rest.propina.configurar", "descripcion": "...", "alcance_minimo": "SUCURSAL", "sensible": false }],
  "roles_predefinidos": [{ "codigo": "REST_MOZO", "nombre": "Mozo", "permisos": ["rest.pedido.tomar"] }],
  "parametros": [], "indicadores": [], "reportes": []
}
```

Reglas de `AplicarManifiesto`:

- **Validación completa antes de escribir.** Esquema JSON, `version` semver, códigos con `CodigoPermiso` y prefijo del producto, referencias internas existentes (módulo de la opción, padre, permisos de opciones y roles) y códigos únicos. Un solo error rechaza todo el manifiesto (TR-CA-024).
- `parametros`, `indicadores` y `reportes`: se valida que sean arreglos de objetos con `codigo`. No se aplican.
- **Versión.**
  - Misma versión y mismo `hash`: 0 cambios y nada se escribe (TR-CA-023).
  - Misma versión con otro `hash`: `MANIFIESTO_VERSION_ALTERADA`.
  - Versión menor que la vigente: `MANIFIESTO_VERSION_ANTERIOR`.
- **Diferencias.**
  - Inserta lo nuevo y actualiza lo cambiado. Lo que estaba en la versión anterior y ya no viene queda `obsoleto = true`.
  - Lo que vuelve a aparecer deja de estar obsoleto.
  - Los roles predefinidos (`tenant_id` nulo, `editable = false`) reemplazan su `rol_permiso`.
- Todo en una transacción. Registra la fila de `seg.manifiesto_aplicado` (sube `vc`).
- Devuelve `{ version, cambios }`.

### Puertos (`application/ports/`)

```ts
RepositorioRoles        { buscar(id), buscarPorCodigo(codigo), guardar(rol), contarMembresiasAfectadas(rolId) }
RepositorioPerfiles     { buscar(id), guardar(perfil) }
RepositorioAsignaciones { guardar(a), vigentesDe(membresiaId, hoy): Asignacion[] }
CatalogoPermisos        { permisos(codigos): PermisoCatalogo[]; sensible(codigo): boolean }
ProductosContratados    { vigentes(): ProductoCodigo[] }          // lee org.suscripcion en la misma UoW
MembresiasLectura       { buscar(membresiaId), deUsuario(usuarioId) } // estado, esPropietario, ultimaSucursalId
UbicacionesOrg          { resolver(ambitoParcial): Ambito }      // completa empresa/sucursal desde org
RepositorioManifiestos  { vigente(producto), catalogoActual(producto), aplicar(cambios, registro) }
BitacoraSeguridad       { registrar(tipo: 'ASIGNACION_OTORGADA' | 'ACCESO_DENEGADO', usuarioId, detalle) }
PermisosRepositorio     { versiones(tenant), efectivos(...), menu(...), sucursalesAccesibles(usuario, tenant) }
CachePermisos           { leer(clave), guardar(clave, valor, ttlSeg), invalidarTenant(tenant) }
PreferenciaSucursal     { recordar(membresiaId, sucursalId) }   // ultima_sucursal_id, sin esperar
```

Los adaptadores van en `infrastructure/typeorm/` y en `infrastructure/redis/cache-permisos.redis.ts`. La caché en memoria se usa en las pruebas de dominio y de aplicación.

### Casos de uso: puntos no obvios

- `OtorgarAsignacion(comando)`: el comando trae `otorgante: { usuarioId, mfaVigente }`. Orden de chequeos:
  1. La membresía destino está `ACTIVO` o `INVITADO`.
  2. `Asignacion.otorgar` valida TR-RN-008.
  3. Se resuelve el `Ambito` con `UbicacionesOrg`.
  4. Si el rol (o algún rol del perfil) tiene un permiso sensible y `!mfaVigente`, lanza `MfaRequeridaError` (TR-RN-009).
  5. El propietario del tenant (`es_propietario`) pasa. Los demás necesitan una asignación vigente propia con `cubre(otorgante, destino)`.
  6. Guarda, inserta `ASIGNACION_OTORGADA` en `seg.evento_seguridad` y publica `asignacion.otorgada`.
- `InactivarRol({ rolId, confirmado })`:
  - Sin `confirmado`, no cambia nada y devuelve `{ requiereConfirmacion: true, afectados: N }` (membresías distintas con asignación vigente al rol o a un perfil que lo contiene).
  - Con `confirmado: true`, inactiva y devuelve `{ requiereConfirmacion: false, afectados: N }` (TR-CA-033).
- `CrearRol` y `CopiarRol` exigen que el producto esté en `ProductosContratados.vigentes()`, salvo `PLAT`.
- `ResolverPermisos({ usuarioId, tenantId, sucursalId, unidadId? })`:
  1. Lee `vt` y `vc` (una consulta por PK).
  2. Arma la clave e intenta la caché.
  3. Si no hay acierto, comprueba `sucursalesAccesibles`, llama `efectivos` y `menu`, y guarda con TTL 60 s.
  4. Si Redis falla, resuelve desde la base y escribe un log `warn`. No falla abierto.
- Ningún caso de uso tiene controlador salvo `ObtenerMiContexto`.

### Eventos (outbox, `schema_version = 1`, esquemas en `infrastructure/event-schemas.ts`)

| `event_type` | `aggregate_type` | Payload |
| --- | --- | --- |
| `rol.creado` | `rol` | `producto_codigo`, `codigo`, `nombre`, `copiado_de` (uuid o null), `permisos[]` |
| `rol.permisos_cambiados` | `rol` | `agregados[]`, `quitados[]` |
| `rol.inactivado` | `rol` | `afectados` (entero) |
| `perfil.creado` | `perfil` | `codigo`, `nombre`, `roles[]` |
| `perfil.roles_cambiados` | `perfil` | `agregados[]`, `quitados[]` |
| `asignacion.otorgada` | `asignacion` | `membresia_id`, `rol_id`, `perfil_id`, `alcance`, `empresa_id`, `sucursal_id`, `unidad_id`, `vigente_desde`, `vigente_hasta`, `otorgado_por` |

Bitácora `seg.evento_seguridad` (tipos del SQL):

- `ASIGNACION_OTORGADA`, en la transacción del caso de uso.
- `ACCESO_DENEGADO`, desde `PermisoGuard` en una transacción propia con `app.tenant_id`. Detalle: `{ permiso, ruta, metodo, sucursal_id }`. Si falla, la respuesta sigue siendo 403 y queda un log `warn`.

### Permisos (`plat.manifiesto.json` y constantes `PERMISOS_SEG` en `index.ts`)

| Código | `alcance_minimo` | `sensible` | Uso en este spec |
| --- | --- | --- | --- |
| `plat.manifiesto.aplicar` | `TENANT` | no | Declarado. El CLI usa la conexión de migración. |
| `plat.rol.gestionar` | `TENANT` | no | Constante para el spec 16 |
| `plat.perfil.gestionar` | `TENANT` | no | Constante para el spec 16 |
| `plat.asignacion.otorgar` | `SUCURSAL` | **sí** | Constante para el spec 16. La MFA la exige también el caso de uso. |
| `plat.permiso.consultar` | `TENANT` | no | Constante. El puerto `ResolverPermisos` se exporta para los productos. |
| `plat.sesion.contexto` | `UNIDAD` | no | Declarado. `mi-contexto` no lo exige (ver Decisiones). |

### HTTP

`PermisoGuard` (global, tercero tras `AutenticacionGuard` y `MfaGuard`). Solo actúa en rutas con `@Permiso`:

| Caso | Estado | Cuerpo |
| --- | --- | --- |
| Token sin `tenant_id` | 403 | `{ "codigo": "SIN_TENANT" }` |
| `X-Sucursal-Id` ausente o no UUID | 400 | `{ "codigo": "SIN_SUCURSAL" }` |
| `X-Unidad-Id` presente y no UUID | 400 | `{ "codigo": "UNIDAD_INVALIDA" }` |
| Sucursal fuera de `sucursales_accesibles` | 403 | `{ "codigo": "SUCURSAL_NO_ASIGNADA" }` |
| Permiso sensible sin MFA vigente | 401 | `{ "codigo": "MFA_REQUERIDA", "max_edad": 900 }`, con el header step-up del spec 05 |
| Permiso faltante | 403 | `{ "codigo": "SIN_PERMISO", "permiso": "rest.caja.cerrar" }` + `ACCESO_DENEGADO` |

`ContextoTenantInterceptor` corre el handler en `TenantContext.run({ tenantId, branchId })` en toda ruta autenticada con tenant. `req.contexto` lleva `{ tenantId, sucursalId, unidadId, permisos }`.

`GET /v1/seg/mi-contexto`:

- Requiere token con tenant. `X-Sucursal-Id` es opcional.
- Si viene `X-Sucursal-Id` y es accesible, es la actual y se recuerda.
- Si no viene, la actual es la única accesible; o, si hay varias, `ultima_sucursal_id` cuando sigue siendo accesible.
- Si no hay una sucursal actual, `permisos` y `menu` vienen vacíos.

```json
{
  "usuario_id": "uuid", "tenant_id": "uuid", "tipo_usuario": "EXTERNO",
  "aal": "aal1", "mfa_vigente": false, "mfa_en": null,
  "sucursales": [{ "id": "uuid", "empresa_id": "uuid", "codigo": "MIR", "nombre": "Miraflores" }],
  "sucursal_actual": "uuid | null",
  "requiere_seleccion": false,
  "sin_accesos": false,
  "permisos": ["rest.caja.abrir"],
  "menu": [{ "codigo": "rest.caja", "padre": null, "nombre": "Caja", "ruta": "/caja", "icono": "point_of_sale", "orden": 1 }]
}
```

- `sin_accesos = true` si no hay sucursales accesibles (TR-CA-046).
- `requiere_seleccion = true` si hay varias y ninguna se pudo elegir.
- Sin `tenant_id` en el token responde 403 `SIN_TENANT`.
- OpenAPI con `@ApiBearerAuth()`, DTO de respuesta y los headers documentados.

### CLI del manifiesto

`pnpm manifiesto:aplicar <archivo.json>` ejecuta `node --env-file-if-exists=.env dist/apps/api/cli/aplicar-manifiesto.js <archivo>`:

- Usa `DATABASE_MIGRATION_URL` si existe y, si no, `DATABASE_URL`. Escribe catálogo global y roles predefinidos, que la RLS de la aplicación no permite.
- Imprime `{ producto, version, cambios }` en JSON.
- Sale con código 0 si aplica o no hay cambios, y con 1 si el manifiesto es inválido (el despliegue se detiene).

## Plan de implementación

1. **Migración y funciones SQL.**
   - `db/01b_seg_autorizacion.sql`, su inverso y `db/tests/01b_seg_autorizacion.test.sql`. La prueba usa el rol sin `BYPASSRLS` `seg_test_app` del spec 04.
   - Casos: columnas nuevas; triggers de versión (cada tabla de la tabla sube `vt`; `ultima_sucursal_id` no la sube; rol predefinido no la sube); cobertura por alcance (TR-CA-041); suscripción vencida (TR-CA-042); vigencia que vence hoy (TR-CA-043); unidad de otra sucursal; obsoletos fuera; membresía `INVITADO` sin permisos; `p_tenant` distinto de `app.tenant_id` da 0 filas; `menu_usuario` con ancestros; `sucursales_accesibles`.
   - Verificar: `pnpm db:up && pnpm db:down && pnpm db:up` y `pnpm nx test migrar`.
2. **Dominio: alcance, código de permiso y asignación.**
   - `alcance.ts`, `codigo-permiso.ts`, `asignacion.ts` y errores, con pruebas unitarias: `cubre` en las 16 combinaciones de alcance, ámbito ajeno, formato (`rest-caja-cerrar` falla), TR-CA-037, TR-CA-038, `alcance_minimo`.
   - Verificar: `pnpm nx test seguridad`.
3. **Dominio: rol y perfil.**
   - `rol.ts`, `perfil.ts` y `eventos.ts`, con pruebas: TR-CA-031 (copia sin `rest.pedido.anular`), TR-CA-032 (mensaje exacto), permiso de otro producto, TR-CA-034 y TR-CA-035 con productos contratados dados, eventos emitidos y `version`.
   - Verificar: `pnpm nx test seguridad`.
4. **Dominio: manifiesto.**
   - `manifiesto.ts` con lectura, validación y `diferencias`. Pruebas: TR-CA-022 (1.4.0 a 1.5.0 agrega `rest.propina.configurar`), TR-CA-023 (0 cambios), TR-CA-024 (rechazo completo con la ruta del error), versión alterada, versión anterior, obsoletos y reaparición.
   - Verificar: `pnpm nx test seguridad` y cobertura de `src/domain/**` ≥ 70 %.
5. **Repositorios y casos de uso de rol y perfil.**
   - Adaptadores TypeORM de roles, perfiles, catálogo, productos contratados y membresías, con el patrón de `repositorio-base.ts` de `org` (bloqueo optimista por `version`).
   - `CrearRol`, `CopiarRol`, `CambiarPermisosRol`, `InactivarRol` (TR-CA-033 con 4 membresías), `CrearPerfil` y `CambiarRolesPerfil`, y esquemas de eventos.
   - Prueba contra PostgreSQL temporal (`test/support/temp-db.ts`): cada evento pasa su esquema y entra al outbox en la misma transacción; un error revierte todo.
   - Verificar: `pnpm nx test seguridad`.
6. **Asignaciones.**
   - Adaptadores de asignaciones, `UbicacionesOrg` y `BitacoraSeguridad`, y `OtorgarAsignacion`.
   - Pruebas: TR-CA-036 (Cajero en `CAJA-02` del 15/10 al 31/10, con reloj fijo); otorgante propietario; otorgante con `SUCURSAL` que intenta `EMPRESA` (falla); rol sensible sin MFA (`MfaRequeridaError`); membresía `SUSPENDIDO`; `ASIGNACION_OTORGADA` en la bitácora.
   - Verificar: `pnpm nx test seguridad`.
7. **Manifiesto aplicado y CLI.**
   - `RepositorioManifiestos`, `AplicarManifiesto`, `plat.manifiesto.json`, `apps/api/src/cli/aplicar-manifiesto.ts` y el script `manifiesto:aplicar`.
   - Pruebas: aplicar dos veces (0 cambios), retirar un permiso (`obsoleto` y deja de salir en `permisos_efectivos`), sube `vc`, manifiesto inválido sale con código 1 y no escribe nada, menos de 30 s con un manifiesto de 200 permisos.
   - Verificar: `pnpm nx test seguridad` y `pnpm manifiesto:aplicar libs/plataforma/seguridad/manifiesto/plat.manifiesto.json` dos veces contra la base local.
8. **Caché y `ResolverPermisos`.**
   - `ioredis@6.0.0`, `REDIS_URL` en `env.ts`, `cache-permisos.redis.ts`, `PermisosRepositorio` SQL y `ResolverPermisos`.
   - Pruebas con Redis 7 real:
     - acierto y fallo de caché;
     - unidad en la clave;
     - cambio de `rol_permiso`, asignación o `org.suscripcion` visible en la siguiente resolución (≤ 5 s, medido);
     - Redis caído resuelve desde la base;
     - 1000 resoluciones calientes con p95 < 20 ms.
   - Verificar: `pnpm nx test seguridad`.
9. **`@Permiso`, `PermisoGuard` e interceptor.**
   - `decoradores.ts` (`@Permiso`, formato validado al decorar), `permiso.guard.ts`, `contexto-tenant.interceptor.ts` y registro en `SeguridadModule` (orden Autenticación → MFA → Permiso).
   - Pruebas Nest con supertest y controladores de prueba: cada fila de la tabla HTTP; permiso sensible con MFA de 40 min da 401; `ACCESO_DENEGADO` persistido; el handler ve `TenantContext.current()` con tenant y sucursal.
   - Verificar: `pnpm nx test seguridad`.
10. **`GET /v1/seg/mi-contexto`.**
    - `ObtenerMiContexto`, `PreferenciaSucursal`, controlador y DTO. Se elimina `sesion.controller.ts` y `SesionDto` sale de `index.ts`.
    - Pruebas: TR-CA-044 (una sucursal, `requiere_seleccion = false`); TR-CA-045 (cambiar `X-Sucursal-Id` cambia menú y permisos sin otro token); TR-CA-046 (`sin_accesos = true`); última sucursal recordada; `ultima_sucursal_id` no invalida la caché.
    - Verificar: `pnpm nx run-many -t lint test build` con código 0.
11. **Aislamiento entre tenants (S-05).**
    - Prueba de integración con dos tenants, cada uno con roles, perfiles, asignaciones y la API levantada.
    - Desde el tenant A, ninguna resolución, `mi-contexto` ni `X-Sucursal-Id` de B devuelve datos de B.
    - Las funciones SQL con `p_tenant = B` y `app.tenant_id = A` dan 0 filas.
    - Los repositorios no leen filas de B con el rol `seg_test_app`.
    - Verificar: `pnpm nx test seguridad` y `nx affected` en verde en CI.
12. **Nube, dev (manual).**
    - `pnpm db:up:remoto` (aplica `01b_seg_autorizacion.sql`) y `pnpm manifiesto:aplicar` del manifiesto PLAT contra dev.
    - Prueba de humo con la API local y el usuario de prueba del spec 04: sin asignaciones, `mi-contexto` da `sin_accesos = true`. Tras insertar una asignación `TENANT` con la conexión de migración, da sus permisos y su menú. Borrar los datos de prueba.
    - Evidencia en `docs/ops/supabase-ambientes.md`.

## Criterios de aceptación

**Manifiesto (TR-RF-008, TR-RNF-120):**

- [ ] Con REST en 1.4.0, aplicar 1.5.0 con `rest.propina.configurar` deja ese permiso en `seg.permiso` y `seg.manifiesto_aplicado` registra 1.5.0 (TR-CA-022).
- [ ] Aplicar dos veces el mismo manifiesto reporta 0 cambios la segunda vez y no agrega filas (TR-CA-023).
- [ ] Un manifiesto con `rest-caja-cerrar` sale con código 1, nombra ese permiso y no escribe ninguna fila (TR-CA-024).
- [ ] Un permiso retirado queda `obsoleto = true` y deja de aparecer en `seg.permisos_efectivos`.
- [ ] La misma versión con contenido distinto se rechaza con `MANIFIESTO_VERSION_ALTERADA`.
- [ ] Un manifiesto de 200 permisos se aplica en menos de 30 s.

**Roles y perfiles (TR-RF-011, TR-RF-012):**

- [ ] Copiar `REST_MOZO` como «Mozo terraza» sin `rest.pedido.anular` deja un rol activo del tenant sin ese permiso (TR-CA-031).
- [ ] Quitar un permiso a `REST_CAJERO` falla con «Los roles predefinidos no se editan; cree una copia» (TR-CA-032).
- [ ] `InactivarRol` sin confirmar sobre un rol con 4 usuarios devuelve `afectados: 4` y no cambia nada. Confirmado, esos 4 pierden sus permisos en la siguiente resolución (TR-CA-033).
- [ ] Un perfil con `LIB_VENDEDOR` y `ECO_GESTOR_PEDIDOS` (LIB y ECO contratados), al asignarse, da permisos de ambos productos (TR-CA-034).
- [ ] Agregar `CLI_RECEPCION` a un perfil sin CLI contratado falla con `PRODUCTO_NO_CONTRATADO` (TR-CA-035).
- [ ] Un rol con un permiso de otro producto falla con `PERMISO_AJENO_AL_PRODUCTO`.

**Asignaciones (TR-RF-013, TR-RN-008, TR-RN-009):**

- [ ] Asignar «Cajero» a Luis en `CAJA-02` del 15/10/2026 al 31/10/2026 le da permisos de caja solo con `X-Unidad-Id` de `CAJA-02` y solo en ese rango (TR-CA-036).
- [ ] Rol y perfil a la vez falla con «Seleccione un rol o un perfil, no ambos» (TR-CA-037).
- [ ] `vigente_hasta` 19/10/2026 con `vigente_desde` 20/10/2026 falla con «La vigencia hasta no puede ser anterior a la vigencia desde» (TR-CA-038).
- [ ] Un otorgante con alcance `SUCURSAL` no puede otorgar alcance `EMPRESA` ni otra sucursal. El propietario del tenant sí.
- [ ] Un rol con un permiso sensible y un otorgante sin MFA vigente falla con `MfaRequeridaError`.
- [ ] Una asignación `UNIDAD` de un rol con un permiso de `alcance_minimo = SUCURSAL` falla con `ALCANCE_INSUFICIENTE`.
- [ ] Cada asignación otorgada deja `ASIGNACION_OTORGADA` en `seg.evento_seguridad` y `asignacion.otorgada` en el outbox, en la misma transacción.

**Permisos efectivos y caché (TR-RF-015, TR-RNF-101):**

- [ ] María, con «Supervisor» en alcance `EMPRESA` de «Sabores del Sur SAC», tiene sus permisos en la sucursal «Cayma» de esa empresa (TR-CA-041).
- [ ] Con GYM `VENCIDA`, un usuario con `GYM_RECEPCION` no recibe permisos `gym.*`. La ruta con `@Permiso('gym.…')` responde 403 y registra `ACCESO_DENEGADO` (TR-CA-042).
- [ ] Una asignación con `vigente_hasta` igual a hoy sigue dando permisos durante el día (TR-CA-043).
- [ ] Un cambio de `rol_permiso`, asignación, membresía u `org.suscripcion` se refleja en la siguiente resolución, a menos de 5 s del commit.
- [ ] Con caché caliente, el p95 de 1000 resoluciones es menor de 20 ms en la prueba de integración.
- [ ] Con Redis apagado, la resolución responde con datos de la base y deja un log `warn`.

**Guard y contexto (TR-RF-016, S-03):**

- [ ] Cada fila de la tabla HTTP de `PermisoGuard` responde con el estado y el cuerpo indicados.
- [ ] El 403 `SIN_PERMISO` trae el campo `permiso` y deja una fila `ACCESO_DENEGADO` con ese permiso.
- [ ] `@Permiso('rest-caja')` lanza un error al cargar el módulo.
- [ ] Un handler con `@Permiso` ve `TenantContext.current()` con el tenant del token y la sucursal del header.
- [ ] `GET /v1/seg/mi-contexto` con una sola sucursal devuelve `sucursal_actual` y `requiere_seleccion = false` (TR-CA-044, parte back).
- [ ] Con dos sucursales, cambiar `X-Sucursal-Id` cambia `permisos` y `menu` con el mismo token (TR-CA-045, parte back).
- [ ] Sin asignaciones vigentes, devuelve `sin_accesos = true` (TR-CA-046, parte back).
- [ ] La última sucursal elegida se devuelve como actual en la siguiente llamada sin header.
- [ ] `GET /v1/seg/sesion` ya no existe (404) y `mi-contexto` figura en `/v1/docs`.

**Aislamiento (TR-RNF-010, S-05):**

- [ ] Desde el tenant A, con el rol `seg_test_app`, no se lee ninguna fila de B en `rol`, `perfil`, `asignacion`, `membresia`, `version_seguridad` ni `evento_seguridad`.
- [ ] `seg.permisos_efectivos`, `menu_usuario` y `sucursales_accesibles` con `p_tenant = B` y `app.tenant_id = A` devuelven 0 filas.
- [ ] Por API, un usuario de A con `X-Sucursal-Id` de una sucursal de B recibe 403 `SUCURSAL_NO_ASIGNADA`.

**Migraciones, límites y calidad:**

- [ ] `pnpm db:up && pnpm db:down && pnpm db:up` termina con 0 y `db:down` deja `seg` como lo dejó el spec 04.
- [ ] `libs/plataforma/seguridad/src/domain` no importa `@nestjs/*`, `typeorm`, `ioredis`, `jose` ni `@supabase/*`, y la lib no importa `@vitrina/plataforma/org`.
- [ ] Cobertura de líneas de `src/domain/**` ≥ 70 %.
- [ ] `pnpm nx run-many -t lint test build` termina con código 0 y `nx affected` está en verde en CI (con Redis 7 en el job).

**Nube (verificación manual, evidencia en `docs/ops/supabase-ambientes.md`):**

- [ ] En dev, `01b_seg_autorizacion.sql` está aplicada y el manifiesto PLAT aparece en `seg.manifiesto_aplicado`.
- [ ] En dev, `mi-contexto` con un token real da `sin_accesos = true` sin asignaciones y da permisos y menú tras una asignación `TENANT`.
- [ ] Las horas reales de S-01, S-02, S-03 y S-05 quedan registradas en el plan.

## Decisiones

- **Sí:** un spec con S-01, S-02, S-03 y S-05 (filas 06 y 07 del roadmap). Decisión del usuario; pasa el tope de 10 h.
- **No:** tocar `docs/roadmap-specs.md` desde este spec. Decisión del usuario: el roadmap es control propio.
- **Sí:** sin controladores de administración; solo `GET /v1/seg/mi-contexto`. Decisión del usuario. La API de roles, perfiles y asignaciones llega con su UI (spec 16), y los casos de uso se prueban directo.
- **Sí:** `mi-contexto` sin `@Permiso`. Un usuario sin asignaciones tiene que poder recibir `sin_accesos` (TR-CA-046). Excepción a la regla 5, como `/v1/seg/sesion` en el 05. `plat.sesion.contexto` queda declarado para la consola.
- **Sí:** `mi-contexto` reemplaza y elimina `/v1/seg/sesion`. Lo fijó el spec 05.
- **Sí:** manifiesto por CLI (`pnpm manifiesto:aplicar`) con la conexión de migración. Decisión del usuario. El pipeline no necesita token de servicio. El código 1 detiene el despliegue (TR-CA-024).
- **Sí:** se aplican módulos, opciones, permisos y roles predefinidos. Parámetros, indicadores y reportes solo se validan. Decisión del usuario. Sus dueños (CFG y REP) llegan después.
- **Sí:** lo retirado queda `obsoleto`, no se borra. Decisión del usuario. Hay FK desde `rol_permiso` y `opcion_permiso`, y borrar perdería historia.
- **Sí:** misma versión con otro contenido se rechaza (hash). Protege la idempotencia: "0 cambios" solo vale si el contenido es el mismo.
- **No:** publicar `manifiesto.aplicado` en el outbox. `sync.outbox.tenant_id` es `NOT NULL` y el manifiesto es global; `seg.manifiesto_aplicado` es el registro. Se retoma si el spec 11 admite eventos de plataforma.
- **Sí:** el caso de uso valida MFA y alcance del otorgante, con el otorgante en el comando. Decisión del usuario. No depende de que exista un controlador.
- **Sí:** el propietario del tenant pasa la regla del otorgante. Sin eso, el primer administrador no podría otorgar nada.
- **Sí:** el alcance de la asignación no puede ser menor que el `alcance_minimo` de sus permisos. Cierra la brecha (h) del contexto. No tiene GWT propio en el SRS.
- **Sí:** versión de seguridad en BD (`seg.version_seguridad`) subida por triggers, más versión de catálogo, dentro de la clave Redis, con TTL 60 s de respaldo. Decisión del usuario. Invalida al commit, también ante cambios hechos fuera de la API (`org.suscripcion`), sin relay. Cuesta una consulta por PK por petición.
- **No:** borrar el índice Redis post-commit como único mecanismo. Un cambio por SQL o desde otro componente no invalidaría hasta el TTL.
- **Sí:** el TTL 60 s cubre que una asignación venza a medianoche sin ningún cambio de filas.
- **Sí:** eventos con la convención de `org` (`rol.creado`, `asignacion.otorgada`) y bitácora con los tipos del SQL (`ASIGNACION_OTORGADA`, `ACCESO_DENEGADO`). Decisión del usuario. Los nombres `seg.asignacion.*` de PL-05 y `asignacion-otorgada` de la estructura quedan descartados.
- **Sí:** suscripción leída con un puerto propio (`ProductosContratados`) y SQL sobre `org.suscripcion`. Decisión del usuario. `seguridad` no importa la lib `org`.
- **Sí:** `ultima_sucursal_id` en `seg.membresia`, escrita sin esperar y sin subir la versión. Decisión del usuario.
- **Sí:** `InactivarRol` en dos pasos (`confirmado`). Decisión del usuario. Cubre TR-CA-033 sin UI.
- **Sí:** `ioredis`. Decisión del usuario. Es el del código base y el que trae BullMQ (spec 11).
- **Sí:** latencia y invalidación medidas en una prueba Jest con Redis y PostgreSQL reales. Decisión del usuario. k6 contra staging va al spec 21.
- **No:** revocar o editar asignaciones. Decisión del usuario; es RF-014 (spec 08).
- **Sí:** funciones SQL `SECURITY INVOKER` con `search_path = ''`, que además devuelven 0 filas si `p_tenant` no es `app.tenant_id`. Decisión de redacción, a confirmar al revisar. El roadmap decía `SECURITY DEFINER`, pero con dueño `postgres` (con `BYPASSRLS` en Supabase) se perdería la RLS como segunda barrera.
- **Sí:** `PermisoGuard` exige MFA leyendo `sensible` del catálogo y responde 401 step-up. Reutiliza `mfaVigente` y la respuesta del 05. No hace falta marcar la sensibilidad en el decorador.
- **Sí:** unidad en `X-Unidad-Id`, opcional. Es simétrico con `X-Sucursal-Id` y entra en la clave de caché como `-` si falta.
- **Sí:** `ACCESO_DENEGADO` en transacción propia, con el fallo solo logueado. El 403 no depende de que la bitácora escriba.
- **Sí:** la membresía `INVITADO` puede recibir asignaciones (precondición de RF-013) pero no da permisos hasta estar `ACTIVO`.
- **Sí:** migración nueva `01b_seg_autorizacion.sql`. `01c` está reservado para `cfg` en `estructura_backend.txt`, y el orden por nombre la deja después de `01b_seg.sql`.

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| La API en dev conecta como `postgres`, con `BYPASSRLS` en Supabase, y la RLS no actúa como segunda barrera | Las funciones filtran por `p_tenant = app.tenant_id` y los repositorios por tenant. Las pruebas de aislamiento usan `seg_test_app`. Un rol propio de la aplicación sin `BYPASSRLS` queda anotado para el plan de producción. |
| Los triggers de versión hacen más lentas las escrituras masivas (manifiesto, migración CC-10) | Una fila por tenant con `ON CONFLICT`. El manifiesto no toca tablas con trigger por tenant (sube `vc`). Se mide en la prueba de 200 permisos. |
| La consulta de versiones por petición rompe el p95 de 20 ms | Es una lectura por PK en la misma conexión. Si no cumple, se cachea en memoria del proceso por 1 s, sin pasar los 5 s de invalidación. |
| Redis caído deja toda la autorización en la base | No falla abierto ni cerrado: resuelve desde la base con log `warn`. La latencia sube, pero la respuesta es correcta. |
| Un manifiesto mal escrito vuelve obsoletos permisos en uso y deja usuarios sin acceso | El CLI imprime los obsoletos antes del commit. La reaparición en la siguiente versión los reactiva. Se aplica primero en dev. |
| El spec pasa de 10 h y la revisión del diff se vuelve pesada | Los 12 pasos son commits independientes. Se puede abrir un PR por bloque (pasos 1-4, 5-7, 8-11). |
| `ioredis` 6.0.0 trae cambios de API respecto del código base (escrito para 5.x) | Se consulta la documentación con context7 al implementar el paso 8. El adaptador queda detrás del puerto `CachePermisos`. |

## Lo que **no** está en este spec

- Controladores de administración de roles, perfiles y asignaciones (spec 16).
- Revocar y editar asignaciones, ciclo de vida de membresías (spec 08).
- Selector de sucursal, menú y directivas en Angular (specs 13 y 15).
- Parámetros, indicadores y reportes del manifiesto (spec 09 y R3).
- `manifiesto.aplicado` en el outbox y handlers por evento (spec 11).
- Auditoría TR-AUD (spec 20) y k6 en staging (spec 21).
- Actualización de `docs/roadmap-specs.md` (control propio del usuario).
- Prod (plan de migración a producción).

Cada uno entra en su propio spec cuando su sprint lo pida.
