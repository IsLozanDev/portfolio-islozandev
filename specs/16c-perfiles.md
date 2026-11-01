# SPEC 16c — Perfiles de puesto: controladores, copia, techo PLAT y UI de perfiles del cliente

> **Status:** Aprobado
> **Depends on:** SPEC 06, SPEC 15, SPEC 16a, SPEC 16b
> **Date:** 2026-10-31
> **Objective:** Exponer por HTTP la lista, el detalle, la creación, la copia y el cambio de roles de los perfiles de puesto con `plat.perfil.gestionar`, cerrar la escalada de roles PLAT dentro de un perfil y construir en `libs/plataforma/admin-cliente` las pantallas de perfiles (U-04, TR-RF-012).

## Por qué existe este spec

Fila 16c de `docs/roadmap-specs.md`. Contexto: `docs/spec-context/16b-roles-perfiles.md` (secciones de TR-RF-012). Historia **U-04** (sprint 5), parte de perfiles. El 16b la sacó de su alcance por decisión del usuario.

Al pedir este spec se citó la fila del 16a (usuarios y asignaciones, `longitudMinimaMotivo`). Ese spec ya está **Implementado**: `longitudMinimaMotivo` existe en `shared/ui` y la usa `usuario-detalle`. El usuario confirmó que el 16c es el de perfiles.

Lo que hay en el código hoy (revisado al redactar):

- `CrearPerfil` y `CambiarRolesPerfil` (`application/perfil.casos-de-uso.ts`, spec 06) existen y están probados. No están registrados en `SeguridadModule` ni tienen controlador.
- `Perfil` (`domain/perfil.ts`): código 3-50, nombre 3-100, al menos un rol, roles activos, del tenant o predefinidos, y de PLAT o de un producto contratado (TR-CA-035). `cambiarRoles` de un predefinido lanza `PERFIL_PREDEFINIDO_NO_EDITABLE` con «Los perfiles predefinidos no se editan; cree una copia». No hay caso de uso para copiar.
- `seg.perfil` (`db/01b_seg.sql`) tiene `id`, `tenant_id`, `codigo`, `nombre` y `version`. No tiene `activo`: no hay inactivar perfil (B2). `ux_perfil_codigo` da `ConflictError` «Ya existe un perfil con ese código en el tenant».
- Los cambios de `seg.perfil_rol` suben `seg.version_seguridad` por trigger (06): la caché de permisos se invalida sola (TR-RNF-101).
- `entidades-lectura.ts` (16a) ya tiene `PerfilLecturaEntidad` y `PerfilRolLecturaEntidad`.
- El evento `perfil.creado` lleva `{ codigo, nombre, roles }`. `rol.creado` ya lleva `copiado_de`.
- **Hueco de escalada:** el 16b oculta y rechaza los roles PLAT que pasan el techo `PLAT_PROPIETARIO` (por ejemplo `PLAT_ADMIN_TENANTS`), pero `Perfil` los acepta. Un perfil con ese rol daría permisos de operador al asignarlo. Este spec lo cierra (decisión del usuario).
- El manifiesto PLAT `1.6.0` declara `/admin/perfiles` con `plat.perfil.gestionar` (`TENANT`, no sensible), y `PLAT_PROPIETARIO` lo tiene. En `admin-cliente` no hay ruta: hoy la opción del menú lleva a la página de no encontrado.
- En Supabase dev solo existe el manifiesto PLAT y no hay perfiles predefinidos.

RF cubierto: **TR-RF-012** gestionar perfiles de puesto (HTTP nuevo, copia y UI).

Criterios del SRS: **TR-CA-034** y **035**, cerrados por HTTP y por UI. Los propuestos de la sección 3 del contexto para perfiles («Perfil sin roles», acciones sin permiso, responsivo) entran como criterios propios.

Reglas: **TR-RN-006** (solo productos contratados), **TR-RN-007** (formato y alcance).

RNF propios:

- **TR-RNF-101**: un cambio de roles del perfil se refleja en el siguiente `mi-contexto` del afectado en ≤ 5 s.
- **TR-RNF-122**: sin colores fijos, solo tokens de `shared/ui`. Las rutas siguen exportadas en `ADMIN_CLIENTE_ROUTES`.
- **TR-RNF-018**: usable a 360, 768 y 1280 px, textos en español de Perú.
- **TR-RNF-013**: la auditoría la dan los eventos `seg.perfil.*` del outbox del 06.
- **TR-RNF-010**: las lecturas solo devuelven perfiles propios del tenant del token o predefinidos.

