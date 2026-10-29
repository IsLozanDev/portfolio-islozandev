# SPEC 16b — Roles: controladores, catálogo de permisos en árbol y UI de roles del cliente

> **Status:** Aprobado
> **Depends on:** SPEC 06, SPEC 15, SPEC 16a
> **Date:** 2026-10-28
> **Objective:** Exponer por `/v1/seg` la lectura, creación, copia, cambio de permisos e inactivación de roles con el catálogo de permisos en árbol, y construir en `libs/plataforma/admin-cliente` las pantallas de roles (U-04, TR-RF-011).

## Por qué existe este spec

Fila 16b de `docs/roadmap-specs.md`. Contexto: `docs/spec-context/16b-roles-perfiles.md`. Historia **U-04** (sprint 5). El plan le da 4 h de front y supone la API hecha. No lo está.

Perfiles de puesto (TR-RF-012, Should) salen de este spec por decisión del usuario. Pasan a un spec **16c `perfiles`**, que este spec agrega al roadmap.

Lo que hay en el código hoy (revisado al redactar):

- `CrearRol`, `CopiarRol`, `CambiarPermisosRol` e `InactivarRol` (`application/rol.casos-de-uso.ts`, spec 06) existen y están probados. No están registrados en `SeguridadModule` ni tienen controlador.
- `Rol.esPredefinido` es `tenant_id IS NULL` (cierra B3). `cambiarPermisos` e `inactivar` de un predefinido lanzan `ROL_PREDEFINIDO_NO_EDITABLE` con «Los roles predefinidos no se editan; cree una copia».
- `InactivarRol` sin `confirmado` devuelve `{ requiereConfirmacion: true, afectados }` y no cambia nada. No recibe motivo.
- `CopiarRol` acepta `permisos` opcionales: copia y edición en una sola llamada (TR-CA-031).
- Un código repetido da `ConflictError` «Ya existe un rol con ese código en el tenant» (`ux_rol_codigo`).
- `seg.permiso` y `seg.opcion` se relacionan N:M por `seg.opcion_permiso`. Un permiso puede no tener opción. `seg.permiso`, `seg.modulo` y `seg.opcion` tienen `obsoleto`.
- `entidades-lectura.ts` (16a) ya tiene `RolLecturaEntidad`, `RolPermisoLecturaEntidad` y `PermisoLecturaEntidad`. No tiene producto, módulo, opción ni `opcion_permiso`.
- Los cambios de `seg.rol` y `seg.rol_permiso` suben `seg.version_seguridad` por trigger (06): la caché de permisos se invalida sola (TR-RNF-101).
- El manifiesto PLAT `1.6.0` ya declara `/admin/roles` (`plat.rol.gestionar`) y `/admin/perfiles` (`plat.perfil.gestionar`). `plat.rol.gestionar` es `TENANT` y no sensible.
- **Hueco de escalada:** `Rol.crear` acepta cualquier permiso del producto. En PLAT eso incluye `plat.manifiesto.aplicar`, `plat.parametro.definir` y `plat.tenant.*`. Un administrador del cliente podría armar un rol con ellos. Este spec lo cierra (decisión del usuario).
- En Supabase dev solo existe el manifiesto PLAT.

RF cubierto: **TR-RF-011** gestionar roles propios del tenant (HTTP nuevo y UI).

Criterios del SRS: **TR-CA-031**, **032** y **033**, cerrados por HTTP y por UI. Los propuestos de la sección 3 del contexto para roles entran como criterios propios.

Reglas: **TR-RN-006** (solo productos contratados), **TR-RN-007** (formato y alcance), **TR-RN-009** (el árbol marca los sensibles).

RNF propios:

- **TR-RNF-021**: inactivar pide confirmación explícita con el número de usuarios afectados. Sin motivo (decisión del usuario).
- **TR-RNF-101**: un cambio de permisos se refleja en el siguiente `mi-contexto` del afectado en ≤ 5 s.
- **TR-RNF-122**: sin colores fijos, solo tokens de `shared/ui`. Las rutas siguen exportadas en `ADMIN_CLIENTE_ROUTES`.
- **TR-RNF-018**: usable a 360, 768 y 1280 px, textos en español de Perú.
- **TR-RNF-013**: la auditoría la dan los eventos `seg.rol.*` del outbox del 06.
- **TR-RNF-010**: las lecturas solo devuelven roles propios del tenant del token o predefinidos.

RNF heredados: 008, 011, 012, 024/119, 025, 026, 106.

