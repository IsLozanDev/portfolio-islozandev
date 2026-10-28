# SPEC 17b — Consola de plataforma: app `plataforma-consola` con lista, detalle, alta y cambio de estado de tenants

> **Status:** Aprobado
> **Depends on:** SPEC 13, SPEC 15, SPEC 16a, SPEC 17a
> **Date:** 2026-10-28
> **Objective:** Crear la app `apps/plataforma-consola`, con MFA obligatorio en toda la app, y la lib `libs/plataforma/consola-tenants` para listar, consultar, dar de alta con asistente y cambiar el estado de tenants sobre la API del 12 y el 17a (O-04).

## Por qué existe este spec

Fila 17b de `docs/roadmap-specs.md`. Contexto: `docs/spec-context/17b-consola-plataforma.md`. Historia **O-04** (sprint 2, 5 h de front). Es solo front: el back lo dejaron el 12 (`POST /v1/org/tenants`) y el 17a (lista, detalle, cambio de estado, permisos y opciones de menú en el manifiesto PLAT `1.6.0`).

Lo que hay en el código hoy (revisado al redactar):

- Solo existe `apps/plataforma-admin` (puerto 4200, proxy `/v1` a `127.0.0.1:3000`, tags `scope:app`, `type:app`). Monta `ADMIN_CLIENTE_ROUTES` bajo `admin` dentro de `rutasDelShell`.
- `rutasDelShell(hijas, nombreApp)` no filtra el menú. `LayoutComponent` arma el árbol con `construirArbolMenu(contexto.menu)`. Un operador ve a la vez las opciones `/admin/...` y `/consola/tenants`.
- El manifiesto PLAT `1.6.0` declara `plat.consola` (módulo «Consola») y `plat.consola.tenants` con ruta `/consola/tenants` y permiso `plat.tenant.consultar`. Todas las demás opciones empiezan por `/admin/`.
- `AccionSensibleService` (step-up antes de una acción sensible) vive en `libs/plataforma/admin-cliente/src/lib/services/`. Usa `SesionService`, `CONFIG_AUTH`, `PARAMETRO_RETORNO` y `AvisosService`. `shared/auth` es `type:data-access` y no puede importar `shared/ui` (`type:ui`).
- `aal2Guard` (spec 13) exige sesión aal2. La recencia de 15 min la valida la API (`MFA_REQUERIDA`).
- `confirmarDestructiva` ya acepta `longitudMinimaMotivo` (16a). Por defecto 10, igual que ORG.
- `validarRuc` está en `libs/shared/util` (spec 03).
- `libs/shared/contracts` existe y está vacía. `admin-cliente` repite sus DTO en `models/`.

RF cubiertos:

- **TR-RF-001** dar de alta un tenant con asistente (UI sobre `POST /v1/org/tenants`).
- **TR-RF-006** cambiar estado del tenant (UI sobre `POST /v1/org/tenants/:id/estado`).

Criterios del SRS: **TR-CA-001**, **002**, **003** y **016**, **017**, **018**, en lo que toca a la UI. Los propuestos de la sección 3 del contexto entran como criterios propios.

Reglas: **TR-RN-002** (RUC módulo 11 en cliente), **TR-RN-005** (solo destinos válidos), **TR-RN-009** (consola entera con aal2).

RNF propios:

- **TR-RNF-029**: alta en menos de 15 min con el asistente. Prueba cronometrada manual del usuario.
- **TR-RNF-021**: todo cambio de estado pide confirmación y motivo (mínimo 10).
- **TR-RNF-008**: botón de envío deshabilitado mientras viaja la petición.
- **TR-RNF-014**: inactividad de 30 min del 13, sin cambios.
- **TR-RNF-018**: usable a 360, 768 y 1280 px, textos en español de Perú.
- **TR-RNF-019**: axe-core sin `critical` ni `serious` en las pantallas nuevas.
- **TR-RNF-122**: sin colores fijos, solo tokens de `shared/ui`.

RNF heredados: 010, 011, 012, 024/119, 026, 101.

