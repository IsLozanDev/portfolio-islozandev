# SPEC 15 — Shell y UI: sistema de diseño, avisos con SweetAlert2, layout, menú y selector de sucursal

> **Status:** Aprobado
> **Depends on:** SPEC 13, SPEC 14, SPEC 06
> **Date:** 2026-10-26
> **Objective:** Crear `libs/shared/ui` (tokens, avisos centralizados con SweetAlert2, tabla, filtros, formulario, carga y estado vacío) y `libs/shared/shell` (layout, menú desde `mi-contexto`, selector de sucursal y páginas de sistema), montados en `plataforma-admin` y verificados en navegador.

## Por qué existe este spec

Fila 15 de `docs/roadmap-specs.md` (U-01, U-02). Contexto: `docs/spec-context/15-shell-y-ui.md`. Reemplaza las páginas provisionales que dejó el spec 14 en `apps/plataforma-admin`.

Hallazgos que cambian el paquete de contexto:

- `GET /v1/seg/mi-contexto` ya trae el menú con `padre`, `nombre`, `ruta`, `icono` y `orden` (`seg.menu_usuario` en `db/01b_seg_autorizacion.sql`, `ContextoUsuario.menu` del spec 13). P4 queda resuelta por el backend: el shell arma el árbol en el cliente.
- El servidor recuerda la última sucursal (spec 13). P7 resuelta: nada en `localStorage`.
- Las sucursales traen `empresa_id` pero no el nombre de la empresa. El selector es una lista plana.
- `PUT /v1/seg/mi-tenant` no existe: no hay selector de tenant (fuera desde el spec 13).
- En Supabase dev no hay filas en `seg.opcion`: el menú llega vacío. La verificación siembra datos de prueba y los borra.
- Pedido del usuario: centralizar modales y avisos (info, éxito, advertencia, error, confirmación) con SweetAlert2 en un servicio reutilizable.

RF cubiertos (parte de interfaz):

- **TR-RF-015**: el shell pinta el menú y los permisos que calcula la API. No recalcula permisos.
- **TR-RF-016**: selector de sucursal en el encabezado y página de selección. Criterios **TR-CA-044, 045 y 046**.

No hay GWT para el sistema de diseño, el layout, el menú, las páginas 403/404 ni los avisos: los criterios de esas piezas son propios de este spec.

Reglas: **TR-RN-007** (menú por permisos que decide la API), **TR-RN-009** (`*siPermiso` solo oculta; la API decide).

RNF propios:

- **TR-RNF-018**: responsiva en 360, 768 y 1280 px; textos en español de Perú.
- **TR-RNF-019**: 0 violaciones `critical` o `serious` de axe-core en las páginas del shell y en la página de muestra.
- **TR-RNF-021**: confirmación explícita y motivo obligatorio en acciones destructivas (`confirmarDestructiva`).
- **TR-RNF-010**: al cambiar de sucursal ninguna página queda con datos de la anterior.
- **TR-RNF-023**: se verifica en Chromium; la matriz multinavegador es del spec 27.

RNF heredados: 024/119 (límites Nx), 025 (cobertura >= 70 % en `shared-ui` y `shared-shell`), 026 (sin correo ni token en la consola).

Historias del backlog: **U-01** y **U-02**. Estimado: 13-14 h (el roadmap dice 8). Suman SweetAlert2, tabla, filtros, formulario, mover las páginas y la página de muestra. Supera el tope de 10 h por decisión del usuario.

## Alcance

**In:**

- **Workspace**: `sweetalert2` 11.x (última publicada al redactar: 11.26.25). Fuente Material Symbols Outlined desde Google Fonts en `index.html`.
- **Lib `libs/shared/ui`** (`shared-ui`, alias `@vitrina/shared/ui`, tags `scope:shared` y `type:ui`), construible, Vitest:
  - `src/estilos/material.scss`: mixin con el tema Material 3 (paleta, tipografía Roboto, densidad 0).
  - `src/estilos/tema.css`: `@theme` de Tailwind con tokens que apuntan a `--mat-sys-*`.
  - `src/estilos/sweetalert.css`: variables y clases de SweetAlert2 mapeadas a los tokens de Material.
  - `services/avisos.service.ts`: `AvisosService` (modales, confirmaciones y toasts).
  - `models/aviso.ts`, `models/columna-tabla.ts`, `models/filtro.ts`, `models/mensajes-ui.ts`.
  - `components/cargando`, `components/estado-vacio`, `components/tabla`, `components/filtros`, `components/acciones-formulario`.
  - `utils/mensaje-de-validacion.ts` y `pipes/mensaje-validacion.pipe.ts`.
- **Lib `libs/shared/shell`** (`shared-shell`, alias `@vitrina/shared/shell`, tags `scope:shared` y `type:feature`), Vitest:
  - `shell.routes.ts`: `rutasDelShell(hijas)`.
  - `components/layout`, `components/menu-lateral`, `components/selector-sucursal`, `components/menu-usuario`.
  - `pages/seleccionar-sucursal`, `pages/sin-accesos`, `pages/prohibido`, `pages/no-encontrado`.
  - `interceptors/errores-http.interceptor.ts` y el token `OMITIR_AVISO_ERROR`.
  - `utils/arbol-menu.ts`: lista plana → árbol.
  - `models/nodo-menu.ts`, `models/mensajes-shell.ts`.