Estimado: 7 h (back 3,5; front 3; navegador 0,5). El roadmap da 8-9 con perfiles.

## Alcance

**In:**

- **Back, `libs/plataforma/seguridad`:**
  - Cierre de la escalada: para PLAT, solo se aceptan permisos del rol predefinido `PLAT_PROPIETARIO`, en crear, copiar y cambiar permisos.
  - Entidades de lectura nuevas en `entidades-lectura.ts`: producto, módulo, opción y `opcion_permiso`.
  - Puerto `LecturaRoles` (`application/ports/lectura-roles.ts`) con su adaptador TypeORM (`infrastructure/typeorm/lectura-roles.typeorm.ts`).
  - Función pura `armarArbolPermisos` (`application/arbol-permisos.ts`).
  - Casos de uso de lectura en `application/lecturas-roles.ts`: `ListarRoles`, `ConsultarRol`, `ConsultarCatalogo`, `ListarProductosDisponibles`.
  - Controladores `interface/roles.controller.ts` y `interface/catalogo.controller.ts`, con DTO y zod en `interface/roles.http.ts`.
  - Registro en `SeguridadModule` de los cuatro casos de uso de escritura del 06, las lecturas y los dos controladores.
- **Front, `libs/plataforma/admin-cliente`:** modelos, clientes, componente `arbol-permisos`, componente `form-rol`, cuatro páginas y sus entradas en `ADMIN_CLIENTE_ROUTES`.
- **Docs:** fila 16c `perfiles` en `docs/roadmap-specs.md`.
- **Pruebas:** Jest (aplicación), integración y supertest, Vitest con `TestBed` zoneless y `HttpTestingController`, y verificación en navegador con el MCP `playwright` contra Supabase dev.

**Out of scope (para otros specs):**

- Perfiles de puesto: lista, crear, cambiar roles y `GET /v1/seg/perfiles/roles-disponibles` con `plat.perfil.gestionar` (16c, TR-RF-012, TR-CA-034 y 035).
- Renombrar un rol, reactivar un rol inactivo (no hay caso de uso, B2).
- Usuarios y asignaciones (16a, hecho). Organización (17c).
- Cambios al manifiesto PLAT. Se queda en `1.6.0`. La opción «Perfiles» del menú sigue declarada.
- Manifiestos REST, LIB, ECO o CLI en Supabase dev.
- Migraciones SQL. Este spec no crea tablas, funciones ni índices.
- Montaje en SazónPOS (26). E2E multinavegador y axe en CI (27).

## Base de código reutilizada

**Se conserva:**

- Spec 06: `Rol`, `CrearRol`, `CopiarRol`, `CambiarPermisosRol`, `InactivarRol`, `RepositorioRoles` (incluido `contarMembresiasAfectadas`), `CatalogoPermisos`, `ProductosContratados` y los errores `ROL_PREDEFINIDO_NO_EDITABLE`, `PERMISO_AJENO_AL_PRODUCTO`, `PRODUCTO_NO_CONTRATADO`. Eventos `seg.rol.creado`, `seg.rol.permisos_cambiados`, `seg.rol.inactivado`.
- Spec 08 y 16a: `MembresiasFiltro`, `validar` y `exigirUuid` de `membresias.http.ts`. `ENTIDADES_SEG_LECTURA` en el `DataSource` de `apps/api/src/main.ts`.
- Spec 13: `permisoGuard`, `*siPermiso`, `OMITIR_AVISO_ERROR`.
- Spec 15: `vit-tabla`, `vit-filtros`, `vit-acciones-formulario`, `mensajeValidacion`, `vit-cargando`, `vit-estado-vacio`, `AvisosService.confirmarDestructiva`, `erroresHttpInterceptor`.
- Spec 16a: lib `admin-cliente`, `utils/solicitar.ts`, `models/error-admin.ts`, `src/testing/`.

**Cambia:**