Estimado: 7-7,5 h. El roadmap da 7. Si se pasa, se recorta primero el filtro por producto de la lista.

## Alcance

**In:**

- **`apps/plataforma-consola`** (nueva, `scope:app`, `type:app`): copia de la configuración de `plataforma-admin`, puerto **4201**, el mismo proxy `/v1`, `nombreApp` «Consola de plataforma», `aal2Guard` sobre todas las rutas de la consola y el menú filtrado por `/consola`.
- **`libs/plataforma/consola-tenants`** (nueva, `scope:plataforma`, `type:feature`): cliente HTTP, modelos, páginas de lista, detalle y alta, borrador del alta y `CONSOLA_TENANTS_ROUTES`.
- **`libs/shared/ui`:** input opcional `valorInicial` en `vit-filtros` para precargar búsqueda y selecciones sin emitir.
- **`libs/shared/shell`:**
  - Tercer parámetro opcional `prefijoMenu` en `rutasDelShell`. El layout muestra solo las opciones cuya ruta empieza por ese prefijo.
  - `AccionSensibleService` se mueve aquí desde `admin-cliente`, con sus mensajes en `MENSAJES_SHELL`.
- **`apps/plataforma-admin`:** pasa `'/admin'` como `prefijoMenu`.
- **`libs/plataforma/admin-cliente`:** importa `AccionSensibleService` desde `@vitrina/shared/shell` y borra su copia y sus mensajes de MFA.
- **Pruebas:** Vitest con `TestBed` zoneless y `HttpTestingController`, y verificación en navegador con el MCP `playwright` contra Supabase dev.

**Out of scope (para otros specs):**

- Backend. No se toca `apps/api` ni el manifiesto (sigue en `1.6.0`).
- Edición de la suscripción (RF-005). El detalle la muestra en solo lectura. Spec aparte de unas 3 h.
- Catálogos globales (19b), eventos fallidos (sin historia de UI en R1), salud (21), visor de auditoría y sesión compartida entre `consola.` y `admin.` (17c, U-06).
- Padrón RUC y advertencia NO HABIDO (TR-IDN, R2).
- Selector de tenant (`PUT /v1/seg/mi-tenant`).
- Correo al propietario al suspender y «solo consultar y pagar» de TR-CA-016 (R2 y spec 07).
- Registrar `127.0.0.1:4201` en las URLs de retorno de Supabase dev. Es manual en el panel y lo hace el usuario.
- Mover los DTO a `libs/shared/contracts`.
- E2E multinavegador y axe en CI (27).

## Base de código reutilizada

**Se conserva sin cambios:**

- Spec 13: `SesionService`, `aal2Guard`, `permisoGuard`, `*siPermiso`, `authInterceptor` con step-up, `OMITIR_AVISO_ERROR`, `provideAuth`, inactividad.
- Spec 14: `AUTH_UI_ROUTES` (`/auth`, incluida `/auth/mfa?returnUrl`).
- Spec 15: `LayoutComponent`, `vit-tabla`, `vit-filtros`, `vit-acciones-formulario`, `mensajeValidacion`, `vit-cargando`, `vit-estado-vacio`, `AvisosService` (`exito`, `advertencia`, `confirmarDestructiva`), `erroresHttpInterceptor`, páginas 403 y 404.
- Spec 03: `validarRuc` de `libs/shared/util`.
- Spec 12 y 17a: contratos HTTP tal cual.

**Cambia:**

- `libs/shared/shell/src/lib/shell.routes.ts`: `rutasDelShell(hijas, nombreApp?, prefijoMenu?)`. Guarda el prefijo en `data` con una clave nueva `CLAVE_PREFIJO_MENU` (en `models/datos-ruta-shell.ts`).
- `libs/shared/shell/src/lib/components/layout/layout.component.ts`: filtra el menú plano por prefijo antes de `construirArbolMenu`. La función pura `filtrarMenuPorPrefijo` va en `utils/arbol-menu.ts`.
- `AccionSensibleService` pasa de `libs/plataforma/admin-cliente/src/lib/services/` a `libs/shared/shell/src/lib/services/`, con su prueba. `tituloMfaRequerida` y `mfaRequerida` pasan de `MENSAJES_ADMIN` a `MENSAJES_SHELL`. `admin-cliente` conserva `MFA_REQUERIDA` en su mapa de errores, apuntando al texto de `MENSAJES_SHELL`.
- `libs/shared/shell/src/index.ts`: exporta `AccionSensibleService`.
- `apps/plataforma-admin/src/app/app.routes.ts`: `rutasDelShell([...], undefined, '/admin')`.

