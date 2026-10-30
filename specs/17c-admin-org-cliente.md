# SPEC 17c — Organización del cliente: empresas, sucursales y unidades en `admin-cliente`, y sesión compartida entre apps

> **Status:** Aprobado
> **Depends on:** SPEC 03, SPEC 13, SPEC 15, SPEC 16a, SPEC 17a, SPEC 17b
> **Date:** 2026-10-29
> **Objective:** Construir en `libs/plataforma/admin-cliente` las pantallas para registrar, editar, inactivar y reactivar empresas, sucursales y unidades (U-05), con sus tres lecturas por id en la API, y dejar `plataforma-admin` y `plataforma-consola` compartiendo la sesión entre subdominios con enlace de vuelta (U-06).

## Por qué existe este spec

Fila 17c de `docs/roadmap-specs.md`. Contexto: `docs/spec-context/17c-admin-org-cliente.md`. Historias **U-05** (4 h) y **U-06** (2 h), sprint 5.

El roadmap lo marca como «solo front». Al redactarlo apareció que el 17a no expone lecturas por id. La edición necesita leer un registro sin recorrer listas, así que este spec suma tres `GET` por id en la API (decisión del usuario). U-05 y U-06 van en un solo spec aunque toquen tres áreas, con más pasos de implementación (decisión del usuario).

Lo que hay en el código hoy (revisado al redactar):

- El 17a dejó `GET`/`POST /v1/org/empresas`, `PUT /empresas/:id`, `GET`/`POST /empresas/:id/sucursales`, `PUT /sucursales/:id`, `POST /sucursales/:id/inactivar`, `POST /sucursales/:id/principal`, `GET`/`POST /unidades`, `PUT /unidades/:id` y `POST /unidades/:id/inactivar`. No hay `GET` por id.
- `PUT /sucursales/:id` y `PUT /unidades/:id` aceptan `activo` opcional: la API ya permite reactivar. Los `PUT` exigen `version` y responden 409 `VERSION_OBSOLETA` si cambió.
- `LecturaOrganizacion` (`libs/plataforma/org/src/application/ports/lectura-organizacion.ts`) tiene `empresas`, `sucursales` y `unidades`, con `EmpresaListada`, `SucursalListada` y `UnidadListada`. Los casos de uso de lectura están en `application/lecturas-organizacion.ts`.
- El manifiesto PLAT `1.6.0` declara las opciones de menú `/admin/empresas`, `/admin/sucursales` y `/admin/unidades` con `plat.organizacion.consultar`. No hay rutas anidadas bajo empresa.
- `admin-cliente` ya tiene `OrganizacionCliente` (lecturas para el selector de alcance del 16a, con `activo=true` y `tamano=100`) y `models/ubicacion.ts`. Se conservan.
- Dominio (03): la principal conserva el establecimiento `0000`; `0000` solo en la principal; «Marque otra sucursal como principal antes de inactivar esta»; «Solo los almacenes pueden registrarse sin sucursal»; «La unidad padre debe ser de la misma empresa». En la edición de una unidad no cambian ni `tipo` ni `sucursal_id`.
- Las dos apps llaman a la API por el proxy `/v1`, en el mismo origen. `apps/api/src/main.ts` no configura CORS.
- `ConfigAuth.dominioCookie?` existe (13) y ningún `environment` lo define. `environment.prod.ts` está vacío.
- `rutaDeRetorno` (`libs/shared/auth/src/lib/utils/navegacion.ts`) solo acepta rutas internas para `returnUrl`.
- Las cookies no distinguen puerto: `127.0.0.1:4200` y `127.0.0.1:4201` ya comparten la sesión. El atributo `domain` solo se prueba con subdominios reales.
- `validarRuc` no se puede importar desde una lib empaquetada con ng-packagr (17b). `consola-tenants` tiene una copia.

RF cubiertos:

- **TR-RF-002** registrar (y editar) empresa del tenant.
- **TR-RF-003** registrar, editar, inactivar y reactivar sucursal, y marcar la principal.
- **TR-RF-004** registrar, editar, inactivar y reactivar unidad operativa.

U-06 no tiene RF. Su base es ADR-31 (sesión compartida por cookie de dominio).

Criterios del SRS, en la UI: **TR-CA-004** (adaptado: razón social manual, sin padrón), **005**, **007**, **008**, **009**, **010**, **011** y **012**. **TR-CA-006** queda diferido (padrón en R2). Los GWT propuestos en la sección 3 del contexto entran como criterios propios.

Reglas: **TR-RN-001**, **002** (RUC módulo 11 en el cliente), **003**, **004** y **006** en lo que muestra la UI.

RNF propios:

- **TR-RNF-008**: un 409 `VERSION_OBSOLETA` muestra «Otro usuario modificó el registro; recargue». El botón de envío queda deshabilitado mientras viaja la petición.
- **TR-RNF-021**: inactivar sucursal o unidad pide confirmación con `confirmarDestructiva`, sin motivo.
- **TR-RNF-122**: sin colores fijos. Las rutas siguen exportadas en `ADMIN_CLIENTE_ROUTES`, montables en otro backoffice.
- **TR-RNF-018**: usable a 360, 768 y 1280 px, textos en español de Perú.
- **TR-RNF-019**: axe-core sin `critical` ni `serious` en las pantallas nuevas.
- **TR-RNF-014**: salir en una app deja la otra sin sesión (misma cookie).
- **TR-RNF-012**: `volverA` sin redirección abierta (solo orígenes en la lista blanca).

RNF heredados: 010, 011, 024/119, 025, 026, 101.

Estimado: 9-9,5 h (back 1; organización 5; U-06 2; navegador 1-1,5). El roadmap da 7. El usuario aceptó pasarse y no recortar.

## Alcance

**In:**