- `libs/plataforma/seguridad/src/domain/permisos-seg.ts`: constante `ROL_REFERENCIA_PLAT = 'PLAT_PROPIETARIO'`.
- `libs/plataforma/seguridad/src/application/ports/repositorios.ts`: `CatalogoPermisos` suma `permisosDeRolPredefinido(codigo: string): Promise<string[]>`.
- `libs/plataforma/seguridad/src/infrastructure/typeorm/lecturas.ts`: implementa ese método con `QueryBuilder` (no SQL crudo).
- `libs/plataforma/seguridad/src/application/rol.casos-de-uso.ts`: helper `catalogoDelCliente` que, si el producto es PLAT, quita del catálogo los permisos fuera de `PLAT_PROPIETARIO`. `CrearRol`, `CopiarRol` y `CambiarPermisosRol` lo usan. `CopiarRol` valida siempre el conjunto final (`permisos ?? origen.permisos`) con `cambiarPermisos`, que no emite evento si no hay cambios.
- `libs/plataforma/seguridad/src/seguridad.module.ts`: registra lo nuevo.
- `libs/plataforma/admin-cliente/src/lib/admin-cliente.routes.ts`: cuatro rutas de roles.
- `libs/plataforma/admin-cliente/src/lib/models/permisos-admin.ts`: `rolGestionar: 'plat.rol.gestionar'`.
- `libs/plataforma/admin-cliente/src/lib/models/mensajes-admin.ts`: textos de roles.
- `docs/roadmap-specs.md`: fila 16c.

## Modelo de datos

No hay tablas nuevas. Las lecturas usan `seg.rol`, `seg.rol_permiso`, `seg.permiso`, `seg.producto`, `seg.modulo`, `seg.opcion` y `seg.opcion_permiso`.

### Puerto de lectura (`application/ports/lectura-roles.ts`)

```ts
interface RolListado {
  id: string; codigo: string; nombre: string;
  productoCodigo: string; productoNombre: string;
  predefinido: boolean; activo: boolean;   // activo = activo && !obsoleto
  totalPermisos: number;
}

interface RolDetalle extends Omit<RolListado, 'totalPermisos'> {
  permisos: string[];                     // ordenados
}

/** Una fila por par permiso-opción; un permiso sin opción viene con modulo y opcion en null. */
interface FilaCatalogo {
  permiso: { codigo: string; descripcion: string; sensible: boolean; alcanceMinimo: Alcance };
  modulo: { codigo: string; nombre: string; orden: number } | null;
  opcion: { codigo: string; nombre: string; orden: number } | null;
}

interface LecturaRoles {
  listar(productos: readonly string[]): Promise<RolListado[]>;
  detalle(rolId: string): Promise<RolDetalle | null>;
  catalogo(productoCodigo: string): Promise<FilaCatalogo[]>;   // sin obsoletos
  productos(codigos: readonly string[]): Promise<{ codigo: string; nombre: string }[]>;
}
```

- `listar`: roles propios del tenant (activos e inactivos) y predefinidos activos, de los productos recibidos. Orden: `productoCodigo`, luego `nombre`.
- `ListarRoles` pasa `['PLAT', ...productos.vigentes()]` y quita los predefinidos PLAT con algún permiso fuera de `PLAT_PROPIETARIO` (por ejemplo `PLAT_ADMIN_TENANTS`).
- `detalle`: propio del tenant o predefinido. Uno de otro tenant da null. `ConsultarRol` lanza `NotFoundError` «El rol no existe».
- Adaptador con `QueryBuilder` sobre el `EntityManager` de la transacción activa (regla 11). Sin SQL crudo. `totalPermisos` con subconsulta del `QueryBuilder`.

### Árbol (`application/arbol-permisos.ts`)

```ts
interface PermisoDelArbol { codigo: string; descripcion: string; sensible: boolean; alcanceMinimo: Alcance }
interface OpcionDelArbol { codigo: string; nombre: string; permisos: PermisoDelArbol[] }
interface ModuloDelArbol { codigo: string; nombre: string; opciones: OpcionDelArbol[] }
interface ArbolPermisos { productoCodigo: string; modulos: ModuloDelArbol[]; otros: PermisoDelArbol[] }

function armarArbolPermisos(productoCodigo: string, filas: readonly FilaCatalogo[]): ArbolPermisos;
```

- Cada permiso cuelga de **una sola** opción: la primera por `modulo.orden`, `opcion.orden` y `opcion.codigo` (decisión del usuario).
- Los permisos sin opción van a `otros` («Otros permisos»).
- Módulos y opciones sin permisos no aparecen. Permisos ordenados por `codigo`.
- `ConsultarCatalogo` filtra antes las filas de PLAT con `PLAT_PROPIETARIO`.

### HTTP

Todos bajo `/v1/seg`, con `@ApiBearerAuth()`, `X-Sucursal-Id`, OpenAPI con cada código de error, `MembresiasFiltro` y errores `{ codigo, mensaje }`. Todas con `@Permiso('plat.rol.gestionar')`. Sin paginar (D4).