## Modelo de datos

Este spec no crea tablas ni endpoints. Los tipos del front repiten los DTO del 12 y el 17a en `models/`, como hizo el 16a.

### Front, `libs/plataforma/consola-tenants`

```
libs/plataforma/consola-tenants/src/
  index.ts                         export { CONSOLA_TENANTS_ROUTES } (ruta explícita)
  lib/consola-tenants.routes.ts
  lib/models/tenant.ts             EstadoTenant, TenantListado, TenantDetalle, SuscripcionResumen, CambioEstado*
  lib/models/alta-tenant.ts        SolicitudAltaTenant, RespuestaAltaTenant
  lib/models/catalogos.ts          PRODUCTOS, PLANES, MODALIDADES, ESTADOS_TENANT, TRANSICIONES_TENANT
  lib/models/listado.ts            Listado<T>, TAMANO_PAGINA
  lib/models/permisos-consola.ts   PERMISOS_CONSOLA
  lib/models/mensajes-consola.ts   MENSAJES_CONSOLA
  lib/services/tenants.cliente.ts  listar, consultar, crear, cambiarEstado
  lib/services/borrador-alta.service.ts
  lib/utils/formulario-alta.ts     construcción del FormGroup y mapeo a SolicitudAltaTenant
  lib/pages/tenants-lista/tenants-lista.page.{ts,html}
  lib/pages/tenant-detalle/tenant-detalle.page.{ts,html}
  lib/pages/tenant-alta/tenant-alta.page.{ts,html}
  testing/                         dobles de sesión y arnés HTTP
```

Solo se crea `.css` si un componente lo necesita.

```ts
// models/catalogos.ts — repetidos de libs/plataforma/org (type:backend, no importable)
export const PRODUCTOS = ['REST', 'PSI', 'COL', 'LIB', 'GYM', 'CLI', 'DOC', 'ECO', 'LEX'] as const;
export const PLANES = ['BASICO', 'PRO', 'EMPRESA'] as const;
export const MODALIDADES = ['PRUEBA', 'ACTIVO'] as const;
export const ESTADOS_TENANT = ['PRUEBA', 'ACTIVO', 'SUSPENDIDO', 'BAJA'] as const;
export const TRANSICIONES_TENANT: Readonly<Record<EstadoTenant, readonly EstadoTenant[]>> = {
  PRUEBA: ['ACTIVO', 'SUSPENDIDO', 'BAJA'],
  ACTIVO: ['SUSPENDIDO', 'BAJA'],
  SUSPENDIDO: ['ACTIVO', 'BAJA'],
  BAJA: [],
};

// models/tenant.ts (camelCase; el cliente mapea desde snake_case)
interface SuscripcionResumen { productoCodigo: string; plan: string; estado: string; vigenteHasta: string | null }
interface TenantListado { id: string; codigo: string; nombre: string; estado: EstadoTenant; creadoEn: string; suscripciones: SuscripcionResumen[] }
interface TenantDetalle extends TenantListado {
  estadoMotivo: string | null; estadoCambiadoEn: string | null; version: number;
  empresaPrincipal: { id: string; ruc: string; razonSocial: string } | null;
  historial: { estadoAnterior: EstadoTenant; estadoNuevo: EstadoTenant; motivo: string; fechaEfectiva: string; registradoEn: string }[];
}

// models/alta-tenant.ts
interface RespuestaAltaTenant { tenantId: string; estado: EstadoTenant; usuarioNuevo: boolean; correoEnviado: boolean }
```