- **Back (`libs/plataforma/org` y `apps/api/src/org`):**
  - `LecturaOrganizacion` suma `empresa(id)`, `sucursal(id)` y `unidad(id)`.
  - Casos de uso `ConsultarEmpresa`, `ConsultarSucursal` y `ConsultarUnidad`.
  - `GET /v1/org/empresas/:id`, `GET /v1/org/sucursales/:id` y `GET /v1/org/unidades/:id` con `plat.organizacion.consultar`.
- **CORS (`apps/api`):** variable `ORIGENES_PERMITIDOS`. Sin la variable, CORS sigue apagado.
- **Front, `libs/plataforma/admin-cliente`:** modelos, tres clientes, utilidades de formulario, copia de `validarRuc`, seis páginas (lista y formulario por entidad) y nueve rutas en `ADMIN_CLIENTE_ROUTES`.
- **U-06:**
  - `libs/shared/auth`: `PARAMETRO_VOLVER_A` y la función pura `urlDeVuelta`.
  - `libs/shared/shell`: `provideVolverA`, `VolverAService` y el enlace «Volver a …» en la barra del layout.
  - `apps/plataforma-admin` y `apps/plataforma-consola`: `origenesVolverA` en cada `environment`, un `environment.subdominios.ts` y configuraciones `subdominios` de `build` y `serve`.
- **Docs:** fila 17c de `docs/roadmap-specs.md` (horas y lecturas por id). `ORIGENES_PERMITIDOS` en `.env.example`.
- **Pruebas:** Jest y supertest en el back. Vitest con `TestBed` zoneless y `HttpTestingController` en el front. Verificación en navegador con el MCP `playwright` contra Supabase dev.

**Out of scope (para otros specs):**

- Inactivar o reactivar empresa (el 03 no lo prevé).
- Padrón RUC, autocompletar razón social y advertencia NO HABIDO (TR-IDN, R2; TR-CA-006).
- Catálogos `UBIGEO` y `TIPO_UNIDAD` (19a). Aquí `ubigeo` es texto de 6 dígitos y los tipos son una lista cerrada repetida en el front.
- Esquema de `atributos` por tipo de unidad. Solo tres campos fijos.
- Motivo de inactivación (el 03 no lo guarda).
- Invalidar la caché de permisos al crear una sucursal (brecha 2 del contexto). Se acepta el retraso de 60 s.
- Parámetros, series y catálogos propios (D-05). Visor de auditoría (spec propio después del 20).
- Agrupar el selector de sucursales del shell por empresa (15).
- Enlace desde la consola hacia `admin.` en el menú. La entrada profunda se prueba escribiendo la URL.
- Valores de staging y prod (`dominioCookie`, orígenes reales). Se llenan en el spec de despliegue.
- Montaje en SazónPOS y sus orígenes (23, 26).
- Editar el archivo hosts y registrar URLs de retorno en Supabase dev. Es manual y lo hace el usuario.
- Mover `validarRuc` a una lib compartida buildable (deuda, como en el 17b).
- Corregir los specs 13 y 14 (brecha 1 del contexto).
- E2E multinavegador y axe en CI (27).

## Base de código reutilizada

**Se conserva sin cambios:**

- Spec 03: casos de uso y reglas de empresa, sucursal y unidad, con sus mensajes.
- Spec 17a: contratos de los endpoints existentes, `OrgFiltro`, `EsquemaPagina`, `empresaDto`, `sucursalDto`, `unidadDto` y `exigirUuid` de `organizacion.http.ts`.
- Spec 13: `SesionService` (`cargarContexto`, `sucursalId`, `salir`), `permisoGuard`, `*siPermiso`, `OMITIR_AVISO_ERROR`, `opcionesCookie`.
- Spec 15: `vit-tabla`, `vit-acciones-formulario`, `mensajeValidacion`, `vit-cargando`, `vit-estado-vacio`, `AvisosService` (`exito`, `advertencia`, `confirmarDestructiva`), `erroresHttpInterceptor`.
- Spec 16a: `OrganizacionCliente`, `models/listado.ts`, `models/error-admin.ts`, `utils/solicitar.ts` y `src/testing/`.

**Cambia:**

- `libs/plataforma/org/src/application/ports/lectura-organizacion.ts`: tres métodos por id.
- `libs/plataforma/org/src/infrastructure/typeorm/lectura-organizacion.typeorm.ts`: los implementa con `delTenant` y `QueryBuilder` (sin SQL crudo).
- `libs/plataforma/org/src/application/lecturas-organizacion.ts`: tres casos de uso nuevos.
- `libs/plataforma/org/src/infrastructure/org.module.ts` e `index.ts`: los registra y exporta.
- `apps/api/src/org/empresas.controller.ts`, `sucursales.controller.ts` y `unidades.controller.ts`: un `GET :id` cada uno.
- `apps/api/src/main.ts`: `enableCors` si `opcionesCors` devuelve opciones.
- `libs/shared/auth/src/lib/utils/navegacion.ts` e `index.ts`: `PARAMETRO_VOLVER_A` y `urlDeVuelta`.
- `libs/shared/shell/src/lib/components/layout/layout.component.{ts,html}`: enlace «Volver a …».
- `libs/shared/shell/src/lib/components/menu-usuario/menu-usuario.component.ts`: `salir()` también limpia `VolverAService`.
- `libs/shared/shell/src/lib/models/mensajes-shell.ts`: `volverA`.
- `libs/plataforma/admin-cliente/src/lib/admin-cliente.routes.ts` y `models/permisos-admin.ts`.
- `apps/plataforma-admin` y `apps/plataforma-consola`: `environments/*`, `app.config.ts` y `project.json`.

## Modelo de datos

No hay tablas, migraciones ni cambios al manifiesto (sigue en `1.6.0`).

### Back: lecturas por id

```ts
// application/ports/lectura-organizacion.ts
interface LecturaOrganizacion {
  // ...lo del 17a
  empresa(empresaId: string): Promise<EmpresaListada | null>;
  sucursal(sucursalId: string): Promise<SucursalListada | null>;
  unidad(unidadId: string): Promise<UnidadListada | null>;
}
```