- **Cambios en `apps/plataforma-admin`**:
  - `app.routes.ts` con `rutasDelShell`; `inicio` pasa a hija del layout.
  - `app.config.ts` suma `erroresHttpInterceptor` después de `authInterceptor`.
  - `styles.scss` usa el mixin de `shared/ui`; `tailwind.css` importa `tema.css`; `styles` del proyecto suma `sweetalert.css`.
  - Se borran `pages/seleccionar-sucursal`, `pages/sin-accesos` y `pages/prohibido` con sus pruebas.
  - Página de muestra `pages/componentes/` en `/dev/componentes`, registrada solo si `environment.production` es `false`.
- **Datos de prueba en dev**: script SQL en el scratchpad que siembra un módulo, opciones con padre e icono y sus permisos para el usuario de prueba; otro que los borra.
- **Verificación** con el MCP `playwright` contra Supabase dev y la API local.

**Out of scope (for future specs):**

- Marca por tenant (logo, colores): sin fuente de datos; spec propio, probablemente de CFG.
- Modo oscuro.
- Selector de tenant y `PUT /v1/seg/mi-tenant`.
- Agrupar sucursales por empresa: hace falta que `mi-contexto` traiga el nombre de la empresa.
- Notificaciones persistentes (TR-NOT, R2).
- Migrar los errores en línea de las páginas `/auth` (spec 14) a SweetAlert2.
- Formulario dinámico desde una definición JSON.
- `shared/util` con formatos es-PE y `LOCALE_ID`.
- Pantallas de administración (specs 16 y 17), shell de SazónPOS (spec 26).
- axe-core en CI y matriz multinavegador (spec 27).

## Base de código reutilizada

- No hay código base de `shared/ui` ni `shared/shell` en `docs/.../codigo/`.
- `libs/shared/auth` (spec 13): `SesionService`, `CONFIG_AUTH`, guards, `*siPermiso` y `rutaDeRetorno` se usan tal cual. Cambio en el paso 8 (decisión del usuario): `OMITIR_AVISO_ERROR` y la opción `omitirAvisoError` de `cargarContexto` y `seleccionarSucursal`; se exporta `esDeLaApi`. Ver «Hallazgos de la implementación».
- `apps/plataforma-admin/src/app/pages/seleccionar-sucursal`: se conserva la lógica (carga, `sinAccesos`, `returnUrl`, sucursal actual marcada con `aria-current`) y se mueve a `shared/shell`. Cambia: usa `vit-cargando` y el texto de `mensajes-shell.ts`.
- `pages/sin-accesos` y `pages/prohibido`: se conservan los textos (TR-CA-046) y se mueven. Suman botón «Salir» y «Volver al inicio».
- `styles.scss`: la paleta azure y la tipografía pasan al mixin de `shared/ui`.

## Modelo de datos

No hay tablas, migraciones ni eventos nuevos. Solo se lee `GET /v1/seg/mi-contexto` vía `SesionService` (regla 8).

### Estructura de `libs/shared/ui`

```
libs/shared/ui/src/
  estilos/        material.scss · tema.css · sweetalert.css
  lib/
    components/   cargando/ · estado-vacio/ · tabla/ · filtros/ · acciones-formulario/
    models/       aviso.ts · columna-tabla.ts · filtro.ts · mensajes-ui.ts
    pipes/        mensaje-validacion.pipe.ts
    services/     avisos.service.ts
    utils/        mensaje-de-validacion.ts
  index.ts
```

`estilos/` vive fuera de `lib/` porque no son artefactos Angular: la app los consume por ruta en `project.json`, `@use` y `@import`.

### Tokens (`tema.css`)

```css
@theme {
  --font-sans: Roboto, "Helvetica Neue", sans-serif;
  --color-primario: var(--mat-sys-primary);
  --color-sobre-primario: var(--mat-sys-on-primary);
  --color-superficie: var(--mat-sys-surface);
  --color-sobre-superficie: var(--mat-sys-on-surface);
  --color-contenedor-error: var(--mat-sys-error-container);
  --color-sobre-contenedor-error: var(--mat-sys-on-error-container);
  --color-borde: var(--mat-sys-outline-variant);
  --radius-tarjeta: var(--mat-sys-corner-medium);
}
```

Reemplaza a `--color-marca` del spec 14. Las plantillas usan `bg-superficie`, `text-sobre-contenedor-error`, `rounded-tarjeta`.

### Avisos (`AvisosService`)

```ts
// models/aviso.ts
export type TipoAviso = 'info' | 'exito' | 'advertencia' | 'error';

export interface OpcionesConfirmacion {
  titulo: string;
  texto?: string;
  textoConfirmar?: string;   // 'Aceptar'
  textoCancelar?: string;    // 'Cancelar'
}

export interface OpcionesConfirmacionDestructiva extends OpcionesConfirmacion {
  pedirMotivo?: boolean;     // false
}

export type ResultadoConfirmacionDestructiva =
  | { confirmado: false }
  | { confirmado: true; motivo: string | null };
```