- `TRANSICIONES_TENANT` repite la matriz de `libs/plataforma/org/src/domain/tenant.ts`. Una prueba de `consola-tenants` fija los valores; si ORG cambia, el back rechaza con 409 y la prueba de la matriz se ajusta.
- `PERMISOS_CONSOLA`: `tenantConsultar = 'plat.tenant.consultar'`, `tenantCrear = 'plat.tenant.crear'`, `tenantCambiarEstado = 'plat.tenant.cambiar_estado'`.

### `BorradorAltaService`

- `@Injectable({ providedIn: 'root' })` con un `signal` del valor del formulario de alta (`Partial<SolicitudAltaTenant>` más el paso activo).
- Se guarda al cambiar de paso y justo antes de enviar. La página lo restaura al iniciar y lo borra tras un alta exitosa o al pulsar «Cancelar».
- Vive solo en memoria. Sobrevive a la navegación interna a `/auth/mfa` y vuelta. Un recargo del navegador lo pierde.
- No guarda nada en `localStorage` ni `sessionStorage` (el correo del propietario es dato personal).

### Rutas

`apps/plataforma-consola/src/app/app.routes.ts`:

```ts
[
  { path: 'auth', loadChildren: AUTH_UI_ROUTES },
  ...rutasDelShell([
    { path: '', pathMatch: 'full', redirectTo: 'consola/tenants' },
    { path: 'consola', canActivate: [aal2Guard], loadChildren: CONSOLA_TENANTS_ROUTES },
  ], MENSAJES_CONSOLA_APP.nombre, '/consola'),
]
```

`CONSOLA_TENANTS_ROUTES`:

| Ruta | Página | Guard |
| --- | --- | --- |
| `/consola` | `redirectTo: 'tenants'` | — |
| `/consola/tenants` | `TenantsListaPage` | `permisoGuard(plat.tenant.consultar)` |
| `/consola/tenants/nuevo` | `TenantAltaPage` | `permisoGuard(plat.tenant.crear)` |
| `/consola/tenants/:id` | `TenantDetallePage` | `permisoGuard(plat.tenant.consultar)` |

- `aal2Guard` corre antes de activar el layout. Con aal1 se va a `/auth/mfa?returnUrl=...` sin pintar ninguna pantalla de la consola.
- `/consola/tenants/nuevo` va antes de `:id`.

### Pantallas

**Lista (`/consola/tenants`):**

- `vit-filtros` con búsqueda `q` (código o nombre), `estado` (`ESTADOS_TENANT`) y `producto` (`PRODUCTOS`). Los filtros y la página van en los query params de la URL.
- `vit-tabla` con código, nombre, estado (texto), suscripciones (producto y plan) y fecha de creación (`dd/MM/yyyy`). Paginación de 20. Cada fila tiene un enlace › al detalle (`vitAccionesFila`, como la lista de usuarios del 16a): `vit-tabla` no emite el clic de fila.
- `vit-filtros` precarga sus controles desde la URL con el input nuevo `valorInicial`.
- Botón «Nuevo tenant» con `*siPermiso="plat.tenant.crear"`. Antes de navegar llama a `AccionSensibleService.exigirMfa()`.
- `vit-cargando` mientras carga y `vit-estado-vacio` sin resultados.

**Detalle (`/consola/tenants/:id`):**

- Cabecera: código, nombre, estado, motivo y fecha del último cambio.
- Suscripciones en solo lectura: producto, plan, estado y `vigente_hasta`.
- Empresa principal: RUC y razón social.
- Historial de estados, del más reciente al más antiguo.
- Acciones con `*siPermiso="plat.tenant.cambiar_estado"`: un botón por cada destino de `TRANSICIONES_TENANT[estado]`, con texto «Activar», «Suspender» o «Dar de baja». En `BAJA` no hay botones.
- Cada botón llama primero a `AccionSensibleService.exigirMfa()`. Luego abre `confirmarDestructiva` con `pedirMotivo: true`, título y texto según el destino, sin `longitudMinimaMotivo` (default 10). Al confirmar envía `{ estado, motivo }`, avisa el éxito y recarga el detalle. Con `cambiado: false` avisa que el tenant ya estaba en ese estado.
- 404 muestra `vit-estado-vacio` con «El tenant no existe» y enlace a la lista.