- Mismo mapeo que las listas. Filtran por `tenantId` del contexto, como `delTenant`, y la RLS repite la barrera.
- `ConsultarEmpresa`, `ConsultarSucursal` y `ConsultarUnidad` abren `unidadDeTrabajo.run` y lanzan `NotFoundError` con «La empresa no existe», «La sucursal no existe» o «La unidad no existe».

| Método y ruta | Permiso | Éxito | Errores |
| --- | --- | --- | --- |
| `GET /v1/org/empresas/:id` | `plat.organizacion.consultar` | 200, el mismo objeto que una fila de la lista | 403, 404 (inexistente, de otro tenant o id no UUID) |
| `GET /v1/org/sucursales/:id` | `plat.organizacion.consultar` | 200, ídem | ídem |
| `GET /v1/org/unidades/:id` | `plat.organizacion.consultar` | 200, ídem | ídem |

Un id de otro tenant responde 404. OpenAPI con `@ApiOkResponse` del DTO de fila y cada código de error.

### CORS (`apps/api/src/cors.ts`)

```ts
const ENCABEZADOS_PERMITIDOS = ['Authorization', 'Content-Type', 'X-Sucursal-Id'];
const METODOS_PERMITIDOS = ['GET', 'POST', 'PUT', 'DELETE'];

/** `ORIGENES_PERMITIDOS`: orígenes separados por coma. Vacío o ausente: sin CORS. */
function opcionesCors(valor: string | undefined): CorsOptions | null;
```

- Cada entrada se recorta y debe ser un origen exacto (`new URL(entrada).origin === entrada`). Una entrada inválida lanza un error al arrancar con el valor rechazado.
- `credentials: false`: la API recibe el token por `Authorization`, no por cookie.
- `.env.example`: `ORIGENES_PERMITIDOS=` con un ejemplo comentado (`https://admin.<dominio>,https://consola.<dominio>`).

### Front: `libs/plataforma/admin-cliente`

```
lib/models/empresa.ts              EmpresaRespuesta, Empresa, SolicitudEmpresa, mapeos
lib/models/sucursal.ts             SucursalRespuesta, Sucursal, SolicitudSucursal, mapeos
lib/models/unidad.ts               UnidadRespuesta, Unidad, SolicitudUnidad, AtributosUnidad, mapeos
lib/models/tipos-unidad.ts         TIPOS_UNIDAD, TIPO_ALMACEN, ETIQUETAS_TIPO_UNIDAD
lib/models/mensajes-organizacion.ts MENSAJES_ORGANIZACION
lib/services/empresas.cliente.ts   listar, consultar, registrar, editar
lib/services/sucursales.cliente.ts listar, consultar, registrar, editar, inactivar, reactivar, marcarPrincipal
lib/services/unidades.cliente.ts   listar, consultar, registrar, editar, inactivar, reactivar
lib/utils/ruc.ts                   copia de validarRuc
lib/utils/formulario-empresa.ts    FormGroup y mapeo a SolicitudEmpresa
lib/utils/formulario-sucursal.ts   FormGroup y mapeo a SolicitudSucursal
lib/utils/formulario-unidad.ts     FormGroup, validador de sucursal y fusión de atributos
lib/pages/empresas-lista/          empresa-formulario/
lib/pages/sucursales-lista/        sucursal-formulario/
lib/pages/unidades-lista/          unidad-formulario/
```

Cada página tiene `.page.ts` y `.page.html`. Solo se crea `.css` si hace falta. Cada página de formulario sirve para el alta y para la edición: el modo lo da la presencia del id en la ruta.

```ts
// models/sucursal.ts (camelCase; el cliente mapea desde snake_case)
interface Sucursal {
  id: string; empresaId: string; codigo: string; nombre: string;
  codigoEstablecimientoSunat: string | null; direccion: string | null; ubigeo: string | null;
  telefono: string | null; zonaHoraria: string; esPrincipal: boolean; activo: boolean; version: number;
}

// models/unidad.ts
interface AtributosUnidad { impresora?: string; capacidad?: number; piso?: string }
interface Unidad {
  id: string; empresaId: string; sucursalId: string | null; tipo: TipoUnidad; codigo: string; nombre: string;
  padreId: string | null; atributos: Record<string, unknown>; activo: boolean; version: number;
}

// models/permisos-admin.ts (se suman)
organizacionConsultar: 'plat.organizacion.consultar',
empresaCrear: 'plat.empresa.crear',
sucursalGestionar: 'plat.sucursal.gestionar',
unidadGestionar: 'plat.unidad.gestionar',
```

- `TIPOS_UNIDAD` repite la lista de `libs/plataforma/org/src/domain/unidad-operativa.ts` hasta el 19a. Una prueba fija sus valores.
- `reactivar` de sucursal y unidad envía `PUT` con los datos actuales de la fila, su `version` y `activo: true`.
- `fusionarAtributos(originales, campos)`: conserva las claves que no son `impresora`, `capacidad` ni `piso`, y omite los campos vacíos.

### Rutas (en `ADMIN_CLIENTE_ROUTES`, montadas bajo `/admin`)

| Ruta | Página | `permisoGuard` |
| --- | --- | --- |
| `/admin/empresas` | `EmpresasListaPage` | `plat.organizacion.consultar` |
| `/admin/empresas/nueva` | `EmpresaFormularioPage` | `plat.empresa.crear` |
| `/admin/empresas/:empresaId/editar` | `EmpresaFormularioPage` | `plat.empresa.crear` |
| `/admin/sucursales?empresa=&activo=&pagina=` | `SucursalesListaPage` | `plat.organizacion.consultar` |
| `/admin/sucursales/nueva?empresa=` | `SucursalFormularioPage` | `plat.sucursal.gestionar` |
| `/admin/sucursales/:sucursalId/editar` | `SucursalFormularioPage` | `plat.sucursal.gestionar` |
| `/admin/unidades?empresa=&sucursal=&tipo=&activo=&pagina=` | `UnidadesListaPage` | `plat.organizacion.consultar` |
| `/admin/unidades/nueva?empresa=&sucursal=` | `UnidadFormularioPage` | `plat.unidad.gestionar` |
| `/admin/unidades/:unidadId/editar` | `UnidadFormularioPage` | `plat.unidad.gestionar` |