RNF heredados: 008, 011, 012, 024/119, 025, 026, 106.

Estimado: 5,5 h (back 2,5; front 2,5; navegador 0,5). El roadmap da 3-4; la copia (decisión del usuario) y el cierre del techo suman el resto.

## Alcance

**In:**

- **Back, `libs/plataforma/seguridad`:**
  - Cierre de la escalada: crear, copiar y cambiar roles de un perfil rechazan un rol PLAT con algún permiso fuera de `PLAT_PROPIETARIO`, con el error nuevo `ROL_FUERA_DEL_TECHO`.
  - `Perfil.copiarDe` y el caso de uso `CopiarPerfil`. `perfil.creado` suma `copiado_de`.
  - Puerto `LecturaPerfiles` (`application/ports/lectura-perfiles.ts`) con su adaptador TypeORM (`infrastructure/typeorm/lectura-perfiles.typeorm.ts`).
  - Casos de uso de lectura en `application/lecturas-perfiles.ts`: `ListarPerfiles`, `ConsultarPerfil`, `ListarRolesDisponibles`.
  - Controlador `interface/perfiles.controller.ts` con DTO y zod en `interface/perfiles.http.ts`.
  - Registro en `SeguridadModule` de `CrearPerfil`, `CambiarRolesPerfil`, `CopiarPerfil`, las lecturas y el controlador.
- **Front, `libs/plataforma/admin-cliente`:** modelo, cliente, componente `selector-roles`, cuatro páginas y sus entradas en `ADMIN_CLIENTE_ROUTES`. `form-rol` pasa a `form-codigo-nombre` para usarlo en roles y perfiles.
- **Docs:** fila 16c de `docs/roadmap-specs.md` con el alcance y las horas nuevas.
- **Pruebas:** Jest (dominio y aplicación), integración y supertest, Vitest con `TestBed` zoneless y `HttpTestingController`, y verificación en navegador con el MCP `playwright` contra Supabase dev.

**Out of scope (para otros specs):**

- Renombrar un perfil e inactivarlo (B2: no hay caso de uso y `seg.perfil` no tiene `activo`).
- Ocultar en `GET /v1/seg/asignables` (16a) los roles y perfiles que pasan el techo PLAT. Se anota como riesgo.
- Perfiles predefinidos sembrados en dev o en el manifiesto.
- Cambios al manifiesto PLAT. Se queda en `1.6.0`.
- Manifiestos LIB, ECO, CLI o REST en Supabase dev.
- Migraciones SQL. Este spec no crea tablas, columnas, funciones ni índices.
- Montaje en SazónPOS (26). E2E multinavegador y axe en CI (27).

## Base de código reutilizada

**Se conserva:**

- Spec 06: `Perfil`, `CrearPerfil`, `CambiarRolesPerfil`, `RepositorioPerfiles`, `RepositorioRoles.buscarVarios`, `ProductosContratados`, `PerfilRepositorioTypeOrm` y los errores `PERFIL_PREDEFINIDO_NO_EDITABLE` y `PRODUCTO_NO_CONTRATADO`. Evento `seg.perfil.roles_cambiados`.
- Spec 16a: `PerfilLecturaEntidad`, `PerfilRolLecturaEntidad`, `MembresiasFiltro`, `validar` y `exigirUuid`. Lib `admin-cliente`, `utils/solicitar.ts`, `models/error-admin.ts`, `src/testing/`.
- Spec 16b: `ListarRoles` (ya aplica el techo PLAT y los productos del cliente), `permisosPlatDelCliente`, `productosDelCliente`, `PRODUCTO_PLATAFORMA` y el patrón de páginas de roles (lista, nuevo, detalle, copia).
- Spec 13: `permisoGuard`, `*siPermiso`, `OMITIR_AVISO_ERROR`.
- Spec 15: `vit-tabla`, `vit-filtros`, `vit-acciones-formulario`, `mensajeValidacion`, `vit-cargando`, `vit-estado-vacio`, `erroresHttpInterceptor`.

**Cambia:**