**Alta (`/consola/tenants/nuevo`):**

- Al iniciar llama a `AccionSensibleService.exigirMfa()` y restaura el borrador.
- `MatStepper` lineal de dos pasos:
  - **Paso 1, tenant y suscripción:** `codigo` (3-30, `^[a-z0-9]+(-[a-z0-9]+)*$`), `nombre` (3-150), `producto_codigo` (select), `plan` (select), `modalidad` (`PRUEBA` por defecto) y `vigente_hasta` (datepicker, obligatorio solo si `ACTIVO`).
  - **Paso 2, empresa y propietario:** `ruc` (11 dígitos y `validarRuc`, mensaje «RUC inválido»), `razon_social` (1-200), `nombre_comercial` (opcional), `correo_propietario` (email) y `nombre_propietario`.
- No se avanza de paso ni se envía con un campo inválido.
- «Crear tenant» guarda el borrador, vuelve a llamar a `exigirMfa()` y envía. El botón queda deshabilitado mientras viaja la petición.
- Éxito: borra el borrador, navega a `/consola/tenants/:tenant_id` y avisa «Tenant creado». Con `correo_enviado: false` el aviso es de advertencia: «El tenant se creó, pero no se pudo enviar el correo al propietario».
- `TENANT_DUPLICADO` (409): vuelve al paso 1 y muestra en `codigo` «El código de tenant ya existe».
- `RUC_INVALIDO` y `SOLICITUD_INVALIDA` (400): muestra el `mensaje` de la API como texto plano en el paso que corresponda.
- Esos tres códigos se piden con `OMITIR_AVISO_ERROR`. `IDENTIDAD_NO_DISPONIBLE`, `OPERADOR_REQUERIDO` y el resto los avisa `erroresHttpInterceptor`.
- Si la API responde `MFA_REQUERIDA`, el interceptor del 13 navega a `/auth/mfa?returnUrl=/consola/tenants/nuevo`. Al volver, el formulario se restaura desde el borrador.

### Menú por app

```ts
// libs/shared/shell/src/lib/utils/arbol-menu.ts
export function filtrarMenuPorPrefijo(menu: readonly OpcionMenu[], prefijo: string | undefined): OpcionMenu[]
```

- Sin prefijo devuelve el menú entero (compatibilidad).
- Con prefijo conserva las opciones con `ruta === null` (agrupadores) y las que empiezan por el prefijo. `construirArbolMenu` ya descarta los agrupadores que quedan sin hijos.

## Plan de implementación

1. **Mover `AccionSensibleService` a `shared/shell`.**
   - Servicio y prueba a `libs/shared/shell/src/lib/services/`. Mensajes a `MENSAJES_SHELL`. Export en `index.ts`.
   - `admin-cliente` importa desde `@vitrina/shared/shell` y borra su copia.
   - Verificar: `pnpm nx run-many -t lint test build -p shared-shell plataforma-admin-cliente plataforma-admin`.
2. **Menú por prefijo.**
   - `filtrarMenuPorPrefijo` con sus pruebas, `CLAVE_PREFIJO_MENU`, tercer parámetro de `rutasDelShell` y filtro en `LayoutComponent`.
   - `plataforma-admin` pasa `'/admin'`.
   - Pruebas: con prefijo `/admin` no aparece «Consola»; con `/consola` solo aparece «Consola > Tenants»; sin prefijo, igual que hoy.
   - Verificar: `pnpm nx run-many -t lint test -p shared-shell plataforma-admin`.
3. **App `plataforma-consola`.**
   - Generador Nx de app Angular con los mismos ajustes que `plataforma-admin`: tags `scope:app` y `type:app`, Tailwind 4 (`.postcssrc.json`, `tailwind.css`), `styles.scss` del tema, SweetAlert, `environment` con `provideAuth`, interceptores, proxy `/v1`, puerto 4201 en `serve` y `serve-static`.
   - Rutas con `/auth`, `rutasDelShell` y `aal2Guard` sobre `consola` (página de lista vacía provisional).
   - Verificar: `pnpm nx run-many -t lint test build -p plataforma-consola`. `nx serve plataforma-consola` abre en 4201.