Las rutas `nueva` van antes de las que llevan id.

### Pantallas

**Comunes:**

- Listas con `vit-tabla`, paginación de 20. Filtros y página en los query params. Los filtros son `mat-select` propios de la página, precargados desde la URL: la empresa no tiene opción «Todas» y no hay búsqueda por texto.
- El selector de empresa usa `OrganizacionCliente.empresas()`. Si la URL no trae `empresa`, la página elige la primera activa por razón social y la pone en la URL con `replaceUrl`. Sin empresas, `vit-estado-vacio` con enlace a «Nueva empresa».
- Acciones por fila con `vitAccionesFila` y `*siPermiso`. Sin el permiso de escritura no se ven los botones de alta, edición, inactivación, reactivación ni principal.
- Formularios con `vit-acciones-formulario` y `mensajeValidacion`. «Guardar» deshabilitado mientras viaja la petición.
- Los formularios piden con `OMITIR_AVISO_ERROR` los códigos que muestran ellos (`SOLICITUD_INVALIDA`, `CONFLICTO`, `VERSION_OBSOLETA`, `NO_ENCONTRADO`). Los muestran como alerta sobre el formulario con el `mensaje` de la API en texto plano. El resto lo avisa `erroresHttpInterceptor`.
- `VERSION_OBSOLETA` muestra `MENSAJES_ORGANIZACION.versionObsoleta` («Otro usuario modificó el registro; recargue») con un botón «Recargar». «Recargar» vuelve a pedir el registro por id y descarta lo editado.
- Edición con id inexistente (404): `vit-estado-vacio` con «La empresa no existe», «La sucursal no existe» o «La unidad no existe» y enlace a la lista.
- Éxito: aviso y vuelta a la lista con la empresa (y la sucursal, en unidades) en la URL.

**Empresas:**

- Lista: RUC, razón social, nombre comercial, ubigeo. Acciones: «Editar» (`plat.empresa.crear`) y «Sucursales» (enlace a `/admin/sucursales?empresa=<id>`). Botón «Nueva empresa».
- Formulario: `ruc` (11 dígitos y `validarRuc`, «RUC inválido»; solo lectura al editar), `razon_social` (1-200, obligatoria), `nombre_comercial` (0-150), `direccion_fiscal` (0-250), `ubigeo` (`^\d{6}$`, opcional).
- Alta exitosa: aviso «Empresa registrada con su sucursal principal 0000», recarga de `mi-contexto` y navegación a `/admin/sucursales?empresa=<empresa_id>`.

**Sucursales:**

- Filtros: empresa y estado (`Activas` por defecto, `Inactivas`, `Todas`).
- Columnas: código, nombre, establecimiento («Sin establecimiento» si es null), ubigeo, «Principal» como texto en la principal, estado.
- Acciones (`plat.sucursal.gestionar`):
  - «Editar».
  - «Marcar como principal» en activas no principales. `confirmarDestructiva` sin motivo con «<nueva> pasará a ser la principal y <actual> dejará de serlo. <actual> quedará sin establecimiento SUNAT; asígnele uno al editarla.». Al confirmar llama a `POST .../principal`.
  - «Inactivar» en activas. En la principal muestra la advertencia «Marque otra sucursal como principal antes de inactivar esta» y no envía nada. En las demás, `confirmarDestructiva` sin motivo con «¿Inactivar la sucursal <nombre>? Dejará de aparecer en el selector de sucursales.».
  - «Reactivar» en inactivas.
  - «Unidades» (enlace a `/admin/unidades?empresa=&sucursal=`) para todos.
- Botón «Nueva sucursal».
- Formulario: `codigo` (1-20), `nombre` (3-150), `codigo_establecimiento_sunat` (`^\d{4}$`, opcional), `direccion` (0-250), `ubigeo` (`^\d{6}$`, opcional), `telefono` (0-30), `zona_horaria` (texto, `America/Lima` por defecto).
- En la principal, el establecimiento se muestra fijo en `0000` y no se edita. En las demás, `0000` da «El establecimiento 0000 corresponde a la sucursal principal».
- La edición de una no principal sin establecimiento muestra la ayuda «Asigne el establecimiento SUNAT de esta sucursal».
- Tras alta, edición, inactivación, reactivación o cambio de principal, la página llama a `SesionService.cargarContexto(sucursalId)` con la sucursal actual. Si se inactivó la sucursal actual, llama sin sucursal y el shell pide elegir otra.
- Un `CONFLICTO` del alta (tope del plan, TR-CA-008) se muestra con el `mensaje` de la API.

**Unidades:**

- Filtros: empresa, sucursal («Todas» y las sucursales activas de la empresa), tipo y estado (`Activas` por defecto).
- Columnas: tipo (etiqueta), código, nombre, sucursal («Empresa» si `sucursal_id` es null), estado.
- Acciones (`plat.unidad.gestionar`): «Editar»; «Inactivar» en activas, con `confirmarDestructiva` sin motivo; «Reactivar» en inactivas. Botón «Nueva unidad».
- Formulario:
  - `tipo` (select, obligatorio) y `sucursal_id` (select con «Sin sucursal (nivel empresa)»). Los dos solo se eligen en el alta y se muestran en solo lectura al editar.
  - `sucursal_id` es obligatorio salvo para `ALMACEN`, con «Solo los almacenes pueden registrarse sin sucursal» (TR-CA-011).
  - `codigo` (1-20), `nombre` (3-150).
  - `padre_id` (select opcional, «Sin padre»). Ofrece las unidades activas de la misma empresa y de la sucursal elegida, o solo las de nivel empresa si no hay sucursal. Excluye la unidad editada. Se cargan con `GET /unidades?empresa_id=&sucursal_id=&activo=true&tamano=100`.
  - Atributos: `impresora` (0-100), `capacidad` (entero ≥ 0), `piso` (0-20), todos opcionales.