- `libs/plataforma/seguridad/src/domain/errores.ts`: `RolFueraDelTechoError` (`ValidationError`, código `ROL_FUERA_DEL_TECHO`).
- `libs/plataforma/seguridad/src/domain/eventos.ts` y `infrastructure/event-schemas.ts`: `PerfilCreado` suma `copiado_de: string | null`, en `schema_version` 1. Nada lo consume y no hay producción.
- `libs/plataforma/seguridad/src/domain/perfil.ts`: `copiarDe`; `crear` publica `copiado_de: null`.
- `libs/plataforma/seguridad/src/application/perfil.casos-de-uso.ts`: `PerfilRepos` suma `catalogo`; helper `exigirRolesDentroDelTecho`, que usan `CrearPerfil`, `CambiarRolesPerfil` y `CopiarPerfil`; clase `CopiarPerfil`.
- `libs/plataforma/seguridad/src/seguridad.module.ts`: registra lo nuevo.
- `libs/plataforma/admin-cliente/src/lib/components/form-rol/` pasa a `components/form-codigo-nombre/`, y `utils/formulario-rol.ts` a `utils/formulario-codigo-nombre.ts` (`GrupoCodigoNombre`, `crearGrupoCodigoNombre`, `aCodigoNombre`). Las páginas de roles del 16b actualizan sus importaciones.
- `libs/plataforma/admin-cliente/src/lib/admin-cliente.routes.ts`: cuatro rutas de perfiles.
- `libs/plataforma/admin-cliente/src/lib/models/permisos-admin.ts`: `perfilGestionar: 'plat.perfil.gestionar'`.
- `libs/plataforma/admin-cliente/src/lib/models/mensajes-admin.ts`: `MENSAJES_PERFILES`.
- `docs/roadmap-specs.md`: fila 16c.

## Modelo de datos

No hay tablas nuevas. Las lecturas usan `seg.perfil`, `seg.perfil_rol`, `seg.rol` y `seg.producto`.

### Dominio

```ts
// domain/eventos.ts
interface PerfilCreado {
  codigo: string;
  nombre: string;
  copiado_de: string | null;
  roles: string[];
}

// domain/perfil.ts
class Perfil {
  /** Origen predefinido o del propio tenant; valida el conjunto final de roles con las reglas de `crear`. */
  static copiarDe(id: string, tenantId: string, origen: Perfil, datos: DatosPerfil, roles: readonly Rol[], contratados: readonly string[]): Perfil;
}

// domain/errores.ts
class RolFueraDelTechoError extends ValidationError {
  readonly code = 'ROL_FUERA_DEL_TECHO';
  // «El rol <codigo> no se puede usar en un perfil del cliente»
}
```

- `copiarDe` con un origen de otro tenant lanza `ConflictError` «Solo se copian perfiles predefinidos o del propio tenant». Publica un solo `perfil.creado` con `copiado_de: origen.id`.
- `crear` publica `copiado_de: null`.

### Aplicación

```ts
// application/perfil.casos-de-uso.ts
interface PerfilRepos {
  perfiles: RepositorioPerfiles;
  roles: RepositorioRoles;
  productos: ProductosContratados;
  catalogo: Pick<CatalogoPermisos, 'permisosDeRolPredefinido'>;
}

interface CopiarPerfilComando extends DatosPerfil {
  origenId: string;
  roles?: string[];        // sin roles, los del origen
}

/** Lanza RolFueraDelTechoError si un rol PLAT (predefinido o propio) tiene un permiso fuera de PLAT_PROPIETARIO. */
function exigirRolesDentroDelTecho(roles: readonly Rol[], permitidos: ReadonlySet<string>): void;
```

- `CopiarPerfil`: busca el origen (`NotFoundError` «El perfil no existe»), carga los roles finales (`roles ?? origen.roles`), aplica el techo y llama a `Perfil.copiarDe`. Si el origen trae un rol inactivo o de un producto ya no contratado, la copia falla salvo que `roles` lo quite.
- El techo se aplica antes de llamar al dominio en crear, copiar y cambiar roles.

### Puerto de lectura (`application/ports/lectura-perfiles.ts`)

```ts
interface PerfilListado {
  id: string; codigo: string; nombre: string;
  predefinido: boolean;                 // tenant_id IS NULL
  totalRoles: number;
  productos: string[];                  // códigos distintos de sus roles, ordenados
}

interface PerfilDetalle extends Omit<PerfilListado, 'totalRoles' | 'productos'> {
  roles: string[];                      // ids, ordenados
}

interface LecturaPerfiles {
  listar(): Promise<PerfilListado[]>;
  detalle(perfilId: string): Promise<PerfilDetalle | null>;
}
```