| Método y ruta | Caso de uso | Éxito |
| --- | --- | --- |
| `GET /roles` | `ListarRoles` | 200 `{ items: [{ id, codigo, nombre, producto_codigo, producto_nombre, predefinido, activo, total_permisos }] }` |
| `GET /roles/:rolId` | `ConsultarRol` | 200 `{ id, codigo, nombre, producto_codigo, producto_nombre, predefinido, activo, permisos: string[] }` |
| `POST /roles` | `CrearRol` | 201 `{ rol_id }` |
| `POST /roles/:rolId/copia` | `CopiarRol` | 201 `{ rol_id }` |
| `PUT /roles/:rolId/permisos` | `CambiarPermisosRol` | 204 |
| `POST /roles/:rolId/inactivar` | `InactivarRol` | 200 `{ requiere_confirmacion, afectados }` |
| `GET /productos-disponibles` | `ListarProductosDisponibles` | 200 `{ items: [{ codigo, nombre }] }` (PLAT y contratados vigentes) |
| `GET /catalogo/:productoCodigo` | `ConsultarCatalogo` | 200 `{ producto_codigo, modulos: [{ codigo, nombre, opciones: [{ codigo, nombre, permisos: [{ codigo, descripcion, sensible, alcance_minimo }] }] }], otros: [...] }` |

Cuerpos (zod en `roles.http.ts`):

```ts
// POST /roles
{ producto_codigo: string /* 2-5 mayúsculas */, codigo: string, nombre: string, permisos: string[] /* máx. 500 */ }
// POST /roles/:rolId/copia
{ codigo: string, nombre: string, permisos?: string[] }
// PUT /roles/:rolId/permisos
{ permisos: string[] }
// POST /roles/:rolId/inactivar
{ confirmado: boolean }
```

- Zod valida forma. Longitudes de código (3-50) y nombre (3-100) las valida el dominio con sus mensajes.
- La ruta se llama `productos-disponibles`, no `productos-contratados`: incluye PLAT, que no se contrata.

Errores por HTTP:

| `codigo` | HTTP | Cuándo |
| --- | --- | --- |
| `SOLICITUD_INVALIDA` | 400 | zod; id no UUID; código o nombre fuera de largo |
| `PERMISO_AJENO_AL_PRODUCTO` | 400 | Permiso de otro producto, inexistente, obsoleto o PLAT fuera de `PLAT_PROPIETARIO` |
| `PRODUCTO_NO_CONTRATADO` | 400 | Crear, copiar o pedir el catálogo de un producto sin suscripción vigente |
| `SIN_PERMISO` | 403 | Sin `plat.rol.gestionar` |
| `NO_ENCONTRADO` | 404 | Rol inexistente o de otro tenant |
| `ROL_PREDEFINIDO_NO_EDITABLE` | 409 | Cambiar permisos o inactivar un predefinido (TR-CA-032) |
| `CONFLICTO` | 409 | Código repetido; copiar un rol inactivo; versión cambiada |

### Front, `libs/plataforma/admin-cliente`

Archivos nuevos (sección «Estructura de libs Angular» de `CLAUDE.md`):

```
lib/models/rol.ts                         DTO, modelo y mapeo snake_case → camelCase; FormularioRol
lib/models/catalogo-permisos.ts           árbol, producto disponible y su mapeo
lib/services/roles.cliente.ts             GET lista y detalle, POST crear y copia, PUT permisos, POST inactivar
lib/services/catalogo.cliente.ts          GET productos-disponibles y catalogo/:producto
lib/utils/seleccion-permisos.ts           estado marcado/parcial/vacío de opción y módulo; alternar grupo
lib/components/arbol-permisos/            árbol con checkbox
lib/components/form-rol/                  código y nombre
lib/pages/roles-lista/
lib/pages/rol-nuevo/
lib/pages/rol-detalle/
lib/pages/rol-copia/
```

Rutas (en `ADMIN_CLIENTE_ROUTES`, todas con `permisoGuard('plat.rol.gestionar')`):

| Ruta | Página |
| --- | --- |
| `/admin/roles` | `RolesListaPage` |
| `/admin/roles/nuevo` | `RolNuevoPage` |
| `/admin/roles/:rolId` | `RolDetallePage` |
| `/admin/roles/:rolId/copiar` | `RolCopiaPage` |

Comportamiento:

- **Lista:** `vit-filtros` con producto y tipo (Predefinido, Propio), filtrado en cliente. `vit-tabla` sin paginar. Columnas: nombre, código, producto, tipo, estado, permisos. Botón «Nuevo rol». La fila abre el detalle.
- **`arbol-permisos`:** inputs `arbol` y `soloLectura`; `model` `seleccionados` (`Set<string>` en signal). Cada módulo es un `mat-expansion-panel`. Cada opción tiene un checkbox de grupo (marcado, parcial o vacío) y un checkbox por permiso con su descripción y código. Los sensibles llevan la etiqueta «Requiere verificación» (TR-RN-009). Contador «N permisos seleccionados». «Otros permisos» va al final si no está vacío.
- **Nuevo:** selector de producto (`productos-disponibles`), `form-rol` y el árbol del producto elegido. Cambiar el producto limpia la selección. Éxito: toast y navegación al detalle.
- **Detalle:** cabecera con nombre, código, producto, tipo y estado.
  - Propio activo: árbol editable, «Guardar» envía `PUT` con el conjunto completo y queda deshabilitado sin cambios. Acciones «Copiar» e «Inactivar».
  - Predefinido: árbol en solo lectura, aviso «Los roles predefinidos no se editan; cree una copia» y botón «Copiar» (TR-CA-032).
  - Propio inactivo: árbol en solo lectura, sin acciones.
- **Copiar:** `form-rol` vacío y el árbol del producto del origen precargado con sus permisos. «Guardar» envía `POST /copia` con `permisos` siempre. Éxito: navegación al detalle de la copia.
- **Inactivar:** pide `confirmado: false`. Si `afectados > 0`, `confirmarDestructiva` sin motivo con «El rol <nombre> está asignado a N usuarios. Sus permisos dejarán de estar vigentes.» (TR-CA-033). Si es 0, confirmación simple «¿Inactivar el rol <nombre>?». Al confirmar envía `confirmado: true` y recarga el detalle.
- **Errores:** las páginas piden con `OMITIR_AVISO_ERROR` los códigos que muestran en el formulario (`PERMISO_AJENO_AL_PRODUCTO`, `PRODUCTO_NO_CONTRATADO`, `ROL_PREDEFINIDO_NO_EDITABLE`, `CONFLICTO`, `SOLICITUD_INVALIDA`). Muestran el `mensaje` de la API como texto plano. El resto lo avisa `erroresHttpInterceptor`.
- Validación local: código 3-50 y nombre 3-100 con `mensajeValidacion`; al menos un permiso marcado, con «Seleccione al menos un permiso».

## Plan de implementación

1. **Cierre de la escalada en PLAT.**
   - `ROL_REFERENCIA_PLAT`, `CatalogoPermisos.permisosDeRolPredefinido` y `catalogoDelCliente` en los tres casos de uso.
   - Pruebas (Jest y de integración): crear un rol PLAT con `plat.manifiesto.aplicar` da `PERMISO_AJENO_AL_PRODUCTO`; copiar `PLAT_ADMIN_TENANTS` da el mismo error; copiar `PLAT_ADMIN_SEGURIDAD` sin `permisos` funciona; las pruebas del 06 siguen pasando.
   - Verificar: `pnpm nx test seguridad`.
2. **Entidades y `LecturaRoles`.**
   - Entidades de producto, módulo, opción y `opcion_permiso` en `ENTIDADES_SEG_LECTURA`; puerto y adaptador.
   - Pruebas de integración: `listar` trae propios activos e inactivos y predefinidos activos de los productos pedidos; nada de otro tenant; `totalPermisos` correcto; `detalle` de otro tenant da null; `catalogo` excluye obsoletos y trae una fila por par permiso-opción y una con nulos para permisos sin opción.
   - Verificar: `pnpm nx test seguridad` (PGlite en local, PostgreSQL 16 en CI).
3. **`armarArbolPermisos` y casos de uso de lectura.**
   - Función pura y `lecturas-roles.ts`.
   - Pruebas Jest: un permiso en dos opciones aparece solo en la primera; sin opción va a `otros`; módulos vacíos no salen; `ListarRoles` oculta `PLAT_ADMIN_TENANTS` y roles de productos no contratados; `ConsultarCatalogo` de PLAT no trae `plat.tenant.crear`; de un producto no contratado lanza `PRODUCTO_NO_CONTRATADO`.
   - Verificar: `pnpm nx test seguridad`.
4. **Controladores y registro.**
   - `roles.http.ts`, `roles.controller.ts`, `catalogo.controller.ts` y `SeguridadModule`.
   - Pruebas supertest con catálogo REST sembrado en la prueba: TR-CA-031, 032, 033; rol sin uso; cambio de permisos visto por `mi-contexto` del afectado; 403 sin permiso en las ocho rutas; 404 de otro tenant; 409 por código repetido; eventos en el outbox en la misma transacción.
   - Verificar: `pnpm nx test seguridad` y las rutas en `/v1/docs`.