| Miembro | Devuelve | Comportamiento |
| --- | --- | --- |
| `info(titulo, texto?)` | `Promise<void>` | Modal con icono `info` y botón «Aceptar» |
| `exito(titulo, texto?)` | `Promise<void>` | Icono `success` |
| `advertencia(titulo, texto?)` | `Promise<void>` | Icono `warning` |
| `error(titulo, texto?)` | `Promise<void>` | Icono `error` |
| `confirmar(opciones)` | `Promise<boolean>` | «Aceptar» / «Cancelar»; `true` solo si confirma. Esc o clic fuera = `false` |
| `confirmarDestructiva(opciones)` | `Promise<ResultadoConfirmacionDestructiva>` | Botón de confirmar con `--mat-sys-error`, texto por defecto «Eliminar», foco inicial en «Cancelar». Con `pedirMotivo`: textarea obligatorio de al menos `LONGITUD_MINIMA_MOTIVO = 10` caracteres (sin contar espacios de los extremos); si no cumple, no cierra y muestra «Ingrese un motivo de al menos 10 caracteres.». Devuelve el motivo recortado |
| `toast(tipo, texto)` | `void` | Toast no bloqueante arriba a la derecha, 3 s (`DURACION_TOAST_MS = 3000`), barra de tiempo, se pausa con el puntero encima |

- Todos los textos por defecto están en `models/mensajes-ui.ts` (`MENSAJES_UI`).
- `AvisosService` es el único archivo que importa `sweetalert2`. El resto del front usa el servicio.
- Los textos se pasan como texto, no como HTML (`text`, no `html`): evita inyección con datos de la API.
- SweetAlert2 muestra un modal a la vez. Un aviso nuevo reemplaza al abierto; un toast no cierra un modal.
- `sweetalert.css` usa `customClass` del servicio y las variables CSS de SweetAlert2 para tomar color, radio y tipografía de `--mat-sys-*`. La API exacta (variables, `customClass`, importación sin inyección de estilos) se confirma con ctx7 al implementar.

### Tabla (`vit-tabla`)

```ts
// models/columna-tabla.ts
export interface ColumnaTabla<Fila> {
  clave: keyof Fila & string;
  titulo: string;
  ordenable?: boolean;
}

export interface CambioPagina { indice: number; tamano: number }
export interface CambioOrden { clave: string; direccion: 'asc' | 'desc' | '' }
```

| Entrada / salida | Tipo | Nota |
| --- | --- | --- |
| `columnas` | `input.required<ColumnaTabla<Fila>[]>` | |
| `filas` | `input.required<readonly Fila[]>` | La página actual, ya filtrada por el servidor |
| `total` | `input.required<number>` | Total de filas en el servidor |
| `cargando` | `input<boolean>(false)` | Muestra `vit-cargando` encima de la tabla |
| `tamanosPagina` | `input<number[]>([10, 25, 50])` | |
| `textoVacio` | `input<string>` | Por defecto «No hay registros.» con `vit-estado-vacio` |
| `pagina` | `output<CambioPagina>` | `MatPaginator` con etiquetas en español |
| `orden` | `output<CambioOrden>` | `MatSort` en las columnas `ordenable` |
| plantilla `vitAccionesFila` | `ng-template` con la fila como contexto | Columna final «Acciones» si se proyecta |

En menos de 768 px la tabla se desplaza horizontalmente dentro de su contenedor; la página no.

### Filtros (`vit-filtros`)

```ts
// models/filtro.ts
export interface DefinicionFiltro {
  clave: string;
  etiqueta: string;
  opciones: { valor: string; etiqueta: string }[];
}

export type ValorFiltros = { busqueda: string } & Record<string, string | null>;
```

- `definiciones = input<DefinicionFiltro[]>([])`, `placeholderBusqueda = input<string>('Buscar')`.
- `cambio = output<ValorFiltros>()`: emite con la búsqueda tras `ESPERA_BUSQUEDA_MS = 300` sin teclear y al instante al cambiar un select.
- Botón «Limpiar»: vacía todo y emite una vez.
- En 360 px los campos se apilan en una columna.

### Formulario

- `mensajeDeValidacion(errores: ValidationErrors | null): string | null` en `utils/mensaje-de-validacion.ts`. Devuelve el mensaje del primer error:

| Error | Mensaje |
| --- | --- |
| `required` | «Este campo es obligatorio.» |
| `email` | «Ingrese un correo válido.» |
| `minlength` | «Ingrese al menos {n} caracteres.» |
| `maxlength` | «Ingrese como máximo {n} caracteres.» |
| `min` / `max` | «El valor mínimo es {n}.» / «El valor máximo es {n}.» |
| `pattern` | «El formato no es válido.» |
| Otro | «El valor no es válido.» |

- Pipe `mensajeValidacion` (puro) sobre `control.errors`, para `<mat-error>{{ control.errors | mensajeValidacion }}</mat-error>`.
- `vit-acciones-formulario`: `guardando = input<boolean>(false)`, `textoGuardar = input('Guardar')`, `cancelar = output<void>()`. Botón «Guardar» `type="submit"` deshabilitado y con indicador mientras `guardando`; «Cancelar» `type="button"`. Los campos siguen siendo `mat-form-field` directos.

### Carga y estado vacío

- `vit-cargando`: `texto = input('Cargando…')`; spinner de Material con `role="status"`.
- `vit-estado-vacio`: `icono = input('inbox')`, `titulo = input.required<string>()`, `texto = input<string>()`; proyecta contenido (por ejemplo un botón «Crear»).

### Menú