- `listar`: perfiles propios del tenant y predefinidos, ordenados por `nombre`. Sin paginar (D4).
- `detalle`: propio o predefinido. Uno de otro tenant da null. `ConsultarPerfil` lanza `NotFoundError` «El perfil no existe».
- Adaptador con `QueryBuilder` sobre el `EntityManager` de la transacción activa (regla 11). Sin SQL crudo. `totalRoles` y `productos` con subconsultas del `QueryBuilder`.
- `ListarRolesDisponibles` reusa `ListarRoles` del 16b (productos del cliente y techo PLAT) y se queda con los activos. Orden: producto, luego nombre. No hay método de lectura nuevo para esto.

### HTTP

Todos bajo `/v1/seg`, con `@ApiBearerAuth()`, `X-Sucursal-Id`, OpenAPI con cada código de error, `MembresiasFiltro` y errores `{ codigo, mensaje }`. Todas con `@Permiso('plat.perfil.gestionar')`. Sin paginar.

| Método y ruta | Caso de uso | Éxito |
| --- | --- | --- |
| `GET /perfiles` | `ListarPerfiles` | 200 `{ items: [{ id, codigo, nombre, predefinido, total_roles, productos }] }` |
| `GET /perfiles/roles-disponibles` | `ListarRolesDisponibles` | 200 `{ items: [{ id, codigo, nombre, producto_codigo, producto_nombre, predefinido }] }` |
| `GET /perfiles/:perfilId` | `ConsultarPerfil` | 200 `{ id, codigo, nombre, predefinido, roles: string[] }` |
| `POST /perfiles` | `CrearPerfil` | 201 `{ perfil_id }` |
| `POST /perfiles/:perfilId/copia` | `CopiarPerfil` | 201 `{ perfil_id }` |
| `PUT /perfiles/:perfilId/roles` | `CambiarRolesPerfil` | 204 |

`roles-disponibles` se declara antes de `:perfilId` en el controlador para que no la capture la ruta con parámetro.

Cuerpos (zod en `perfiles.http.ts`):

```ts
// POST /perfiles
{ codigo: string, nombre: string, roles: string[] /* uuid, máx. 100 */ }
// POST /perfiles/:perfilId/copia
{ codigo: string, nombre: string, roles?: string[] }
// PUT /perfiles/:perfilId/roles
{ roles: string[] }
```

- Zod valida forma y UUID. Longitudes de código (3-50) y nombre (3-100) y «al menos un rol» los valida el dominio con sus mensajes.

Errores por HTTP:

| `codigo` | HTTP | Cuándo |
| --- | --- | --- |
| `SOLICITUD_INVALIDA` | 400 | zod; id no UUID; código o nombre fuera de largo; perfil sin roles |
| `PRODUCTO_NO_CONTRATADO` | 400 | Un rol de un producto sin suscripción vigente (TR-CA-035) |
| `ROL_FUERA_DEL_TECHO` | 400 | Un rol PLAT con permisos fuera de `PLAT_PROPIETARIO` |
| `SIN_PERMISO` | 403 | Sin `plat.perfil.gestionar` |
| `NO_ENCONTRADO` | 404 | Perfil inexistente o de otro tenant; algún rol inexistente o de otro tenant |
| `PERFIL_PREDEFINIDO_NO_EDITABLE` | 409 | Cambiar roles de un predefinido |
| `CONFLICTO` | 409 | Código repetido; rol inactivo u obsoleto; versión cambiada |

### Front, `libs/plataforma/admin-cliente`

Archivos nuevos (sección «Estructura de libs Angular» de `CLAUDE.md`):

```
lib/models/perfil.ts                         DTO, modelo y mapeo snake_case → camelCase; RolDisponible; FormularioPerfil
lib/services/perfiles.cliente.ts             GET lista, detalle y roles-disponibles; POST crear y copia; PUT roles
lib/utils/roles-por-producto.ts              agrupa RolDisponible[] por producto, en el orden de la API
lib/components/selector-roles/               checkboxes de roles agrupados por producto
lib/pages/perfiles-lista/
lib/pages/perfil-nuevo/
lib/pages/perfil-detalle/
lib/pages/perfil-copia/
```

Rutas (en `ADMIN_CLIENTE_ROUTES`, todas con `permisoGuard('plat.perfil.gestionar')`):

| Ruta | Página |
| --- | --- |
| `/admin/perfiles` | `PerfilesListaPage` |
| `/admin/perfiles/nuevo` | `PerfilNuevoPage` |
| `/admin/perfiles/:perfilId` | `PerfilDetallePage` |
| `/admin/perfiles/:perfilId/copiar` | `PerfilCopiaPage` |