### U-06: sesión compartida y enlace de vuelta

```ts
// libs/shared/auth/src/lib/utils/navegacion.ts
export const PARAMETRO_VOLVER_A = 'volverA';
/** URL absoluta http(s) cuyo origen está en la lista blanca; si no, null (TR-RNF-012). */
export function urlDeVuelta(valor: string | null | undefined, origenesPermitidos: readonly string[]): string | null;

// libs/shared/shell/src/lib/config/volver-a.config.ts
/** origen exacto → nombre de la app que se muestra en «Volver a …». */
export type OrigenesVolverA = Readonly<Record<string, string>>;
export function provideVolverA(origenes: OrigenesVolverA): EnvironmentProviders;

// libs/shared/shell/src/lib/services/volver-a.service.ts
interface DestinoVolverA { url: string; nombreApp: string }
class VolverAService {
  readonly destino: Signal<DestinoVolverA | null>;
  limpiar(): void;
}
```

- `VolverAService` lee `volverA` en cada `NavigationEnd`. Si `urlDeVuelta` lo acepta, lo guarda en el signal y en `sessionStorage` (clave `vitrina.volverA`). Al iniciar lo restaura. Lecturas y escrituras de `sessionStorage` van con try/catch: si fallan, el enlace vive solo en memoria.
- Un `volverA` rechazado no cambia el destino guardado y no muestra enlace.
- `LayoutComponent` muestra en la barra un enlace `<a mat-button [href]>` «Volver a <nombreApp>» si hay destino. A menos de 768 px es un botón de ícono con `aria-label`.
- `MenuUsuarioComponent.salir()` llama a `VolverAService.limpiar()` antes de `sesion.salir()`.
- Sin `provideVolverA` la lista es vacía y nunca hay enlace.

Ambientes:

| Archivo | `dominioCookie` | `origenesVolverA` |
| --- | --- | --- |
| `plataforma-admin/.../environment.ts` | — | `{ 'http://127.0.0.1:4201': 'Consola de plataforma' }` |
| `plataforma-admin/.../environment.subdominios.ts` | `.vitrina.test` | `{ 'http://consola.vitrina.test:4201': 'Consola de plataforma' }` |
| `plataforma-admin/.../environment.prod.ts` | — | `{}` |
| `plataforma-consola/.../environment.ts` | — | `{ 'http://127.0.0.1:4200': 'Administración' }` |
| `plataforma-consola/.../environment.subdominios.ts` | `.vitrina.test` | `{ 'http://admin.vitrina.test:4200': 'Administración' }` |
| `plataforma-consola/.../environment.prod.ts` | — | `{}` |

- `project.json` de cada app: configuración `build:subdominios` (opciones de `development` más `fileReplacements` hacia `environment.subdominios.ts`) y `serve:subdominios` (`buildTarget` a esa configuración y `allowedHosts` con el subdominio de la app). `serve` por defecto no cambia.
- `app.config.ts` de cada app: `provideVolverA(environment.origenesVolverA)`.
- Pasos manuales del usuario antes de la verificación: `127.0.0.1 admin.vitrina.test` y `127.0.0.1 consola.vitrina.test` en `C:\Windows\System32\drivers\etc\hosts`; `http://admin.vitrina.test:4200/**` y `http://consola.vitrina.test:4201/**` en las URLs de retorno de Supabase dev.

## Plan de implementación

1. **Lecturas por id en org.**
   - Tres métodos en el puerto y el adaptador. `ConsultarEmpresa`, `ConsultarSucursal` y `ConsultarUnidad`, registrados en `org.module.ts` y exportados en `index.ts`.
   - Pruebas de integración (PGlite en local, PostgreSQL 16 en CI) en `organizacion.integracion.spec.ts`: devuelve la fila con su `version`; un id de otro tenant da null.
   - Pruebas Jest: el caso de uso lanza `NotFoundError` con su mensaje.
   - Verificar: `pnpm nx test org`.
2. **Endpoints `GET :id`.**
   - Un método por controlador con `@Permiso(plat.organizacion.consultar)`, `exigirUuid` y OpenAPI.
   - Pruebas supertest en `apps/api/test/organizacion.http.spec.ts`: 200 con el cuerpo snake_case; 404 de otro tenant y con id no UUID; 403 sin permiso.
   - Verificar: `pnpm nx test api` y las rutas en `/v1/docs`.
3. **CORS por variable.**
   - `apps/api/src/cors.ts` con su prueba: vacío da null; dos orígenes con espacios dan la lista recortada; `https://admin.x/ruta` lanza error. `main.ts` llama a `enableCors` solo con opciones. `.env.example`.
   - Verificar: `pnpm nx test api`; `nx serve api` sin la variable arranca igual que hoy.
4. **Modelos y clientes de organización.**
   - `empresa.ts`, `sucursal.ts`, `unidad.ts`, `tipos-unidad.ts`, `mensajes-organizacion.ts`, permisos en `permisos-admin.ts` y los tres clientes.
   - Pruebas con `HttpTestingController`: URL, query params, cuerpo snake_case, mapeo a camelCase; `reactivar` envía `activo: true` con la `version`; `TIPOS_UNIDAD` fija los nueve valores.
   - Verificar: `pnpm nx test plataforma-admin-cliente`.