```ts
// models/nodo-menu.ts
export interface NodoMenu {
  codigo: string;
  nombre: string;
  ruta: string | null;
  icono: string | null;     // nombre de Material Symbols
  hijos: NodoMenu[];
}
```

`construirArbolMenu(menu: ContextoUsuario['menu']): NodoMenu[]` en `utils/arbol-menu.ts`:

- Raíz: opciones con `padre = null` o cuyo padre no vino en la lista.
- Hermanos ordenados por `orden` y luego por `nombre`.
- Cualquier profundidad.
- Un nodo con hijos es un grupo expandible: su `ruta` se ignora. Un nodo sin hijos es un enlace; sin `ruta`, no se pinta.
- Sin `icono`: `ICONO_POR_DEFECTO = 'circle'`.

### Rutas del shell

`rutasDelShell(hijas: Routes): Routes` devuelve, en este orden:

| Ruta | Página | Guard |
| --- | --- | --- |
| `seleccionar-sucursal` | `SeleccionarSucursalPage` | `sesionGuard` |
| `sin-accesos` | `SinAccesosPage` | `sesionGuard` |
| `''` | `LayoutComponent` con `children: [...hijas, { path: '403', ProhibidoPage }, { path: '**', NoEncontradoPage }]` | `autenticadoGuard` |

La app pone `/auth` antes. Una opción del menú cuya ruta la app no registró cae en `**` y muestra la 404 dentro del layout, con el menú visible.

### Layout

- `mat-toolbar` arriba: botón de menú (solo en modo `over`), nombre de la app (`input` del layout vía `data` de la ruta, por defecto «Plataforma»), `vit-selector-sucursal` y `vit-menu-usuario`.
- `mat-sidenav` con `vit-menu-lateral`. `BreakpointObserver`: desde `ANCHO_ESCRITORIO_PX = 1024` modo `side` abierto; por debajo modo `over` cerrado, que se cierra al navegar.
- `<main>` con `router-outlet` y relleno; sin desborde horizontal en 360 px.
- Menú lateral: `mat-nav-list`, `routerLinkActive` con `aria-current="page"`, grupos expandibles con `aria-expanded`. Sin opciones: `vit-estado-vacio` «No tiene opciones de menú».
- Menú de usuario: correo de la sesión y «Salir» (`salir()` y navega a `rutas.ingresar`).

### Selector de sucursal (encabezado)

- Una sola sucursal: muestra su nombre como texto, sin menú (**TR-CA-044**).
- Varias: botón con el nombre de la actual y `mat-menu` con la lista plana ordenada por nombre; la actual marcada.
- Al elegir otra: `seleccionarSucursal(id)`, navega a `rutas.inicio` y `toast('exito', 'Ahora trabaja en <nombre>')` (**TR-CA-045**). Sin reautenticar. Si falla: `error` con «No se pudo cambiar de sucursal. Inténtelo de nuevo.» y se queda la actual.
- Mientras cambia, el botón queda deshabilitado (evita peticiones repetidas, TR-RNF-101).

### Páginas de sistema

| Página | Texto | Acciones |
| --- | --- | --- |
| Seleccionar sucursal | «Elija su sucursal» | Lista; la actual (la recordada por el servidor) marcada; va a `returnUrl` |
| Sin accesos | «No tiene accesos vigentes; contacte a su administrador» (**TR-CA-046**) | «Salir» |
| Prohibido (403) | «No tiene permiso para ver esta página.» | «Volver al inicio» |
| No encontrado (404) | «La página que busca no existe.» | «Volver al inicio» |

Los textos viven en `models/mensajes-shell.ts` (`MENSAJES_SHELL`).

### Interceptor de errores

`erroresHttpInterceptor` (`HttpInterceptorFn`):

- Solo peticiones a `apiUrl` (misma regla que `authInterceptor`).
- Estado 0: `avisos.error('Sin conexión', 'No se pudo conectar. Revise su conexión.')`.
- 5xx: `avisos.error('Error del servidor', 'Ocurrió un error en el servidor. Inténtelo de nuevo.')`.
- 4xx: no hace nada (401 y 403 los maneja `shared/auth`; el resto, cada página).
- Siempre propaga el error.
- `OMITIR_AVISO_ERROR` (`HttpContextToken<boolean>`, por defecto `false`): la petición que lo lleva no dispara el modal. Lo usan las páginas que muestran su propio error.

### Página de muestra (`/dev/componentes`)

En `apps/plataforma-admin/src/app/pages/componentes/`. Hija del layout. Datos fijos en el `.ts`:

- Botones para cada aviso: info, éxito, advertencia, error, confirmar, destructiva con motivo y un toast de cada tipo.
- `vit-filtros` con un select «Estado» y `vit-tabla` con 37 filas paginadas en memoria por la página (simula el servidor), ordenables por nombre y con acción por fila que abre `confirmarDestructiva`.
- Un formulario con nombre (`required`, `minlength 3`) y correo (`required`, `email`) usando `mensajeValidacion` y `vit-acciones-formulario`.
- `vit-estado-vacio` y `vit-cargando`.

`app.routes.ts` agrega la ruta solo si `!environment.production`.

### Datos de prueba del menú (dev)

Script `menu-prueba.sql` en el scratchpad (no se versiona). Inserta, para el producto de plataforma:

- Un módulo «Pruebas del shell».
- Opciones: «Administración» (grupo, icono `admin_panel_settings`) con hijas «Usuarios» (`/dev/componentes`, icono `group`) y «Roles» (`/roles`, sin registrar en la app: debe ir a 404); «Inicio» (`/`, icono `home`).
- Sus `seg.opcion_permiso` y un rol con esos permisos asignado al usuario de prueba en una sucursal.
- Una segunda sucursal asignada al mismo usuario para TR-CA-045, y un usuario con una sola sucursal para TR-CA-044.

`menu-prueba-borrar.sql` deja la base como estaba. Si el MCP de Supabase es de solo lectura, el usuario los ejecuta en el editor SQL de dev. La caché Redis de permisos se invalida o se espera su vencimiento antes de verificar.

Al implementar no hizo falta sembrar el menú (ver «Hallazgos de la implementación»): se usaron `spec15-sembrar.sql` y `spec15-borrar.sql`, que solo agregan y quitan la sucursal «Surco» en `humo-14` y suben `seg.version_seguridad` para invalidar la caché.

## Plan de implementación

1. **Lib `shared/ui` y estilos.** Generar `libs/shared/ui` (construible, Vitest, tags, alias). `estilos/material.scss`, `estilos/tema.css`; la app los usa en `styles.scss` y `tailwind.css` (se quita `--color-marca`). Fuente Material Symbols en `index.html`. Verificar: `nx build plataforma-admin` y `/auth/ingresar` se ve igual que antes.
2. **Avisos.** Instalar `sweetalert2` (consultar con ctx7 importación, variables CSS y `customClass`). `models/aviso.ts`, `mensajes-ui.ts`, `AvisosService` con pruebas sobre el DOM (`.swal2-popup`), `estilos/sweetalert.css` en `styles` del proyecto. Verificar: `nx test shared-ui`.
3. **Carga, estado vacío y formulario.** `vit-cargando`, `vit-estado-vacio`, `mensajeDeValidacion`, pipe `mensajeValidacion`, `vit-acciones-formulario`, con pruebas.
4. **Tabla y filtros.** `vit-tabla` (paginador en español, orden, acciones por plantilla, vacío, cargando) y `vit-filtros` (espera de 300 ms con temporizadores falsos, limpiar), con pruebas.
5. **Lib `shared/shell`, árbol y rutas.** Generar `libs/shared/shell`. `construirArbolMenu` con pruebas (huérfanos, orden, profundidad, sin ruta). Mover las tres páginas de la app y crear `NoEncontradoPage`. `rutasDelShell` con un `LayoutComponent` mínimo (solo `router-outlet`). Cambiar `app.routes.ts` y borrar las páginas viejas. Verificar: `nx serve` muestra inicio, `/sin-accesos` y `/x-no-existe` (404).
6. **Layout y menú lateral.** Barra superior, `mat-sidenav` responsivo, `vit-menu-lateral`, `vit-menu-usuario`. Pruebas de render del menú desde un contexto simulado.
7. **Selector de sucursal.** `vit-selector-sucursal` con pruebas de TR-CA-044 y 045 (incluye navegar a inicio, toast y fallo).
8. **Interceptor de errores.** `erroresHttpInterceptor`, `OMITIR_AVISO_ERROR` y registro en `app.config.ts`; la página de selección usa el token. Pruebas con `HttpTestingController`.
9. **Página de muestra.** `/dev/componentes` con todos los componentes y avisos; ruta condicionada a `environment.production`.
10. **Datos de prueba y verificación en navegador.** Scripts de siembra y borrado; Playwright en 360, 768 y 1280 px; axe-core; consola; capturas. Borrar los datos.
11. **Cierre.** `index.ts` de las dos libs solo con su API pública; cobertura; `code-simplifier` sobre los archivos nuevos y modificados; estimado y Estado de la fila 15 en el roadmap.

## Criterios de aceptación

Workspace y build:

- [ ] `pnpm install` deja `sweetalert2` 11.x; ninguna dependencia de Angular en 22.
- [ ] `nx build plataforma-admin` compila en modo estricto sin `tailwind.config.js` y dentro del presupuesto inicial (aviso 600 kB, error 1 MB).
- [ ] `nx test shared-ui`, `nx test shared-shell`, `nx test plataforma-admin` y `nx test shared-auth-ui` pasan con Vitest sin zone.js.
- [ ] Cobertura de líneas >= 70 % en `shared-ui` y en `shared-shell`.
- [ ] `nx lint` pasa en las tres; `shared-ui` solo importa `type:ui` o `type:util`; `shared-shell` no importa fuera de `scope:shared`.
- [ ] `sweetalert2` solo se importa en `avisos.service.ts` (`git grep "from 'sweetalert2'"` da un archivo).
- [ ] `index.ts` de `shared-ui` exporta solo `AvisosService`, los tipos de `aviso.ts`, `columna-tabla.ts` y `filtro.ts`, `MENSAJES_UI`, los cinco componentes, `AccionesFilaDirective` (la plantilla de acciones de `vit-tabla`), `mensajeDeValidacion` y `MensajeValidacionPipe`.
- [ ] `index.ts` de `shared-shell` exporta solo `rutasDelShell`, `erroresHttpInterceptor` y `OMITIR_AVISO_ERROR`.
- [ ] `apps/plataforma-admin/src/app/pages/` ya no tiene `seleccionar-sucursal`, `sin-accesos` ni `prohibido`.
- [ ] `nx affected -t lint,test,build` verde, incluido el backend.