Comportamiento:

- **Lista:** `vit-filtros` con búsqueda por nombre o código y tipo (Predefinido, Propio), filtrado en cliente. `vit-tabla` sin paginar. Columnas: nombre, código, tipo, productos, roles. Botón «Nuevo perfil». La fila abre el detalle.
- **`selector-roles`:** input `roles` (`RolDisponible[]`) y `soloLectura`; `model` `seleccionados` (`Set<string>` en signal). Un grupo por producto con su nombre como título y un checkbox por rol con nombre y código. Los predefinidos llevan la etiqueta «Predefinido». Contador «N roles seleccionados». Sin roles disponibles, `vit-estado-vacio` «No hay roles activos disponibles».
- **Nuevo:** `form-codigo-nombre` y `selector-roles` con `roles-disponibles`. Éxito: toast «Perfil creado» y navegación al detalle.
- **Detalle:** cabecera con nombre, código y tipo.
  - Propio: selector editable. «Guardar» envía `PUT` con el conjunto completo y queda deshabilitado sin cambios. Acción «Copiar».
  - Predefinido: selector en solo lectura, aviso «Los perfiles predefinidos no se editan; cree una copia» y botón «Copiar».
  - Si el perfil tiene roles que ya no están en `roles-disponibles` (inactivos, de un producto vencido o fuera del techo), aviso «N roles de este perfil ya no están disponibles y se quitarán al guardar». No se marcan ni se envían.
- **Copiar:** `form-codigo-nombre` vacío y el selector precargado con los roles del origen que siguen disponibles. «Guardar» envía `POST /copia` con `roles` siempre. Éxito: navegación al detalle de la copia.
- **Errores:** las páginas piden con `OMITIR_AVISO_ERROR` los códigos que muestran en el formulario (`PRODUCTO_NO_CONTRATADO`, `ROL_FUERA_DEL_TECHO`, `PERFIL_PREDEFINIDO_NO_EDITABLE`, `CONFLICTO`, `SOLICITUD_INVALIDA`). Muestran el `mensaje` de la API como texto plano. El resto lo avisa `erroresHttpInterceptor`.
- Validación local: código 3-50 y nombre 3-100 con `mensajeValidacion`; al menos un rol marcado, con «Seleccione al menos un rol».

## Plan de implementación

1. **Techo PLAT en perfiles.**
   - `RolFueraDelTechoError`, `catalogo` en `PerfilRepos` y `exigirRolesDentroDelTecho` en `CrearPerfil` y `CambiarRolesPerfil`.
   - Pruebas Jest y de integración: crear un perfil con `PLAT_ADMIN_TENANTS` da `ROL_FUERA_DEL_TECHO`; cambiar roles para agregarlo da lo mismo; un perfil con `PLAT_PROPIETARIO` y un rol de un producto contratado pasa; las pruebas del 06 siguen pasando.
   - Verificar: `pnpm nx test seguridad`.
2. **Copia de perfil.**
   - `copiado_de` en `PerfilCreado` y su esquema; `Perfil.copiarDe`; `CopiarPerfil`.
   - Pruebas Jest: copiar un predefinido o un propio sin `roles` copia los del origen; con `roles` usa esos; origen de otro tenant da `ConflictError`; un rol inactivo del origen hace fallar la copia salvo que se quite; `perfil.creado` lleva `copiado_de`; la copia no emite `roles_cambiados`.
   - Verificar: `pnpm nx test seguridad`.
3. **`LecturaPerfiles` y casos de uso de lectura.**
   - Puerto, adaptador TypeORM y `lecturas-perfiles.ts`.
   - Pruebas de integración: `listar` trae propios y predefinidos, nada de otro tenant, `totalRoles` y `productos` correctos; `detalle` de otro tenant da null. Jest: `ListarRolesDisponibles` excluye inactivos, de productos no contratados y `PLAT_ADMIN_TENANTS`.
   - Verificar: `pnpm nx test seguridad` (PGlite en local, PostgreSQL 16 en CI).