5. **Utilidades de formulario.**
   - `ruc.ts` y los tres `formulario-*.ts`.
   - Pruebas: 20512345671 válido y 20512345678 inválido; ubigeo de 5 dígitos inválido; `0000` en una no principal inválido; `CONSULTORIO` sin sucursal da el error de TR-CA-011 y `ALMACEN` sin sucursal es válido; `fusionarAtributos` conserva `color` y omite `piso` vacío.
   - Verificar: `pnpm nx test plataforma-admin-cliente`.
6. **Empresas.**
   - `EmpresasListaPage`, `EmpresaFormularioPage` y sus tres rutas.
   - Pruebas: lista paginada; sin `plat.empresa.crear` no hay «Nueva empresa» ni «Editar»; alta envía el cuerpo y navega a sucursales con la empresa; `CONFLICTO` muestra el mensaje sin navegar; edición carga por id con RUC en solo lectura; `VERSION_OBSOLETA` muestra el texto y «Recargar» vuelve a pedir; 404 muestra «La empresa no existe»; doble clic envía una sola petición.
   - Verificar: `pnpm nx test plataforma-admin-cliente`.
7. **Lista de sucursales y sus acciones.**
   - `SucursalesListaPage` y su ruta.
   - Pruebas: sin `empresa` en la URL elige la primera y la escribe; la principal sale con «Principal»; inactivar la principal avisa y no envía; inactivar otra confirma, envía y recarga `mi-contexto`; cancelar no envía; marcar principal confirma y llama a `.../principal`; reactivar envía `PUT` con `activo: true`; sin `plat.sucursal.gestionar` no hay acciones de escritura.
   - Verificar: `pnpm nx test plataforma-admin-cliente`.
8. **Formulario de sucursal.**
   - `SucursalFormularioPage` y sus dos rutas.
   - Pruebas: alta sin `?empresa=` vuelve a la lista; en la principal el establecimiento queda fijo en `0000`; no principal sin establecimiento muestra la ayuda; el alta exitosa recarga `mi-contexto`; el `CONFLICTO` del tope se muestra; `VERSION_OBSOLETA` y 404 como en empresas.
   - Verificar: `pnpm nx test plataforma-admin-cliente`.
9. **Unidades.**
   - `UnidadesListaPage`, `UnidadFormularioPage` y sus tres rutas.
   - Pruebas: filtro por sucursal arma `sucursal_id`; una unidad de nivel empresa muestra «Empresa»; el select de padre no incluye la unidad editada; al editar, `tipo` y sucursal están en solo lectura; el envío arma `atributos` fusionados; inactivar confirma sin motivo; reactivar envía `activo: true`.
   - Verificar: `pnpm nx test plataforma-admin-cliente` y `pnpm nx build plataforma-admin`.
10. **`urlDeVuelta` y `VolverAService`.**
    - Función en `shared/auth` con pruebas: acepta `http://consola.vitrina.test:4201/consola/tenants`; rechaza `https://malo.test`, `javascript:alert(1)`, `//consola.vitrina.test:4201` y un origen con otro puerto.
    - `provideVolverA`, `VolverAService`, enlace en el layout y limpieza al salir, con pruebas: un `volverA` válido muestra «Volver a Consola de plataforma»; uno inválido no muestra nada; se restaura desde `sessionStorage`; `sessionStorage` que lanza no rompe; salir lo limpia.
    - Verificar: `pnpm nx run-many -t lint test -p shared-auth shared-shell`.
11. **Ambientes de las dos apps.**
    - `origenesVolverA` en los `environment` existentes, `environment.subdominios.ts`, configuraciones `subdominios` en `project.json` y `provideVolverA` en `app.config.ts`.
    - Verificar: `pnpm nx run-many -t lint test build -p plataforma-admin plataforma-consola` y `pnpm nx build plataforma-admin --configuration=subdominios`.
12. **Roadmap.**
    - Fila 17c de `docs/roadmap-specs.md`: «U-05 y U-06, front más `GET` por id de empresa, sucursal y unidad y CORS por variable», 9 h.
13. **Verificación en navegador** (MCP `playwright`, `nx serve api`, Supabase dev).
    - Con `nx serve plataforma-admin`, a 360, 768 y 1280 px, recorrer los criterios de organización con el propietario de un tenant cliente de prueba. Consola sin errores. axe-core en las seis pantallas. Capturas de cada una.
    - Para TR-CA-008 se fija `limite_sucursales = 2` en la suscripción de prueba por SQL (MCP `supabase`).
    - Con los pasos manuales del usuario hechos, `nx serve plataforma-admin --configuration=subdominios` y `nx serve plataforma-consola --configuration=subdominios`: ingreso en `consola.`, entrada en `admin.` sin volver a autenticarse, enlace «Volver a», `volverA` ajeno sin enlace, salir en una y recargar la otra.
    - Al final se borran por SQL las empresas, sucursales y unidades de prueba y se restaura `limite_sucursales`. Evidencia en `docs/ops/supabase-ambientes.md`.

## Criterios de aceptación

**API (supertest):**

- [ ] `GET /v1/org/empresas/:id`, `/sucursales/:id` y `/unidades/:id` responden 200 con los mismos campos y `version` que la fila de la lista.
- [ ] Un id de otro tenant o un id no UUID responde 404 `NO_ENCONTRADO`, como los demás endpoints de org (`exigirUuid` del 17a).
- [ ] Sin `plat.organizacion.consultar` las tres rutas responden 403.
- [ ] Con `ORIGENES_PERMITIDOS=https://admin.x,https://consola.x`, un preflight desde `https://admin.x` recibe `Access-Control-Allow-Origin: https://admin.x` y uno desde `https://otro.x` no lo recibe. Sin la variable no hay encabezados CORS.

**Empresas:**