Avisos (pruebas de `shared-ui`):

- [ ] `info`, `exito`, `advertencia` y `error` abren un modal con el icono de su tipo, el título y el texto dados.
- [ ] Un texto con `<b>x</b>` se muestra literal, no como HTML.
- [ ] `confirmar` devuelve `true` al pulsar «Aceptar» y `false` con «Cancelar» o Esc.
- [ ] `confirmarDestructiva` deja el foco en «Cancelar» al abrir.
- [ ] `confirmarDestructiva({ pedirMotivo: true })` con motivo de 9 caracteres no cierra y muestra «Ingrese un motivo de al menos 10 caracteres.»; con `'  motivo válido  '` devuelve `{ confirmado: true, motivo: 'motivo válido' }`.
- [ ] `toast('exito', 'Guardado')` no bloquea la página y desaparece a los 3 s.

Componentes (pruebas de `shared-ui`):

- [ ] `vit-tabla` con `filas = []` muestra «No hay registros.»; con `cargando = true` muestra el spinner.
- [ ] `vit-tabla` emite `pagina` con `{ indice: 1, tamano: 10 }` al ir a la página 2, y `orden` al pulsar una cabecera `ordenable`; una no `ordenable` no emite.
- [ ] El paginador muestra textos en español («Filas por página», «1 – 10 de 37»).
- [ ] `vit-filtros` emite una sola vez tras 300 ms de teclear «ana»; al cambiar el select emite al instante; «Limpiar» emite `{ busqueda: '' }` con los selects en `null`.
- [ ] `mensajeDeValidacion({ minlength: { requiredLength: 3, actualLength: 1 } })` devuelve «Ingrese al menos 3 caracteres.»; `null` devuelve `null`.
- [ ] `vit-acciones-formulario` con `guardando = true` deshabilita «Guardar» y muestra el indicador.

Shell (pruebas de `shared-shell`):

- [ ] `construirArbolMenu` pone una opción con padre ausente en la raíz, ordena por `orden` y `nombre`, anida tres niveles y omite un nodo sin hijos ni ruta.
- [ ] El menú lateral pinta solo las opciones de `contexto().menu` y se reemplaza cuando cambia el contexto.
- [ ] **TR-CA-044**: con una sucursal, el encabezado muestra su nombre sin botón de menú.
- [ ] **TR-CA-045**: con dos sucursales, elegir «Surco» llama a `seleccionarSucursal(surco)`, navega a `/`, muestra el toast «Ahora trabaja en Surco» y no llama a ningún método de ingreso.
- [ ] Si `seleccionarSucursal` falla, se muestra el modal de error y la sucursal del encabezado no cambia.
- [ ] **TR-CA-046**: `SinAccesosPage` muestra «No tiene accesos vigentes; contacte a su administrador» y «Salir» cierra la sesión.
- [ ] `erroresHttpInterceptor`: un 503 de `apiUrl` abre el modal «Error del servidor»; un estado 0 abre «Sin conexión»; un 404 o un 503 de otro origen no abren nada; con `OMITIR_AVISO_ERROR` no abre nada; en todos los casos el error se propaga.

Navegador (MCP `playwright`, `nx serve plataforma-admin` y `nx serve api` contra Supabase dev, con los datos de prueba):

- [ ] Tras ingresar, el layout muestra el menú de dev (manifiesto de plataforma): «Seguridad» (Roles, Perfiles, Asignaciones, Usuarios) y «Configuración» (Parámetros, Series), con sus iconos.
- [ ] «Roles» (`/admin/roles`, sin registrar en la app) lleva a la página 404 dentro del layout, con el menú visible.
- [ ] **TR-CA-044**: el usuario con una sola sucursal entra a `/` sin ver el selector.
- [ ] **TR-CA-045**: el usuario con dos sucursales cambia desde el encabezado; la petición a `mi-contexto` lleva el `X-Sucursal-Id` nuevo, el menú se recarga, llega a `/` y no pasa por `/auth`.
- [ ] Al recargar la página, la sucursal elegida sigue siendo la actual (la recuerda el servidor).
- [ ] **TR-CA-046**: el usuario sin asignaciones vigentes ve `/sin-accesos` con el texto del criterio.
- [ ] `/dev/componentes`: cada aviso, el toast, la confirmación destructiva con motivo, la tabla, los filtros y el formulario funcionan; el estilo de los modales usa los colores del tema de Material.
- [ ] En 360 px el menú lateral está cerrado, se abre con el botón y se cierra al navegar; en 1280 px está fijo.
- [ ] Capturas a 360, 768 y 1280 px del layout con menú, `/seleccionar-sucursal`, `/sin-accesos`, 403, 404 y `/dev/componentes`, sin desborde horizontal de la página.
- [ ] axe-core en esas páginas y con un modal de SweetAlert2 abierto reporta 0 violaciones `critical` y `serious`.
- [ ] La consola del navegador no tiene errores de la app. Los 4xx de red esperados no cuentan.
- [ ] Las páginas `/auth` del spec 14 siguen funcionando (ingreso y MFA).
- [ ] Los datos de prueba se borraron; `seg.opcion` de dev queda como estaba.

Código limpio:

- [ ] El código nuevo sigue "Código limpio" y "Estructura de libs Angular" de `CLAUDE.md`.
- [ ] Ningún componente usa `template` ni `styles` inline, y no hay `.css` vacíos.
- [ ] La salida de `code-simplifier` se revisó y aplicó.
- [ ] Ningún `console.*` imprime correo ni token.

## Decisiones

- **Sí:** un `AvisosService` en `shared/ui` con SweetAlert2 para modales (info, éxito, advertencia, error), confirmaciones y toasts. Pedido del usuario: un solo mecanismo reutilizable.
- **No:** `MatSnackBar` para los avisos cortos. Dos mecanismos para lo mismo.
- **No:** `MatDialog` para la confirmación. SweetAlert2 ya la resuelve con foco y teclado.
- **Sí:** `sweetalert2` solo dentro de `AvisosService`. Cambiar de librería toca un archivo.
- **Sí:** SweetAlert2 con colores, radio y tipografía de los tokens de Material. Decisión del usuario; que no desentone con el resto.
- **No:** estilo por defecto de SweetAlert2.
- **Sí:** textos como texto plano, nunca `html`. Los mensajes pueden traer datos de la API (TR-RNF-012).
- **Sí:** `confirmarDestructiva` con motivo opcional de al menos 10 caracteres (TR-RNF-021). Lo usan los specs 16 y 17.
- **No:** migrar los errores en línea de `/auth` a modales. En formularios el error junto al campo es mejor UX y ya está verificado.
- **Sí:** tabla, filtros y formulario en este spec. Decisión del usuario, aunque pase de las horas del roadmap.
- **Sí:** `vit-tabla` con paginación y orden del lado del servidor (`total` y eventos). Las listas de usuarios crecen; el spec 16 la conecta a la API.
- **No:** paginación en cliente.
- **Sí:** formulario como mensajes de validación en español y acciones Guardar/Cancelar; campos con `mat-form-field` directo.
- **No:** formulario dinámico desde JSON. Mucho código, poco flexible.
- **Sí:** `vit-filtros` con búsqueda (300 ms) y selects declarados.
- **Sí:** página de muestra `/dev/componentes`, solo fuera de producción. Sin consumidor real, es la única forma de verificar en navegador (regla de `CLAUDE.md`).
- **Sí:** tokens únicos: tema Material 3 en un mixin de `shared/ui` y `@theme` de Tailwind apuntando a `--mat-sys-*`. Un solo origen de color para Material, Tailwind y SweetAlert2.
- **No:** marca por tenant, ni el mecanismo sin datos. Ningún RF ni tabla define logo o colores.
- **No:** modo oscuro.
- **Sí:** `estilos/` fuera de `src/lib/`. No son artefactos Angular; la tabla de `CLAUDE.md` no los cubre.
- **Sí:** páginas de selección, sin accesos, 403 y 404 en `shared/shell`, y se borran de la app. Decisión del usuario; las reutiliza SazónPOS (spec 26).
- **Sí:** `rutasDelShell(hijas)` en vez de rutas fijas. Cada app pone sus hijas dentro del layout.
- **Sí:** 403 y 404 dentro del layout. El usuario no pierde el menú.
- **Sí:** el árbol del menú se arma en el cliente desde la lista plana de `mi-contexto`. El backend ya entrega `padre`, `icono` y `orden`; no se toca la API.
- **Sí:** opciones con ruta no registrada se muestran y caen en 404. Decisión del usuario; simple y visible durante el desarrollo.
- **No:** ocultarlas comparando con `router.config`. Se complica con rutas lazy anidadas.
- **Sí:** selector de sucursal con lista plana. Decisión del usuario; `mi-contexto` no trae el nombre de la empresa.
- **No:** ampliar `mi-contexto` con la empresa en este spec. Toca backend, caché y pruebas de otra lib.
- **Sí:** tras cambiar de sucursal, navegar a inicio con un toast. Decisión del usuario; ninguna página queda con datos de la sucursal anterior (TR-RNF-010) y la ruta abierta puede no existir en el menú nuevo.
- **No:** recargar la ruta actual.
- **Sí:** `erroresHttpInterceptor` solo para estado 0 y 5xx de la API, con `OMITIR_AVISO_ERROR`. Decisión del usuario; 401 y 403 ya los maneja `shared/auth`, y los 4xx son de cada página.
- **Sí:** la última sucursal la recuerda el servidor. Nada en `localStorage` (spec 13).
- **Sí:** iconos con Material Symbols Outlined por Google Fonts. `seg.opcion.icono` guarda su nombre.
- **Sí:** datos de prueba del menú sembrados en dev y borrados al terminar. Decisión del usuario; prueba la cadena real `seg.opcion` → `mi-contexto` → menú.
- **No:** mock de `mi-contexto` en Playwright. No prueba la API.
- **Sí:** un solo spec de 13-14 h. Decisión del usuario; rompe el tope de 10 h a sabiendas.

### Hallazgos de la implementación