4. **Controlador y registro.**
   - `perfiles.http.ts`, `perfiles.controller.ts` y `SeguridadModule`.
   - Pruebas supertest con LIB, ECO y CLI sembrados en la prueba (LIB y ECO contratados, CLI no): TR-CA-034 y 035; asignar el perfil de 034 (ruta del 16a) da permisos de ambos productos en `mi-contexto`; cambiar roles de un perfil asignado se ve en el siguiente `mi-contexto` del afectado; 409 al cambiar roles de un predefinido; 403 sin permiso en las seis rutas; 404 de otro tenant; 409 por código repetido; `roles-disponibles` no cae en `:perfilId`; eventos en el outbox en la misma transacción.
   - Verificar: `pnpm nx test seguridad` y las rutas en `/v1/docs`.
5. **`form-codigo-nombre`.**
   - Renombrar `form-rol` y `formulario-rol` y actualizar las páginas de roles.
   - Verificar: `pnpm nx test admin-cliente` (las pruebas del 16b siguen pasando).
6. **Modelo, cliente, `roles-por-producto` y `selector-roles`.**
   - Pruebas con `HttpTestingController`: URL, cuerpo en snake_case y mapeo. Prueba pura de la agrupación. Componente: agrupa por producto, marca y desmarca, cuenta y en `soloLectura` deshabilita.
   - Verificar: `pnpm nx test admin-cliente`.
7. **Lista y rutas.**
   - `PerfilesListaPage` y las cuatro rutas.
   - Pruebas: filtro por texto y tipo; estado vacío; sin `plat.perfil.gestionar` `/admin/perfiles` va a `/403`.
   - Verificar: `pnpm nx test admin-cliente`.
8. **Nuevo, detalle y copia.**
   - `PerfilNuevoPage`, `PerfilDetallePage` y `PerfilCopiaPage`.
   - Pruebas: sin roles no envía y muestra «Seleccione al menos un rol»; predefinido en solo lectura con aviso y «Copiar»; «Guardar» deshabilitado sin cambios; aviso de roles no disponibles con su conteo, y no se envían; copia precarga los roles del origen y envía `roles`; `CONFLICTO` y `ROL_FUERA_DEL_TECHO` muestran el mensaje sin navegar.
   - Verificar: `pnpm nx test admin-cliente`.
9. **Roadmap.**
   - Fila 16c en `docs/roadmap-specs.md`: suma la copia y el techo PLAT, depende de 16b, 5-6 h.
10. **Verificación en navegador (MCP `playwright`, Supabase dev).**
    - `nx serve api` y `nx serve plataforma-admin` contra dev, con un tenant de prueba, dos roles PLAT propios y un miembro de prueba.
    - Recorrido: abrir «Perfiles» desde el menú (ya no da no encontrado); crear «Encargado de seguridad» con los dos roles propios; comprobar que `PLAT_ADMIN_TENANTS` no aparece entre los disponibles; asignar el perfil al miembro (pantalla del 16a); quitarle un rol y ver el cambio en `mi-contexto` del miembro; copiar el perfil como «Encargado de seguridad 2» quitando un rol; guardar sin roles y ver el mensaje. Consola sin errores. Capturas de lista, detalle, nuevo y copia a 360, 768 y 1280 px.
    - Los datos de prueba se borran al final. Evidencia en `docs/ops/supabase-ambientes.md`.

## Criterios de aceptación

**API (supertest):**

- [ ] TR-CA-034: con LIB y ECO contratados, `POST /perfiles` «Encargado de tienda» con `LIB_VENDEDOR` y `ECO_GESTOR_PEDIDOS` responde 201; al asignarlo, `mi-contexto` del asignado trae permisos de ambos productos.
- [ ] TR-CA-035: sin CLI contratado, `GET /perfiles/roles-disponibles` no trae `CLI_RECEPCION`, y `POST /perfiles` o `PUT /perfiles/:id/roles` con ese rol responde 400 `PRODUCTO_NO_CONTRATADO`.
- [ ] Crear, copiar o cambiar roles con `PLAT_ADMIN_TENANTS` responde 400 `ROL_FUERA_DEL_TECHO`, y `roles-disponibles` no lo trae.
- [ ] `POST /perfiles` con `roles: []` responde 400 `SOLICITUD_INVALIDA` «El perfil debe tener al menos un rol».
- [ ] `PUT /perfiles/:id/roles` sobre un predefinido responde 409 `PERFIL_PREDEFINIDO_NO_EDITABLE` con «Los perfiles predefinidos no se editan; cree una copia».
- [ ] `POST /perfiles/:id/copia` de un predefinido o un propio sin `roles` crea un perfil propio con los roles del origen; con `roles`, con esos. `perfil.creado` lleva `copiado_de` con el id del origen.
- [ ] Tras `PUT /perfiles/:id/roles` sobre un perfil asignado, el siguiente `GET /v1/seg/mi-contexto` del afectado refleja el cambio (TR-RNF-101).
- [ ] Un código repetido en el tenant responde 409 `CONFLICTO` con «Ya existe un perfil con ese código en el tenant».
- [ ] `GET /perfiles` trae propios y predefinidos con `total_roles` y `productos`, y nada de otro tenant. `GET /perfiles/:id` de otro tenant responde 404.
- [ ] `GET /perfiles/roles-disponibles` trae solo roles activos de PLAT y de productos contratados, ordenados por producto y nombre, y no responde como `GET /perfiles/:perfilId`.
- [ ] Sin `plat.perfil.gestionar`, las seis rutas responden 403. Con `plat.perfil.gestionar` y sin `plat.rol.gestionar`, `roles-disponibles` responde 200.
- [ ] Crear, copiar y cambiar roles dejan su evento `seg.perfil.*` en el outbox en la misma transacción.
- [ ] Las seis rutas figuran en `/v1/docs` con su permiso y sus códigos de error.