5. **Modelos, clientes y `seleccion-permisos`.**
   - Pruebas con `HttpTestingController`: URL, cuerpo en snake_case y mapeo. Pruebas puras del estado de grupo y de alternar una opción o un módulo.
   - Verificar: `pnpm nx test admin-cliente`.
6. **`arbol-permisos` y `form-rol`.**
   - Pruebas: marcar el grupo de una opción marca sus permisos y desmarcar uno lo deja parcial; los sensibles muestran «Requiere verificación»; en `soloLectura` los checkbox están deshabilitados; validaciones de largo.
   - Verificar: `pnpm nx test admin-cliente`.
7. **Lista y rutas.**
   - `RolesListaPage` y las cuatro rutas.
   - Pruebas: filtro por producto y tipo; estado vacío; sin `plat.rol.gestionar` `/admin/roles` va a `/403`.
   - Verificar: `pnpm nx test admin-cliente`.
8. **Nuevo y copia.**
   - `RolNuevoPage` y `RolCopiaPage`.
   - Pruebas: cambiar producto limpia la selección; sin permisos no envía; copia precarga los permisos del origen y envía `permisos`; `CONFLICTO` muestra el mensaje sin navegar.
   - Verificar: `pnpm nx test admin-cliente`.
9. **Detalle e inactivar.**
   - `RolDetallePage`.
   - Pruebas: predefinido en solo lectura con aviso y «Copiar»; «Guardar» deshabilitado sin cambios; inactivar con 4 afectados muestra el conteo y envía `confirmado: true`; con 0 muestra la confirmación simple; inactivo sin acciones.
   - Verificar: `pnpm nx test admin-cliente`.
10. **Roadmap.**
    - Fila 16c `perfiles` en `docs/roadmap-specs.md`: U-04 (RF 012), lista, crear y cambiar roles del perfil, `GET /v1/seg/perfiles/roles-disponibles` con `plat.perfil.gestionar`, depende de 16b, 3-4 h. Se ajusta la fila 16b a «roles».
11. **Verificación en navegador (MCP `playwright`, Supabase dev).**
    - `nx serve api` y `nx serve plataforma-admin` contra dev, con un tenant de prueba y cuatro miembros de prueba.
    - Recorrido: abrir `PLAT_ADMIN_SEGURIDAD` (solo lectura, aviso); copiarlo como «Seguridad sin revocar» quitando `plat.asignacion.revocar`; asignar la copia a los cuatro miembros (pantalla del 16a); quitar otro permiso y ver el cambio en `mi-contexto` de un afectado; inactivar con el conteo de 4; crear un rol PLAT nuevo y comprobar que el árbol no muestra `plat.tenant.*` ni `plat.manifiesto.aplicar`. Consola sin errores. Capturas de lista, detalle, nuevo y copia a 360, 768 y 1280 px.
    - Los datos de prueba se borran al final. Evidencia en `docs/ops/supabase-ambientes.md`.

## Criterios de aceptación

**API (supertest):**

- [ ] TR-CA-031: copiar `REST_MOZO` como «Mozo terraza» sin `rest.pedido.anular` responde 201 y el rol queda activo, propio y sin ese permiso.
- [ ] TR-CA-032: `PUT /roles/:id/permisos` sobre `REST_CAJERO` responde 409 `ROL_PREDEFINIDO_NO_EDITABLE` con «Los roles predefinidos no se editan; cree una copia».
- [ ] TR-CA-033: inactivar «Mozo terraza» asignado a 4 usuarios con `confirmado: false` responde `{ requiere_confirmacion: true, afectados: 4 }` sin cambiar nada; con `confirmado: true` el rol queda inactivo y los permisos efectivos de esos 4 ya no lo incluyen.
- [ ] Inactivar un rol sin asignaciones responde `afectados: 0`.
- [ ] Tras `PUT /roles/:id/permisos` sobre un rol asignado, el siguiente `GET /v1/seg/mi-contexto` del afectado refleja el cambio (TR-RNF-101).
- [ ] Crear un rol PLAT con `plat.manifiesto.aplicar` o `plat.tenant.crear` responde 400 `PERMISO_AJENO_AL_PRODUCTO`. Copiar `PLAT_ADMIN_TENANTS` responde lo mismo.
- [ ] Crear un rol de un producto sin suscripción vigente responde 400 `PRODUCTO_NO_CONTRATADO`.
- [ ] Un código repetido en el tenant responde 409 `CONFLICTO` con «Ya existe un rol con ese código en el tenant».
- [ ] `GET /roles` trae propios activos e inactivos y predefinidos activos de PLAT y de productos contratados. No trae `PLAT_ADMIN_TENANTS` ni roles de otro tenant.
- [ ] `GET /roles/:id` de un rol de otro tenant responde 404.
- [ ] `GET /catalogo/REST` agrupa módulo → opción → permiso, pone cada permiso en una sola opción, manda a `otros` los que no tienen opción, marca `sensible` y no trae obsoletos.
- [ ] `GET /catalogo/PLAT` solo trae permisos de `PLAT_PROPIETARIO`.
- [ ] `GET /productos-disponibles` trae PLAT y solo los productos con suscripción vigente.
- [ ] Sin `plat.rol.gestionar`, las ocho rutas responden 403.
- [ ] Crear, copiar, cambiar permisos e inactivar dejan su evento `seg.rol.*` en el outbox en la misma transacción.
- [ ] Las ocho rutas figuran en `/v1/docs` con su permiso y sus códigos de error.