- **Sí:** `vit-tabla` suma `indicePagina = input(0)`. Sin él, quien consume no puede volver a la página 1 al filtrar y el paginador queda desfasado del servidor. Decisión del usuario en el paso 4.
- **Sí:** `rutasDelShell(hijas, nombreApp)`. El layout lee el nombre de `data` de su ruta, que arma el shell; la app no tenía dónde ponerlo.
- **Sí:** `OMITIR_AVISO_ERROR` vive en `shared/auth` y `SesionService.cargarContexto` y `seleccionarSucursal` aceptan `{ omitirAvisoError }`. El selector y la página de selección no hacen la petición: sin la opción, un 5xx mostraba el modal del interceptor y además su propio error. Decisión del usuario en el paso 8. El shell lo reexporta.
- **No:** dejar el doble aviso, ni quitar el error propio del selector.
- **Sí:** el interceptor carga `@vitrina/shared/ui` con `import()` al primer error. Con import estático, el barrel metía todo `shared/ui` y SweetAlert2 en el arranque: el bundle inicial pasó a 1,05 MB (error del presupuesto). Queda en 593 kB.
- **Sí:** `checkDynamicDependenciesExceptions: ['@vitrina/shared/ui']` en `eslint.config.mjs`. La regla de Nx prohíbe importar estáticamente una lib que en otro lado se carga dinámicamente.
- **Sí:** `MatIconRegistry.setDefaultFontSetClass('material-symbols-outlined')` en el constructor del layout, no en `app.config.ts`. En el arranque sumaba unos 23 kB y los iconos solo se pintan dentro del layout.
- **Sí:** SweetAlert2 desde `sweetalert2/dist/sweetalert2.js` (sin CSS inyectado) con tipos de `sweetalert2`, y `sweetalert2.css` más `estilos/sweetalert.css` en `styles`. `Swal.fire` devuelve un thenable sin `catch`: se envuelve con `Promise.resolve`.
- **Sí:** el toast espera a que se cierre el modal abierto. SweetAlert2 muestra un popup a la vez y un toast lo reemplazaría.
- **Sí:** `src/testing/sweetalert-en-jsdom.ts` emula `matchMedia`, `innerText` y `offsetWidth` solo en pruebas. jsdom no los tiene y SweetAlert2 los usa para abrir, escribir el título y elegir el foco.
- **Sí:** cobertura de `shared-shell` limitada a sus fuentes (`coverageInclude`). Sin eso contaba `shared/auth` y `shared/ui` y daba 53 %; con eso, 99 %.
- **Sí:** menú lateral con un solo `mat-nav-list` y sangría por nivel, y barra superior dentro de `<header>`. axe marcaba `landmark-unique` (cada lista anidada es otra región «navigation») y `region`.
- **Sí:** el icono de expandir de los grupos va dentro de `<span matListItemMeta>`. Directo en `mat-icon`, la tipografía del slot le quitaba la fuente de iconos y se veía el texto «expa».
- **Sí:** ancho del menú por `--mat-sidenav-container-width` (18rem). La clase `w-72` perdía contra el CSS de Material y el panel medía 360 px.
- **Sí:** no se sembró el menú. Dev ya tenía el del manifiesto de plataforma (Seguridad y Configuración, rutas `/admin/*`); solo se agregó y luego se borró una segunda sucursal en `humo-14` para TR-CA-045. El MCP de Supabase sí escribe (no es de solo lectura).
- **Sí:** el chunk de `/dev/componentes` se emite en producción aunque la ruta no se registra; no es alcanzable.
- Pendiente menor: el toast arriba a la derecha tapa unos 3 s el menú de usuario. Chrome advierte «Blocked aria-hidden» al abrir un modal de SweetAlert2 (lo pone en el fondo antes de mover el foco); es interno de la librería y axe no lo marca.

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| SweetAlert2 inyecta sus estilos en `<head>` y pisa los del tema, o falla con la política de contenido | Consultar con ctx7 la importación sin inyección y cargar `sweetalert2.css` por `styles`; captura del paso 10 |
| Las variables CSS de SweetAlert2 cambian entre versiones 11.x | Versión fija en `package.json`; `sweetalert.css` es un solo archivo |
| SweetAlert2 no es accesible para axe (foco, `aria-modal`) | Criterio de axe con un modal abierto; si falla, ajustar `customClass` o atributos en el servicio |
| SweetAlert2 en jsdom (Vitest) no anima o no cierra igual que en el navegador | Pruebas sobre el DOM con `Swal.isVisible()` y temporizadores falsos; el comportamiento real se ve en Playwright |
| La caché Redis de permisos sirve el menú sin las opciones sembradas | Invalidar la caché o esperar su vencimiento antes de verificar; anotar cuál se usó |
| Un 5xx en cadena abre modales repetidos | SweetAlert2 muestra uno a la vez; el nuevo reemplaza al anterior |
| `sweetalert2`, `MatTable` y `MatPaginator` empujan el bundle inicial sobre 600 kB | Componentes de tabla y filtros solo en rutas lazy; criterio sobre el presupuesto |
| Tailwind preflight o `@theme` nuevo cambia el aspecto de `/auth` | Criterio de que `/auth` sigue funcionando y capturas de comparación en el paso 1 |
| El estimado pasa de 14 h | Registrar horas reales; no se recorta alcance sin consultar |

## Lo que **no** está en este spec

- Marca por tenant y modo oscuro.
- Selector de tenant.
- Sucursales agrupadas por empresa.
- Notificaciones persistentes (TR-NOT).
- Errores de `/auth` en modales.
- Formulario dinámico.
- `shared/util` (formatos es-PE).
- Pantallas de administración (16, 17) y shell de SazónPOS (26).
- axe-core en CI y matriz multinavegador (27).

Cada uno, si llega, va en su propio spec.