**UI (Vitest):**

- [ ] El selector agrupa los roles por producto, marca los predefinidos y cuenta los seleccionados.
- [ ] TR-CA-035 en UI: un rol que no viene en `roles-disponibles` no se muestra en el selector.
- [ ] Guardar sin roles marcados muestra «Seleccione al menos un rol» y no envía.
- [ ] Un perfil predefinido abre en solo lectura con el aviso «Los perfiles predefinidos no se editan; cree una copia» y el botón «Copiar».
- [ ] En un perfil propio, «Guardar» queda deshabilitado sin cambios y envía `PUT` con el conjunto completo.
- [ ] Un perfil con roles que ya no están disponibles muestra «N roles de este perfil ya no están disponibles y se quitarán al guardar» y no los envía.
- [ ] Copiar precarga los roles disponibles del origen y, al quitar uno, envía `POST /copia` con `roles` sin ese id.
- [ ] `CONFLICTO`, `PRODUCTO_NO_CONTRATADO` y `ROL_FUERA_DEL_TECHO` muestran el `mensaje` de la API en el formulario sin navegar.
- [ ] Un actor sin `plat.perfil.gestionar` va a `/403` en las cuatro rutas.
- [ ] La lista filtra por texto y tipo sin pedir al servidor.
- [ ] Las pruebas de las páginas de roles del 16b pasan con `form-codigo-nombre`.

**Navegador (MCP `playwright`, Supabase dev):**

- [ ] La opción «Perfiles» del menú abre la lista, sin página de no encontrado.
- [ ] El recorrido del paso 10 termina sin errores en la consola.
- [ ] `PLAT_ADMIN_TENANTS` no aparece en el selector de roles.
- [ ] Hay capturas de lista, detalle, nuevo y copia a 360, 768 y 1280 px, sin scroll horizontal de página.
- [ ] Los datos de prueba se borran y la evidencia queda en `docs/ops/supabase-ambientes.md`.

**Límites y calidad:**

- [ ] `admin-cliente` sigue exportando solo `ADMIN_CLIENTE_ROUTES` e importa solo de `shared/*`. Nx en CI.
- [ ] `seguridad/src/domain` no importa `@nestjs/*` ni `typeorm`. `LecturaPerfiles` no tiene SQL crudo.
- [ ] Los componentes nuevos no tienen `template` ni `styles` inline ni colores fijos: solo tokens de `shared/ui` y utilidades de Tailwind.
- [ ] `docs/roadmap-specs.md` tiene la fila 16c actualizada.
- [ ] Cobertura de líneas de `src/domain/**` de `seguridad` ≥ 70 %.
- [ ] El código nuevo sigue la sección «Código limpio» de `CLAUDE.md` y pasó por `code-simplifier`.
- [ ] `pnpm nx run-many -t lint test build` termina con código 0 y `nx affected` está en verde en CI.
- [ ] Las horas reales quedan registradas en el plan.

## Decisiones