**UI (Vitest):**

- [ ] El árbol agrupa por módulo y opción, marca los sensibles con «Requiere verificación» y el checkbox de opción pasa a parcial al desmarcar uno de sus permisos.
- [ ] TR-CA-032 en UI: un rol predefinido abre en solo lectura con el aviso «Los roles predefinidos no se editan; cree una copia» y el botón «Copiar».
- [ ] TR-CA-031 en UI: copiar precarga los permisos del origen y, al quitar uno, envía `POST /copia` con `permisos` sin ese código.
- [ ] TR-CA-033 en UI: con `afectados: 4`, la confirmación dice «El rol Mozo terraza está asignado a 4 usuarios…», no pide motivo y al confirmar envía `{ confirmado: true }`.
- [ ] Con `afectados: 0`, la confirmación no menciona usuarios.
- [ ] Guardar sin permisos marcados muestra «Seleccione al menos un permiso» y no envía.
- [ ] Cambiar el producto en «Nuevo rol» limpia la selección y pide el catálogo del producto nuevo.
- [ ] `CONFLICTO` y `PERMISO_AJENO_AL_PRODUCTO` muestran el `mensaje` de la API en el formulario sin navegar.
- [ ] Un actor sin `plat.rol.gestionar` va a `/403` en las cuatro rutas.
- [ ] La lista filtra por producto y tipo sin pedir al servidor.

**Navegador (MCP `playwright`, Supabase dev):**

- [ ] El recorrido del paso 11 termina sin errores en la consola.
- [ ] El árbol de un rol PLAT nuevo no muestra `plat.tenant.*`, `plat.manifiesto.aplicar` ni `plat.parametro.definir`.
- [ ] Hay capturas de lista, detalle, nuevo y copia a 360, 768 y 1280 px, sin scroll horizontal de página.
- [ ] Los datos de prueba se borran y la evidencia queda en `docs/ops/supabase-ambientes.md`.

**Límites y calidad:**

- [ ] `admin-cliente` sigue exportando solo `ADMIN_CLIENTE_ROUTES` e importa solo de `shared/*`. Nx en CI.
- [ ] `seguridad/src/domain` no importa `@nestjs/*` ni `typeorm`. Las lecturas nuevas y `permisosDeRolPredefinido` no tienen SQL crudo.
- [ ] Los componentes nuevos no tienen `template` ni `styles` inline ni colores fijos: solo tokens de `shared/ui` y utilidades de Tailwind.
- [ ] `docs/roadmap-specs.md` tiene la fila 16c `perfiles`.
- [ ] Cobertura de líneas de `src/domain/**` de `seguridad` ≥ 70 %.
- [ ] El código nuevo sigue la sección «Código limpio» de `CLAUDE.md` y pasó por `code-simplifier`.
- [ ] `pnpm nx run-many -t lint test build` termina con código 0 y `nx affected` está en verde en CI.
- [ ] Las horas reales quedan registradas en el plan.

## Decisiones