4. **Lib `consola-tenants`: base y cliente.**
   - Generador Nx con tags `type:feature` y `scope:plataforma`, alias `@vitrina/plataforma/consola-tenants`, `index.ts` y `consola-tenants.routes.ts`.
   - `models/`, `TenantsCliente` con mapeo snake_case ↔ camelCase y sus pruebas con `HttpTestingController`.
   - Verificar: `pnpm nx run-many -t lint test build -p plataforma-consola-tenants`.
5. **Lista.**
   - `TenantsListaPage` con filtros en la URL, paginación y botón «Nuevo tenant».
   - Pruebas: filtro `SUSPENDIDO` arma `estado=SUSPENDIDO`; sin `plat.tenant.crear` no hay botón; sin MFA vigente el botón navega a `/auth/mfa`.
6. **Detalle y cambio de estado.**
   - `TenantDetallePage` con suscripciones, empresa principal, historial y botones por destino.
   - Pruebas: `PRUEBA` muestra tres botones, `ACTIVO` dos, `SUSPENDIDO` dos, `BAJA` ninguno; motivo de 5 caracteres no habilita confirmar; confirmar envía `{ estado, motivo }` y recarga; cancelar no envía; sin `plat.tenant.cambiar_estado` no hay botones; 404 muestra el estado vacío.
7. **Alta con asistente.**
   - `formulario-alta.ts`, `BorradorAltaService` y `TenantAltaPage` con `MatStepper`.
   - Pruebas: código con mayúsculas o espacios no avanza; RUC 20601234560 muestra «RUC inválido» y no avanza; `ACTIVO` exige `vigente_hasta`; envío arma el cuerpo snake_case; 409 vuelve al paso 1 con el mensaje en `codigo`; `correo_enviado: false` avisa con advertencia; el borrador se restaura al reabrir la página y se borra tras el éxito; doble clic envía una sola petición.
8. **Verificación en navegador** (MCP `playwright`, `nx serve api` y `nx serve plataforma-consola`, Supabase dev con `127.0.0.1:4201` ya registrada por el usuario).
   - Recorrer los criterios de UI a 360, 768 y 1280 px. Consola sin errores. axe-core en lista, detalle y alta. Capturas de las tres pantallas.
   - Casos: operador con MFA; mismo operador con aal1; usuario de un tenant cliente con `PLAT_ADMIN_TENANTS`.
   - Alta de «polleria-dona-rosa» con RUC 20601234565, suspensión con «Deuda de 60 días» y baja. Borrar los datos de prueba al final (el operador queda).
   - `plataforma-admin` en 4200 sigue funcionando y su menú ya no muestra «Consola».
   - El usuario hace la prueba cronometrada del alta (TR-RNF-029) y el tiempo se anota en el cierre del spec.

## Criterios de aceptación

**App y acceso:**

- [ ] `nx serve plataforma-consola` levanta en `127.0.0.1:4201` y llama a la API por el proxy `/v1`.
- [ ] Con sesión aal1, abrir cualquier ruta de `/consola` lleva a `/auth/mfa?returnUrl=<ruta>` sin pintar el layout. Tras verificar, vuelve a esa ruta.
- [ ] `/` redirige a `/consola/tenants`.
- [ ] El menú de la consola muestra solo «Consola > Tenants». El de `plataforma-admin` no muestra «Consola».
- [ ] Un usuario de un tenant cliente con `PLAT_ADMIN_TENANTS` que abre `/consola/tenants` ve el aviso de `OPERADOR_REQUERIDO` y ninguna fila de tenants. Sin `plat.tenant.consultar` va a `/403`.

**Lista y detalle:**

- [ ] Con «polleria-dona-rosa» (`PRUEBA`) y «gym-fuerza-total» (`SUSPENDIDO`), filtrar por `SUSPENDIDO` muestra solo «gym-fuerza-total» con su estado y sus suscripciones.
- [ ] Los filtros y la página sobreviven a recargar la URL.
- [ ] El detalle muestra suscripciones en solo lectura, empresa principal e historial del más reciente al más antiguo. Un id inexistente muestra «El tenant no existe».