- **Sí:** el 16c es perfiles, no la fila del 16a citada al pedirlo (decisión del usuario). El 16a ya está implementado, `longitudMinimaMotivo` incluido.
- **Sí:** cuatro pantallas de ruta: lista, nuevo, detalle y copia (decisión del usuario). Mismo patrón que roles en el 16b.
- **Sí:** checkboxes de roles agrupados por producto (decisión del usuario). Muestra el perfil multiproducto de TR-CA-034.
- **No:** autocompletar con chips. Oculta la agrupación por producto.
- **Sí:** `GET /perfiles` para la lista y `GET /perfiles/:id` para el detalle, con los ids de los roles (decisión del usuario). Mismo patrón por id que el 16b y el 17c.
- **Sí:** `CopiarPerfil` con el mismo contrato que `CopiarRol`: origen predefinido o propio y `roles` opcionales (decisión del usuario). Una sola llamada copia y edita.
- **Sí:** `copiarDe` valida el conjunto final y emite un solo `perfil.creado`. No pasa por `cambiarRoles`.
- **Sí:** `copiado_de` en `perfil.creado` sin subir `schema_version` (decisión del usuario). Nada lo consume y no hay producción; queda igual que `rol.creado`.
- **Sí:** ruta de copia `/perfiles/:id/copia` en la API y `/copiar` en el front, como roles.
- **No:** renombrar ni inactivar perfiles (decisión del usuario, B2). Inactivar pide migración.
- **Sí:** `roles-disponibles` reusa `ListarRoles` del 16b y filtra activos (decisión del usuario sobre el contenido). Hereda productos del cliente y techo PLAT sin otra lectura.
- **No:** reusar `ListarAsignables` del 16a. No trae nombre de producto ni predefinido, y su permiso es otro.
- **Sí:** rechazar en back los roles PLAT que pasan el techo con `ROL_FUERA_DEL_TECHO` (decisión del usuario). Cierra la escalada por la API, como hizo el 16b con los permisos.
- **No:** reusar `PERMISO_AJENO_AL_PRODUCTO`. El mensaje habla de permisos, no de roles.
- **No:** ocultarlo solo en `roles-disponibles`. Deja el hueco por la API.
- **Sí:** el techo se aplica a todo rol PLAT, predefinido o propio. Cubre roles propios creados antes del 16b.
- **Sí:** TR-CA-034 y 035 con supertest sobre LIB, ECO y CLI sembrados en la prueba; en el navegador, perfiles con roles PLAT (decisión del usuario). Dev solo tiene PLAT.
- **No:** sembrar manifiestos LIB o ECO en dev. El catálogo es global y limpiarlo es delicado.
- **Sí:** `form-rol` pasa a `form-codigo-nombre`. Roles y perfiles validan los mismos largos (3-50 y 3-100); copiarlo sería código duplicado.
- **Sí:** los roles del perfil que ya no están disponibles se avisan y se quitan al guardar. Mandarlos haría fallar el `PUT` con `CONFLICTO` o `PRODUCTO_NO_CONTRATADO`.
- **Sí:** `PUT` con el conjunto completo de roles. Es lo que recibe `CambiarRolesPerfil`.
- **No:** migraciones. Las lecturas no necesitan funciones ni índices nuevos.

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| `GET /v1/seg/asignables` (16a) puede listar un rol o perfil que pasa el techo PLAT, y `OtorgarAsignacion` no lo rechaza | Fuera de alcance. En dev no hay perfiles así y este spec impide crearlos. Se anota en el cierre para un spec de SEG. |
| Un perfil propio con un rol fuera del techo creado antes de este spec | Ningún tenant de dev tiene perfiles. Se comprueba con una consulta en el paso 10; si hay alguno, se informa sin migrar. |
| El renombre de `form-rol` rompe las páginas de roles | El paso 5 corre las pruebas del 16b antes de seguir. |
| Dos administradores editan el mismo perfil a la vez | Bloqueo optimista del 06: el segundo recibe `CONFLICTO` «El registro fue modificado por otra operación; vuelva a cargarlo». |
| La ruta `roles-disponibles` la captura `:perfilId` | Se declara antes en el controlador y `exigirUuid` rechaza lo que no es UUID. Lo cubre un criterio. |
| El MCP `playwright` no conecta al implementar (en la sesión de este spec tampoco conectó) | Se dice así en el cierre y la UI no se da por verificada (`CLAUDE.md`). |

## Lo que **no** está en este spec

- Renombrar e inactivar perfiles.
- Techo PLAT en `GET /asignables` y en `OtorgarAsignacion`.
- Perfiles predefinidos sembrados, cambios al manifiesto PLAT y migraciones SQL.
- Manifiestos de otros productos en Supabase dev.
- Montaje en SazónPOS (26), E2E y axe en CI (27).

Cada uno entra en su propio spec cuando su sprint lo pida.