- **Sí:** perfiles fuera, a un spec 16c (decisión del usuario). Es Should y el recorte natural; el 16b queda en 7 h.
- **Sí:** `specs/16b-roles.md` y fila 16c en el roadmap (decisión del usuario). El nombre dice lo que cubre.
- **Sí:** para el 16c, `GET /v1/seg/perfiles/roles-disponibles` con `plat.perfil.gestionar` (decisión del usuario). Un permiso por ruta; quien solo gestiona perfiles no recibe 403.
- **No:** que el editor de perfiles reuse `GET /roles`. Exigiría `plat.rol.gestionar`.
- **Sí:** cada permiso en la primera opción por orden, y los que no tienen opción en «Otros permisos» (decisión del usuario). Un checkbox por permiso, sin sincronizar duplicados.
- **No:** repetir el permiso en cada opción, ni agrupar por recurso. Más lógica en la UI, o se aleja del árbol del SRS.
- **Sí:** el árbol lo arma el back con una función pura. Se prueba en Jest y la UI solo pinta.
- **Sí:** para PLAT, solo permisos de `PLAT_PROPIETARIO` en catálogo, lista, crear, copiar y cambiar permisos (decisión del usuario). Cierra la escalada por HTTP sin migración ni manifiesto.
- **No:** ocultarlos solo en la UI. Deja el hueco por la API.
- **No:** una marca nueva en `seg.permiso` («de plataforma»). Pide migración y manifiesto nuevo; `PLAT_PROPIETARIO` ya expresa el techo del cliente.
- **Sí:** inactivar sin motivo (decisión del usuario, B5). `InactivarRol` no lo guarda; pedirlo sería solo de forma.
- **Sí:** páginas de ruta para nuevo, detalle y copia (decisión del usuario). Igual que el 16a; sin `MatDialog`.
- **Sí:** copiar envía siempre `permisos`. Una sola llamada para copiar y editar (TR-CA-031), un solo evento.
- **Sí:** la lista trae propios y predefinidos, con filtro en cliente y sin paginar (decisión del usuario, D4).
- **Sí:** un rol inactivo se ve en solo lectura y sin acciones. No hay reactivar (B2) y el dominio no copia inactivos.
- **Sí:** todas las rutas con `plat.rol.gestionar`, incluido el catálogo y los productos (B4). No chocan con `/asignables` del 16a.
- **Sí:** `productos-disponibles` en vez de `productos-contratados`. Incluye PLAT, que no se contrata.
- **Sí:** verificación en navegador con roles PLAT; TR-CA-031 a 033 con REST por supertest con catálogo sembrado en la prueba (decisión del usuario). Dev solo tiene el manifiesto PLAT.
- **No:** sembrar manifiestos REST, LIB o ECO en dev. El catálogo es global y la limpieza es delicada.
- **Sí:** `PUT` con el conjunto completo de permisos. Es lo que recibe `CambiarPermisosRol`.
- **No:** migraciones. Las lecturas no necesitan funciones ni índices nuevos.

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| La opción «Perfiles» del menú (`/admin/perfiles`) lleva a la página de no encontrado hasta el 16c | Quitarla pide versión nueva del manifiesto. El 16c la cubre; se anota en el cierre. |
| Un rol propio con permisos PLAT fuera de `PLAT_PROPIETARIO` creado antes de este spec | Ningún tenant de dev tiene roles PLAT propios. Se comprueba en el paso 11 con una consulta; si hay alguno, se informa sin migrar. |
| `PLAT_PROPIETARIO` cambia en un manifiesto futuro y deja roles propios con permisos ya no aceptados | Sus permisos siguen vigentes hasta que alguien edite el rol; entonces `PERMISO_AJENO_AL_PRODUCTO` obliga a quitarlos. Aceptado. |
| Un catálogo grande hace lento el árbol | En R1 un producto tiene decenas de permisos. Módulos colapsables en `mat-expansion-panel`. |
| Dos administradores editan el mismo rol a la vez | Bloqueo optimista del 06: el segundo recibe `CONFLICTO` «El registro fue modificado por otra operación; vuelva a cargarlo». |
| 17c trabaja sobre `admin-cliente` en paralelo | Solo suman carpetas y entradas de rutas. Conflicto de líneas en `admin-cliente.routes.ts`. |
| El MCP `playwright` no conecta al implementar | Se dice así en el cierre y la UI no se da por verificada (`CLAUDE.md`). |

## Lo que **no** está en este spec

- Perfiles de puesto y su lectura de roles disponibles (16c).
- Renombrar un rol y reactivar un rol inactivo.
- Usuarios y asignaciones (16a), organización (17c).
- Cambios al manifiesto PLAT y migraciones SQL.
- Manifiestos de otros productos en Supabase dev.
- Montaje en SazónPOS (26), E2E y axe en CI (27).

Cada uno entra en su propio spec cuando su sprint lo pida.