**Cambio de estado:**

- [ ] Desde `PRUEBA` se ofrecen Activar, Suspender y Dar de baja. Desde `ACTIVO`, Suspender y Dar de baja. Desde `SUSPENDIDO`, Activar y Dar de baja. Desde `BAJA`, ninguno (TR-RN-005, TR-CA-017).
- [ ] Con «Deuda» (5 caracteres) o sin motivo, el diálogo no habilita confirmar y no se envía nada (TR-CA-018).
- [ ] Suspender «gym-fuerza-total» con «Deuda de 60 días» lo deja en `SUSPENDIDO`, avisa el éxito y el historial muestra la fila nueva (TR-CA-016, parte de UI).
- [ ] Sin MFA vigente, pulsar un botón de estado navega a `/auth/mfa?returnUrl=<detalle>` sin abrir el diálogo.
- [ ] Sin `plat.tenant.cambiar_estado` no hay botones de estado.

**Alta:**

- [ ] Con producto REST, plan `BASICO`, modalidad `PRUEBA` y RUC 20601234565 se crea «polleria-dona-rosa» en `PRUEBA`, la consola abre su detalle y avisa «Tenant creado» (TR-CA-001, parte de UI).
- [ ] Repetir el código «polleria-dona-rosa» vuelve al paso 1 con «El código de tenant ya existe» y no navega (TR-CA-002).
- [ ] Con RUC 20601234560 el paso 2 muestra «RUC inválido» y «Crear tenant» no envía (TR-CA-003).
- [ ] Modalidad `ACTIVO` sin `vigente_hasta` no deja avanzar.
- [ ] Con `correo_enviado: false` el tenant queda creado y la consola avisa con advertencia que el correo no se envió.
- [ ] Si el MFA vence antes de confirmar, la consola pide el segundo factor y, al volver a `/consola/tenants/nuevo`, el formulario conserva los datos y el paso.
- [ ] Mientras viaja el `POST`, «Crear tenant» está deshabilitado y un doble clic envía una sola petición (TR-RNF-008).
- [ ] El borrador no se escribe en `localStorage` ni `sessionStorage`.
- [ ] Un operador completa el alta en menos de 15 min en la prueba cronometrada del usuario, con el tiempo anotado en el cierre (TR-RNF-029).

**Calidad y estructura:**

- [ ] `consola-tenants` tiene tags `type:feature` y `scope:plataforma`, exporta solo `CONSOLA_TENANTS_ROUTES` por ruta explícita e importa solo de `shared/*`. `plataforma-consola` tiene `scope:app` y `type:app`.
- [ ] `AccionSensibleService` existe solo en `libs/shared/shell` y las pruebas de `admin-cliente` siguen en verde.
- [ ] Lista, detalle y alta se usan a 360, 768 y 1280 px sin scroll horizontal de página. axe-core sin `critical` ni `serious`.
- [ ] Sin colores fijos: solo tokens de `shared/ui` y utilidades de Tailwind.
- [ ] Ningún componente usa `template` ni `styles` inline. No hay archivos `.css` vacíos.
- [ ] El código nuevo sigue la sección «Código limpio» de `CLAUDE.md`. `code-simplifier` pasó sobre los archivos modificados.
- [ ] `pnpm nx affected -t lint test build` en verde.
- [ ] Verificación con el MCP `playwright` hecha, con consola sin errores y capturas de lista, detalle y alta. Los datos de prueba de dev se borraron.

## Decisiones