- [ ] TR-CA-004 (adaptado): registrar RUC 20512345671 con razón social «Sabores del Sur SAC» deja la empresa activa y la lista de sus sucursales muestra la principal con establecimiento `0000`.
- [ ] TR-CA-005: registrar otra vez 20512345671 muestra «La empresa ya está registrada en este tenant» y no navega.
- [ ] Con RUC 20512345678 el formulario muestra «RUC inválido» y no envía (TR-RN-002).
- [ ] Al editar, el RUC no se puede cambiar.
- [ ] Si otro usuario guardó antes, guardar muestra «Otro usuario modificó el registro; recargue» y la API conserva lo del otro usuario. «Recargar» trae los datos nuevos (TR-RNF-008).

**Sucursales:**

- [ ] Con «Centro» (principal) y «Cayma», la lista de «Sabores del Sur SAC» muestra las dos, «Centro» con «Principal» y el establecimiento de cada una.
- [ ] TR-CA-007: con un plan de 3, registrar «Cayma» con establecimiento 0002 y ubigeo 040103 la deja activa, y el selector de sucursales la muestra sin cerrar sesión (tras recargar `mi-contexto`, con la caché de 60 s aceptada).
- [ ] TR-CA-008: con `limite_sucursales = 2` y 2 activas, registrar una tercera muestra «Su plan permite 2 sucursales; amplíe su plan».
- [ ] TR-CA-009: marcar «Cayma» como principal, tras confirmar, deja «Cayma» con «Principal» y `0000`, y «Centro» sin principal y con «Sin establecimiento».
- [ ] Editar «Centro» después muestra la ayuda para asignar establecimiento, y `0000` se rechaza con su mensaje.
- [ ] Intentar inactivar la principal muestra «Marque otra sucursal como principal antes de inactivar esta», no llama a la API y la sucursal sigue activa.
- [ ] Inactivar «Centro» (no principal) y confirmar la saca de la lista de activas y del selector de sucursales. Cancelar no envía nada.
- [ ] «Reactivar» la devuelve a activa y al selector.
- [ ] Sin `plat.sucursal.gestionar` no se ven alta, edición, principal, inactivación ni reactivación, y la API responde 403 si se llaman.

**Unidades:**

- [ ] TR-CA-010: registrar en «Cayma» la unidad `CAJA` con código «CAJA-01» la deja activa en esa sucursal.
- [ ] TR-CA-011: elegir `CONSULTORIO` sin sucursal muestra «Solo los almacenes pueden registrarse sin sucursal» y no envía.
- [ ] TR-CA-012: registrar un `ALMACEN` sin sucursal en «Sabores del Sur SAC» lo deja activo, y la lista con sucursal «Todas» lo muestra con «Empresa».
- [ ] Con «SALON-1» en «Cayma», registrar una unidad con padre «SALON-1» la deja bajo ese padre, y su edición muestra «SALON-1» elegido. El select de padre solo ofrece unidades de la misma empresa.
- [ ] Atributos `impresora` y `capacidad` se guardan, y una clave que no es de esos tres campos sigue en la unidad después de editarla.
- [ ] Inactivar pide confirmación sin motivo y «Reactivar» la devuelve a activa.

**U-06:**

- [ ] Con hosts y Supabase dev listos, ingresar en `http://consola.vitrina.test:4201` y abrir `http://admin.vitrina.test:4200/admin/empresas` entra sin pedir credenciales.
- [ ] La cookie de sesión tiene `Domain=.vitrina.test` en las configuraciones `subdominios`. En la configuración por defecto, la cookie es del host, sin atributo `Domain`.
- [ ] `http://admin.vitrina.test:4200/admin/usuarios?volverA=http://consola.vitrina.test:4201/consola/tenants` muestra «Volver a Consola de plataforma» y el enlace lleva a esa URL. El enlace sobrevive a recargar la página.
- [ ] Con `volverA=https://malo.test/` no se muestra enlace.
- [ ] Salir en `admin.` y recargar `consola.` lleva al ingreso. Al revés, igual (TR-RNF-014).

**Calidad y estructura:**

- [ ] `admin-cliente` sigue con tags `type:feature` y `scope:plataforma`, exporta solo `ADMIN_CLIENTE_ROUTES` e importa solo de `shared/*`. No importa `libs/plataforma/org`.
- [ ] Las pantallas nuevas se usan a 360, 768 y 1280 px sin scroll horizontal de página. axe-core sin `critical` ni `serious`.
- [ ] Sin colores fijos: solo tokens de `shared/ui` y utilidades de Tailwind.
- [ ] Ningún componente usa `template` ni `styles` inline. No hay archivos `.css` vacíos.
- [ ] El código nuevo sigue la sección «Código limpio» de `CLAUDE.md`. `code-simplifier` pasó sobre los archivos modificados.
- [ ] `pnpm nx affected -t lint test build` en verde.
- [ ] Verificación con el MCP `playwright` hecha, con consola sin errores y capturas de las seis pantallas. Los datos de prueba de dev se borraron y `limite_sucursales` quedó como estaba.

## Decisiones