- **Sí:** app separada `plataforma-consola` en 4201, como el plan y PL-08 (D3). `aal2Guard` sobre toda la consola.
- **Sí:** `aal2Guard` en la ruta `consola` y no en el layout. `rutasDelShell` sigue siendo común a las dos apps.
- **Sí:** step-up con `AccionSensibleService` al abrir el asistente, antes de confirmar el alta y antes de cada cambio de estado (decisión del usuario).
- **Sí:** `AccionSensibleService` se mueve a `libs/shared/shell` (decisión del usuario). Lo usan dos libs feature.
- **No:** moverlo a `libs/shared/auth`. Es `type:data-access` y no puede importar `AvisosService` de `shared/ui`.
- **No:** copiarlo en `consola-tenants`. Duplicado sin razón.
- **Sí:** borrador del alta en un servicio root, solo en memoria (decisión del usuario). Cubre la vuelta de `/auth/mfa`. Un recargo lo pierde y es aceptable.
- **No:** borrador en `sessionStorage`. Guardaría el correo del propietario en el navegador.
- **Sí:** filtro del menú por prefijo en `rutasDelShell`, aplicado también en `plataforma-admin` (decisión del usuario). El 15 ya está implementado.
- **No:** filtrar en cada app o pedir un campo `app` en `seg.opcion`. Lo primero duplica; lo segundo pide versión de manifiesto y migración.
- **Sí:** botones por destino válido y `confirmarDestructiva` con motivo, sin `MatDialog` (decisión del usuario). Mismo patrón que el 16a.
- **Sí:** motivo con el default 10 de `confirmarDestructiva`, sin `longitudMinimaMotivo` (D1).
- **Sí:** suscripción en solo lectura en el detalle (decisión del usuario). La edición (RF-005) va en un spec aparte.
- **Sí:** asistente con `MatStepper` lineal de dos pasos sobre un solo `POST` (decisión del usuario).
- **Sí:** tras el alta, al detalle del tenant nuevo con aviso; advertencia si `correo_enviado: false` (decisión del usuario).
- **Sí:** operador frente a cliente por permiso y `OPERADOR_REQUERIDO` de la API (D2). La consola no lee `tipo_usuario`.
- **Sí:** DTO, catálogos y matriz de transiciones repetidos en `models/`. `libs/plataforma/org` es `type:backend` y no se importa. `shared/contracts` sigue vacía.
- **Sí:** filtros y página en los query params. La lista se puede compartir y recargar.
- **Sí:** `valorInicial` en `vit-filtros` para que los controles muestren el filtro de la URL (decisión del usuario, paso 5).
- **Sí:** enlace › por fila hacia el detalle en vez de clic en la fila (decisión del usuario, paso 5). `vit-tabla` no emite el clic de fila y el enlace funciona con teclado.
- **Sí:** prueba cronometrada manual del usuario (decisión del usuario). Un recorrido automatizado no mide a un operador.
- **No:** endpoint de productos y planes. Constantes en el front, como dice el contexto.

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| `127.0.0.1:4201` no está en las URLs de retorno de Supabase dev y el ingreso falla | El usuario la registra en el panel antes del paso 8. Si no está, se dice en el cierre y la UI no se da por verificada. |
| `TRANSICIONES_TENANT` del front se desfasa de ORG | Una prueba fija la matriz. El back rechaza con 409 `CONFLICTO` y el interceptor lo avisa. |
| `mfaVigente` de `mi-contexto` se cargó al entrar y queda viejo a mitad del asistente | La API responde `MFA_REQUERIDA` y el interceptor del 13 manda a `/auth/mfa`. El borrador se guardó antes del envío. |
| Mover `AccionSensibleService` rompe `admin-cliente` | Paso 1 aislado con sus pruebas y el build de `plataforma-admin` antes de seguir. |
| El operador tiene sucursal en el tenant operador y `PermisoGuard` exige `X-Sucursal-Id` | El selector de sucursal del 15 ya lo resuelve. Se comprueba en el paso 8. |

## Lo que **no** está en este spec

- Backend, migraciones y manifiesto.
- Edición de la suscripción (RF-005).
- Catálogos globales (19b), eventos fallidos, salud (21), auditoría y sesión compartida entre subdominios (17c).
- Padrón RUC y NO HABIDO (R2).
- Selector de tenant.
- Correo al propietario al cambiar de estado.
- Alta de `127.0.0.1:4201` en Supabase dev (manual, del usuario).
- E2E multinavegador y axe en CI (27).

Cada uno, si llega, va en su propio spec.