- **Sí:** U-05 y U-06 en un solo spec, más de 7 h y tres áreas (decisión del usuario). No se recorta nada; se suman pasos.
- **No:** partir en 17c (organización) y 17d (U-06).
- **Sí:** `GET` por id de empresa, sucursal y unidad en la API (decisión del usuario). La edición carga con una sola petición y funciona al recargar.
- **Sí:** un id no UUID responde 404, como `exigirUuid` del 17a (decisión del usuario, paso 2). Los endpoints de org quedan coherentes.
- **No:** buscar el registro recorriendo la lista del padre. Hace peticiones de más y falla con más de 100 filas.
- **No:** pasar la fila por el estado del router. Se pierde al recargar.
- **Sí:** `/admin/sucursales?empresa=` y `/admin/unidades?empresa=&sucursal=` (decisión del usuario). Coinciden con el menú del manifiesto `1.6.0`, que no se toca.
- **No:** `/admin/empresas/:id/sucursales`. Obliga a cambiar el manifiesto o a redirigir.
- **Sí:** formularios en páginas propias, una por entidad para alta y edición (decisión del usuario). Mismo patrón que roles y consola.
- **No:** `MatDialog`. Ningún spec lo usa y las pruebas son más pesadas.
- **Sí:** «Reactivar» sucursal y unidad con `PUT { activo: true }` (decisión del usuario). La API ya lo permite y evita registros sin salida desde la UI.
- **Sí:** atributos de unidad con tres campos fijos (`impresora`, `capacidad`, `piso`) y las demás claves conservadas (decisión del usuario).
- **No:** editor JSON libre. Sin esquema por tipo hasta el 19a.
- **Sí:** recargar `mi-contexto` tras cada cambio de sucursal y tras el alta de empresa (decisión del usuario). Se acepta el retraso de la caché de 60 s.
- **Sí:** inactivar con `confirmarDestructiva` sin motivo (decisión del usuario). El 03 no guarda motivo.
- **Sí:** inactivar la principal se frena en el cliente con el mensaje del dominio, sin llamar a la API. La API repite la regla.
- **Sí:** `VERSION_OBSOLETA` con el texto de TR-RNF-008 y botón «Recargar», en vez del `mensaje` de la API. El GWT propuesto fija ese texto.
- **Sí:** CORS por `ORIGENES_PERMITIDOS`, apagado sin la variable (decisión del usuario). En local no aplica por el proxy `/v1`.
- **Sí:** `credentials: false` en CORS. El token viaja en `Authorization`.
- **Sí:** parámetro aparte `volverA` con lista blanca de orígenes por ambiente (decisión del usuario). `returnUrl` sigue solo para rutas internas.
- **No:** ampliar `rutaDeRetorno`. Mezcla dos usos en un código sensible a la redirección abierta.
- **Sí:** `urlDeVuelta` en `shared/auth`, junto a `rutaDeRetorno`, y `VolverAService` con el enlace en la barra de `shared/shell` (decisión del usuario). Sirve a las dos apps.
- **Sí:** destino de vuelta en `sessionStorage` (decisión del usuario). Sobrevive a recargar, se borra al cerrar la pestaña o al salir y no guarda datos personales.
- **Sí:** verificar la sesión compartida con hosts locales y configuraciones `subdominios` (decisión del usuario). `127.0.0.1` con dos puertos ya comparte cookie y no prueba el atributo `domain`.
- **No:** valores de staging y prod ahora. No hay dominio decidido; los llena el spec de despliegue.
- **Sí:** copiar `validarRuc` en `admin-cliente/src/lib/utils/ruc.ts` (decisión del usuario), por la misma razón que el 17b (ng-packagr).
- **Sí:** `TIPOS_UNIDAD` repetida en el front con una prueba que fija los valores, hasta el 19a.
- **Sí:** clientes nuevos por entidad y `OrganizacionCliente` sin cambios. Cada clase tiene un solo motivo de cambio.
- **Sí:** filtros con `mat-select` propios en vez de `vit-filtros` (decisión del usuario, paso 7). `vit-filtros` siempre trae búsqueda y «Todos», y aquí la empresa es obligatoria y la API no busca por texto.
- **No:** ampliar `vit-filtros` en `shared/ui`. Toca una lib compartida del 15 por dos listas.
- **No:** columna de padre en la lista de unidades. La lista solo trae `padre_id`, y mostrar el código pediría otra petición. El padre se ve en la edición.
- **Sí:** razón social escrita a mano (TR-CA-004 adaptado). El padrón es de R2.

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| La cookie no es `httpOnly` y con `Domain=.<dominio>` un XSS en cualquier subdominio lee la sesión | Los sitios públicos de tenants (CMS, R3) no viven bajo el mismo dominio padre. Se anota para el spec de despliegue. |
| Supabase guarda la sesión en memoria y la otra app sigue autenticada tras salir, hasta recargar | El criterio exige recargar. Si en el paso 13 la otra app sigue entrando después de recargar, se dice en el cierre y se abre un spec para revalidar la sesión al volver el foco. |
| Las URLs de `vitrina.test` no están en Supabase dev o falta el archivo hosts | Pasos manuales del usuario antes del paso 13. Si faltan, U-06 no se da por verificada y se dice en el cierre. |
| El navegador rechaza `Domain=.vitrina.test` | `.test` no está en la lista de sufijos públicos. Si falla, se prueba con `127.0.0.1` y se anota que el atributo `domain` quedó sin verificar. |
| `mi-contexto` no muestra la sucursal nueva por la caché de 60 s (brecha 2) | Se acepta. La verificación espera hasta 60 s antes de dar el criterio por fallido. |
| `TIPOS_UNIDAD` del front se desfasa de ORG | Una prueba fija la lista. El back rechaza con 400 y el formulario muestra el mensaje. |
| El MCP `playwright` no conecta (falló al redactar este spec) | Se reintenta al llegar al paso 13. Si no conecta, se dice en el cierre y la UI no se da por verificada. |
| Inactivar la sucursal de trabajo deja el contexto inválido | La página recarga `mi-contexto` sin sucursal y el shell pide elegir otra. |

## Lo que **no** está en este spec

- Inactivar empresa.
- Padrón RUC y NO HABIDO (R2).
- Catálogos `UBIGEO` y `TIPO_UNIDAD` (19a) y esquema de atributos por tipo.
- Motivo de inactivación e invalidación de la caché de permisos.
- Parámetros, series, catálogos propios y visor de auditoría.
- Enlace de la consola hacia `admin.` en el menú.
- Valores de staging y prod, y montaje en SazónPOS (23, 26).
- Archivo hosts y URLs de retorno en Supabase dev (manual, del usuario).
- Mover `validarRuc` a una lib compartida.
- E2E multinavegador y axe en CI (27).

Cada uno, si llega, va en su propio spec.
