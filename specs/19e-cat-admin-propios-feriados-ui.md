# SPEC 19e — Catálogos: admin cliente de propios y ajustes, feriados en las dos apps y panel lateral para formularios

> **Status:** Implementado
> **Depends on:** SPEC 19c, SPEC 19d, SPEC 17c, SPEC 15, SPEC 15b, SPEC 15c
> **Date:** 2026-11-08
> **Objective:** Dar al administrador del tenant, en `plataforma-admin`, la gestión de sus ítems propios y de los ajustes de los ítems globales, y crear `libs/plataforma/feriados` con una lista paginada por año que la consola usa para los feriados GLOBAL y admin para los del tenant y de sucursal, con los formularios en un panel lateral nuevo de `shared/ui`.

## Por qué existe este spec

Es la mitad de la fila 19d original de `docs/roadmap-specs.md`. El 19d se partió: la consola quedó en el 19d y esto en el 19e. Contexto: `docs/spec-context/19-cat-catalogos.md`.

Cubre la UI de RF-025 y RF-026, la parte de **D-05** que no tenía dueño, y la UI de RF-029. El plan da 6 h a D-05 completa. Las de parámetros y series no entran aquí.

Lo que deja el 19d y este spec usa:

- `libs/plataforma/catalogos-ui` (`type:ui`):
  - `vit-formulario-item`, con el editor de atributos;
  - modelos de ítem y atributos;
  - `TONOS_ESTADO_ITEM`;
  - `hoyEnLima`.
- Manifiesto PLAT `1.12.0` con «Consola > Catálogos».
- El patrón de borrar un ítem con 409 `ITEM_REFERENCIADO` y ofrecer cerrar su vigencia hoy.

Lo que hay en el back hoy (revisado al redactar):

- `GET /v1/catalogos/{codigo}/items/administracion` (19c) trae globales y propios con `propio`, `estado` y `ajuste { visible, orden, alias, version } | null`. Pagina en el servidor, con `tamano` de 1 a 100.
- `PUT /v1/catalogos/{codigo}/items/{id}/ajuste` (19a) recibe `{ visible, orden?, alias?, version? }`. Un ajuste neutro (visible, sin orden ni alias) borra la fila.
- Ítems propios (19a): hay `POST`, `PUT` y `DELETE` de `items`, pero no hay `GET` por id.
- `GET /v1/feriados?anio=&sucursal_id=` (19c) devuelve el año entero sin paginar, con `editable`.
- `SesionService` trae las sucursales accesibles de `mi-contexto` (`id`, `empresaId`, `codigo`, `nombre`).
- `permisoGuard` acepta una lista y la evalúa como OR.
- `shared/ui` trae `TAMANOS_PAGINA = [20, 50, 100]`, `TAMANO_PAGINA_POR_DEFECTO` y `filasDePagina`.
- `PLAT_ADMIN_CONFIGURACION` tiene `catalogo.leer`, `personalizar`, `item_propio` y `feriado.gestionar`.

RF cubiertos (UI):

- **TR-RF-025**: personalizar ítems globales.
- **TR-RF-026**: ítems propios.
- **TR-RF-029**: gestionar feriados.

Criterios del SRS en lo que toca a la UI: **TR-CA-066, 067, 068, 069, 076 y 077**. Los de panel lateral, paginación y modo por app son propios.

Reglas:

- **TR-RN-012**: los globales normativos no se personalizan; MIXTO admite ajustes y propios.
- **TR-RN-013**: un ítem referenciado no se borra.
- **TR-RN-001**: el tenant sale del contexto.

RNF propios:

- **TR-RNF-021**: confirmación antes de borrar o restablecer.
- **TR-RNF-008**: botón de envío deshabilitado mientras viaja la petición.
- **TR-RNF-018**: 360, 600, 768 y 1280 px.
- **TR-RNF-019**: axe-core sin `critical` ni `serious`.
- **TR-RNF-122**: solo tokens.
- **TR-RNF-027**: catálogos propios sin cambios de código.

RNF heredados: 010, 012, 024/119, 026, 101.

Estimado: 9-10 h. Si se pasa, se recorta primero el filtro por alcance de la lista de feriados en admin.

## Diseño UI

| Pantalla | Pantalla tipo | Cambia en |
| --- | --- | --- |
| Lista de catálogos (admin) | Lista | Paginador en el cliente; los GLOBAL con chip «Solo lectura» |
| Detalle de catálogo con ítems (admin) | Lista | Interruptor «Visible» en la fila, columna de origen y alias bajo el nombre |
| Formulario de ítem propio | Formulario | El de la consola (`vit-formulario-item`) |
| Panel de ajuste | **Nueva**: panel lateral | Alias, orden y visible |
| Feriados por año (las dos apps) | Lista | Selector de año ‹ 2026 › y filtros de sucursal y alcance en admin |
| Panel de feriado | **Nueva**: panel lateral | Alcance, sucursal, fecha, nombre y recurrente |
| Confirmaciones (borrar, cerrar vigencia, restablecer) | Confirmación | — |

- El **panel lateral** es nuevo y sirve para todo diálogo con formulario. Lo pidió el usuario.
- Después de guardar este spec se dibujan en el canvas «Vitrina · Diseño UI» (https://claude.ai/artifact/UGvcmiWUiBsMuWerqMiWxh), en una página «19e · Admin catálogos», en claro y oscuro y a 600 px:
  - el detalle con ítems;
  - el panel de ajuste;
  - los feriados por año;
  - el panel de feriado.
- El usuario revisa el canvas antes de aprobar. Si el canvas cambia algo, se corrige el spec.

### Panel lateral (`shared/ui`)

- Va pegado a la derecha, con todo el alto (`100dvh`) y un ancho de `min(480px, 100vw)`. A 600 px o menos ocupa todo el ancho.
- **Entrada**: `translateX(100%)` → `0`, con la opacidad de 0 a 1, en 280 ms con `cubic-bezier(0.05, 0.7, 0.1, 1)` (emphasized decelerate de M3).
- **Salida**: `0` → `translateX(100%)` en 200 ms con `cubic-bezier(0.3, 0, 0.8, 0.15)` (emphasized accelerate).
- Con `prefers-reduced-motion: reduce` solo cambia la opacidad, en 150 ms.
- **Estructura**:
  - cabecera con título (`h2`) y botón cerrar (`aria-label="Cerrar"`);
  - cuerpo con scroll;
  - pie fijo con `vit-acciones-formulario`.
- **Cierre**: con Esc, con la X y con «Cancelar». Un clic en el fondo no lo cierra, para no perder lo escrito.
- El foco va al primer campo al abrir y vuelve al botón que lo abrió al cerrar (`MatDialog`).
- Las duraciones y curvas son tokens de `tema.css`:
  - `--duracion-panel-entrada: 280ms`;
  - `--duracion-panel-salida: 200ms`;
  - `--curva-entrada`;
  - `--curva-salida`.
- Las confirmaciones siguen con `AvisosService` (SweetAlert2). El panel es solo para formularios.

## Alcance

**In:**

- **`libs/shared/ui`**:
  - `PanelLateralService`;
  - `vit-panel-lateral` (el marco);
  - tokens de animación en `tema.css`;
  - estilos del panel en `material.scss`.
- **`libs/plataforma/feriados`** (nueva, `scope:plataforma`, `type:feature`):
  - `FERIADOS_ROUTES`, con `data.alcances`;
  - `FeriadosPage`;
  - `formulario-feriado` (contenido del panel);
  - `FeriadosCliente` y modelos.
- **`libs/plataforma/admin-cliente`**:
  - páginas `catalogos-lista`, `catalogo-detalle` e `item-propio-formulario`;
  - componente `panel-ajuste`;
  - `CatalogosAdminCliente`;
  - rutas `catalogos` y `feriados`.
- **`apps/plataforma-consola`**: ruta `consola/feriados`, con `data.alcances = ['GLOBAL']`.
- **Back (`libs/plataforma/catalogos`)**:
  - ruta nueva `GET /v1/catalogos/{codigo}/items/{id}`;
  - paginación y filtro `alcance` en `GET /v1/feriados`.
- **Manifiesto PLAT `1.13.0`**: 3 opciones de menú.
- **`CLAUDE.md`**: regla del panel lateral en «Diseño UI».
- **`docs/roadmap-specs.md`**: fila 19e con el estado de este spec.
- **Pruebas**:
  - Vitest zoneless con `HttpTestingController`;
  - supertest de las dos rutas tocadas;
  - verificación en navegador con el MCP `playwright` contra Supabase dev.

**Out of scope (para otros specs):**

- **UI de parámetros y series** (RF-030 a 033 y 035): el resto de D-05. Las opciones de menú existen, pero no hay pantallas. Va en un spec aparte.
- **Arrastrar para reordenar ítems.** El orden se escribe como número.
- **Vista de calendario anual de feriados.**
- **Migrar a panel lateral los diálogos con formulario que ya existen**, si los hay: la regla aplica a pantallas nuevas.
- **Que un administrador de sucursal gestione los feriados de su sede.** Se descartó en el 19c.
- **`<ui-catalogo-select>`.**
- **E2E y axe en CI**: spec 27.
- **Prod.**

## Base de código reutilizada

**Se conserva sin cambios:**

- Spec 19d:
  - de `catalogos-ui`: `vit-formulario-item`, `TONOS_ESTADO_ITEM` y `hoyEnLima`;
  - el patrón «borrar → `ITEM_REFERENCIADO` → cerrar vigencia hoy».
- Spec 15 y 15b: `vit-tabla`, `vit-chip-estado`, `vit-filtros` (`valorInicial`), `vit-cargando`, `vit-estado-vacio`, `vit-acciones-formulario`, `AvisosService`, `vit-destructivo`, `TAMANOS_PAGINA`, `tamanoPaginaDesdeTexto`, `tamanoPaginaParaUrl` y `filasDePagina`.
- Spec 16a y 17c: patrón de páginas de `admin-cliente`:
  - filtros y página en la URL;
  - `AdaptadorFechaPeru` y `CalendarioEnEspanol`, que ya están en `admin-cliente/services`;
  - mapa de errores en `models/`.
- Spec 13: `SesionService` (sucursales accesibles, `tiene`), `permisoGuard` y `*siPermiso`.

**Cambia:**

- `libs/plataforma/catalogos/src/interface/catalogos.controller.ts`: `@Get(':codigo/items/:id')` con `plat.catalogo.item_propio`, después de `items/administracion`. Caso de uso nuevo `ObtenerItemPropio`.
- `libs/plataforma/catalogos/src/interface/feriados.controller.ts` y `ListarFeriados`:
  - entrada: `pagina` (≥ 1, por defecto 1), `tamano` (1-100, por defecto 20) y `alcance?` (`GLOBAL`, `TENANT`, `SUCURSAL`);
  - respuesta: `{ items, total, pagina, tamano }` en lugar de un arreglo.
- `apps/plataforma-admin` no cambia: `admin-cliente` ya se monta bajo `admin`.
- `plat.manifiesto.json`: `1.12.0` → `1.13.0`, o la versión siguiente libre al implementar.

## Modelo de datos

No hay tablas nuevas.

### Back

```ts
// GET /v1/catalogos/{codigo}/items/{id}  →  200 ItemDto (19a), con version y atributos
// 404 CATALOGO_NO_EXISTE; 404 ITEM_NO_ENCONTRADO si no es UUID, es global, es de otro tenant o de otro catálogo.

// GET /v1/feriados?anio=2026&sucursal_id=&alcance=&pagina=1&tamano=20
//   → 200 { items: FeriadoDelAnioDto[], total: number, pagina: number, tamano: number }
```

- `ObtenerItemPropio` lee con el tenant del contexto. La RLS deja fuera los ítems de otros tenants.
- **`ListarFeriados`**:
  1. calcula el año como hoy, con los recurrentes proyectados;
  2. filtra por `alcance` si viene;
  3. ordena por `fecha_en_anio` y después por `nombre`;
  4. corta la página.
  - `total` es el número de filas antes de cortar.
  - Son menos de 50 filas por año, así que se corta en memoria, después de proyectar. El SQL del 19c no cambia.
  - Una `pagina` mayor que la última devuelve `items: []` con el `total` real.
- **Cambio de contrato del 19c.** No hay consumidores: la UI nace en este spec y `CalendarioPort` no usa la ruta. Se anota en el cierre del 19c.

### Front, `libs/plataforma/feriados`

```
src/
  index.ts                                export { FERIADOS_ROUTES }
  lib/feriados.routes.ts                  '' → FeriadosPage (data.alcances la pone la app)
  lib/models/feriado.ts                   AlcanceFeriado, FeriadoDelAnio, SolicitudFeriado, FiltroFeriados, mapeos
  lib/models/tonos-alcance.ts             TONOS_ALCANCE_FERIADO
  lib/models/mensajes-feriados.ts, error-feriados.ts
  lib/config/datos-ruta-feriados.ts       CLAVE_ALCANCES y lectura tipada de data.alcances
  lib/services/feriados.cliente.ts        listar, crear, actualizar, eliminar
  lib/services/adaptador-fecha-peru.service.ts, calendario-en-espanol.service.ts   (copiados)
  lib/pages/feriados/                     feriados.page.{ts,html}
  lib/components/formulario-feriado/      contenido del panel lateral
  lib/components/selector-anio/           ‹ 2026 ›
  lib/utils/filtro-url.ts, dia-semana.ts
  testing/
```

```ts
export type AlcanceFeriado = 'GLOBAL' | 'TENANT' | 'SUCURSAL';
export interface FeriadoDelAnio {
  id: string; alcance: AlcanceFeriado; sucursalId: string | null; fecha: string; fechaEnAnio: string;
  nombre: string; recurrenteAnual: boolean; version: number; editable: boolean;
}
export interface FiltroFeriados { anio: number; sucursalId?: string; alcance?: AlcanceFeriado; pagina: number; tamano: number }
export const ANIO_MINIMO = 2000;
export const ANIO_MAXIMO = 2100;
```

- **Modo por app** (`data.alcances`):

  | App | `alcances` | La lista muestra | El panel crea |
  | --- | --- | --- | --- |
  | Consola (`/consola/feriados`) | `['GLOBAL']` | Solo globales: pide `alcance=GLOBAL` | GLOBAL |
  | Admin (`/admin/feriados`) | `['TENANT', 'SUCURSAL']` | Globales, del tenant y de sucursal | TENANT o SUCURSAL |

- Una fila tiene «Editar» y «Borrar» solo si `editable` es true y su alcance está en `alcances`. En admin, los globales se ven en solo lectura aunque el usuario sea del operador.
- `TONOS_ALCANCE_FERIADO`:
  - `GLOBAL` → `info`;
  - `TENANT` → `exito`;
  - `SUCURSAL` → `neutro`.

### Front, `libs/plataforma/admin-cliente` (agrega)

```
lib/services/catalogos-admin.cliente.ts     listar, items (administracion), obtenerPropio, crearPropio, actualizarPropio,
                                            eliminarPropio, ajustar
lib/models/catalogo-admin.ts                CatalogoAdmin, FilaItemAdmin (con origen y ajuste), FiltroItemsAdmin, mapeos
lib/models/permisos-catalogos-admin.ts      leer, personalizar, itemPropio, feriadoGestionar
lib/models/mensajes-catalogos-admin.ts
lib/pages/catalogos-lista/
lib/pages/catalogo-detalle/
lib/pages/item-propio-formulario/
lib/components/panel-ajuste/                contenido del panel lateral
```

### `shared/ui`

```ts
// services/panel-lateral.service.ts  (@Injectable({ providedIn: 'root' }))
abrir<Componente, Datos, Resultado>(componente: ComponentType<Componente>,
  opciones: { datos: Datos }): MatDialogRef<Componente, Resultado>;
// MatDialog con position { right: '0' }, height '100dvh', width 'min(480px, 100vw)', maxWidth '100vw',
// panelClass 'vit-panel-lateral', backdropClass 'vit-panel-lateral-fondo', disableClose: true (Esc lo maneja el marco),
// autoFocus 'first-tabbable', restoreFocus true.

// components/panel-lateral/panel-lateral.component.ts  (<vit-panel-lateral [titulo]>)
// slots: contenido por defecto y [accionesPanel] para el pie. Esc y la X llaman a dialogRef.close().
```

## Rutas

**Admin (`ADMIN_CLIENTE_ROUTES`)**:

| Ruta | Página | Guard |
| --- | --- | --- |
| `/admin/catalogos` | `CatalogosListaPage` | `permisoGuard([personalizar, item_propio])` |
| `/admin/catalogos/:codigo` | `CatalogoDetallePage` | igual |
| `/admin/catalogos/:codigo/items/nuevo` | `ItemPropioFormularioPage` | `permisoGuard(item_propio)` |
| `/admin/catalogos/:codigo/items/:id/editar` | `ItemPropioFormularioPage` | `permisoGuard(item_propio)` |
| `/admin/feriados` | `FERIADOS_ROUTES` con `data.alcances = ['TENANT','SUCURSAL']` | `permisoGuard(feriado.gestionar)` |

**Consola** (`apps/plataforma-consola/src/app/app.routes.ts`):

- `consola/feriados`, antes de `consola`, con `aal2Guard` y `permisoGuard(feriado.gestionar)`;
- `data.alcances = ['GLOBAL']`.

## Pantallas

**Lista de catálogos (`/admin/catalogos`):**

- `GET /v1/catalogos` una vez. Filtros `q` y `alcance` en la URL.
- Paginador con `TAMANOS_PAGINA` y `filasDePagina` en el cliente. La ruta no pagina y son decenas de filas.
- Columnas: código, nombre, alcance (chip) y «Qué puede hacer»:
  - GLOBAL: «Solo lectura»;
  - MIXTO: «Ítems propios y ajustes»;
  - TENANT: «Ítems propios».
- Enlace › al detalle.

**Detalle (`/admin/catalogos/:codigo`):**

- Cabecera:
  - código, nombre y alcance;
  - en GLOBAL, la nota «Catálogo normativo: se consulta, no se personaliza» (TR-CA-067).
- **Tabla** sobre `items/administracion`:
  - filtros `texto`, `estado` y, solo en MIXTO, `origen` (`GLOBAL`, `PROPIO`);
  - `pagina` y `tamano`, con el estándar 20/50/100, todo en la URL.
- **Columnas:**
  - código;
  - nombre: si hay alias, el alias y debajo «Global: {nombre}» en texto suave;
  - origen (chip «Global» o «Propio»);
  - orden efectivo;
  - vigencia;
  - estado (chip);
  - «Visible», con un `mat-slide-toggle` de 32 px; solo en filas globales de MIXTO y con `personalizar`;
  - acciones.
- **Acciones de una fila global en MIXTO**, con `personalizar`:
  - **Interruptor «Visible»** (TR-CA-066):
    - envía `PUT .../ajuste` con `visible` cambiado, y el `orden`, el `alias` y la `version` del ajuste actual;
    - el interruptor queda deshabilitado mientras viaja;
    - si falla, vuelve a su valor y se avisa;
    - al terminar, toast «Plin oculto para su empresa» o «Plin visible otra vez» y recarga de la fila.
  - **«Personalizar»**: abre el panel lateral `panel-ajuste` con `alias` (1-200, opcional), `orden` (entero opcional) y `visible`. Al guardar, envía el ajuste. Con `cambiado: false`, toast «No había cambios».
  - **«Restablecer»**:
    - solo si hay ajuste;
    - `confirmar` «¿Volver a los valores globales de {nombre}?»;
    - envía `{ visible: true, orden: null, alias: null, version }`, el ajuste neutro que borra la fila.
- **Acciones de una fila propia**, con `item_propio`:
  - «Editar»: va al formulario;
  - «Borrar»: con `vit-destructivo` y el mismo flujo del 19d (`ITEM_REFERENCIADO` → cerrar vigencia hoy con `GET items/{id}` y `PUT`).
- Botón «Nuevo ítem propio» en MIXTO y TENANT con `*siPermiso="plat.catalogo.item_propio"`.
- GLOBAL: ni acciones ni interruptor.
- `VERSION_OBSOLETA` en un ajuste: alerta «Otro usuario modificó el registro; recargue» y recarga de la página de la tabla.

**Formulario de ítem propio (`items/nuevo`, `items/:id/editar`):**

- Usa `vit-formulario-item` de `catalogos-ui`.
- Editar carga con `GET .../items/{id}`.
- Envía a `POST` o `PUT .../items`.
- `CODIGO_DUPLICADO` va al campo `codigo` con «El código ya existe en el catálogo» (TR-CA-069). Pasa también si choca con un global.
- Éxito: vuelve al detalle con `origen=PROPIO` y toast «Ítem creado» o «Ítem actualizado».

**Feriados (`/consola/feriados` y `/admin/feriados`):**

- **Selector de año** `‹ 2026 ›`:
  - por defecto el año de hoy en Lima;
  - entre `ANIO_MINIMO` y `ANIO_MAXIMO`, con las flechas deshabilitadas en los bordes;
  - va en la URL como `anio`, y cambiarlo vuelve a la página 1.
- **En admin**, `vit-filtros`:
  - `sucursal`, con las sucursales de `mi-contexto` y la opción «Todas»;
  - `alcance` (Global, Empresa, Sucursal).
  - Van en la URL con `pagina` y `tamano`.
- **En la consola** no hay filtros, y se pide `alcance=GLOBAL`.
- **`vit-tabla` con paginación en el servidor** (`total`) y `TAMANOS_PAGINA`:
  - columnas fecha (`fecha_en_anio`, `dd/MM/yyyy`), día (`lunes`… en español), nombre, alcance (chip), sucursal (nombre desde `mi-contexto`, o «—»), «Se repite cada año» (sí o no) y acciones;
  - solo en admin, la columna sucursal.
  - En celular: fecha y nombre como título, alcance como chip y día como detalle.
- **Botón «Nuevo feriado»**: abre el panel lateral `formulario-feriado`.
- **Panel de feriado:**
  - **Campos:**
    - `alcance`: solo en admin, botones segmentados «Toda la empresa» (TENANT) o «Una sucursal»; en la consola es GLOBAL fijo y en su lugar se lee «Feriado nacional (GLOBAL): aplica a todos los tenants»;
    - `sucursal`: select, obligatorio si el alcance es SUCURSAL;
    - `fecha`: datepicker con `AdaptadorFechaPeru`;
    - `nombre`: de 3 a 100;
    - `recurrente_anual`: casilla «Se repite cada año desde esta fecha».
  - **Al editar**, el alcance y la sucursal van en solo lectura (el 19c no los deja cambiar). Los datos salen de la fila, que trae `version`.
  - **Al guardar:** `POST` o `PUT` con `version`, el botón deshabilitado mientras viaja, y luego se cierra el panel con un toast y se recarga la página de la tabla.
  - **Errores:**
    - `FERIADO_DUPLICADO` va al campo `fecha` con «La fecha ya está registrada como feriado» (TR-CA-077), y el panel no se cierra;
    - `FERIADO_INVALIDO` muestra el mensaje en el campo que corresponde o como alerta;
    - `SUCURSAL_NO_ENCONTRADA` va al campo `sucursal`;
    - `VERSION_OBSOLETA` y `OPERADOR_REQUERIDO` van como alerta.
- **«Borrar»**: `confirmarDestructiva` «¿Borrar el feriado {nombre} del {fecha}?», sin motivo, y luego `DELETE` con `version`. Si es recurrente, el texto agrega «Dejará de aplicar en todos los años».
- `vit-cargando` y `vit-estado-vacio` («No hay feriados registrados para 2027»).

## Menú (manifiesto PLAT `1.13.0`)

```json
{ "codigo": "plat.configuracion.catalogos", "modulo": "configuracion", "padre": "plat.configuracion", "nombre": "Catálogos",
  "ruta": "/admin/catalogos", "icono": "library_books", "orden": 3, "permisos": ["plat.catalogo.personalizar", "plat.catalogo.item_propio"] },
{ "codigo": "plat.configuracion.feriados", "modulo": "configuracion", "padre": "plat.configuracion", "nombre": "Feriados",
  "ruta": "/admin/feriados", "icono": "event", "orden": 4, "permisos": ["plat.feriado.gestionar"] },
{ "codigo": "plat.consola.feriados", "modulo": "consola", "padre": "plat.consola", "nombre": "Feriados",
  "ruta": "/consola/feriados", "icono": "event", "orden": 4, "permisos": ["plat.catalogo.item_gestionar"] }
```

- «Consola > Feriados» usa `item_gestionar`, como «Catálogos» en el 19d. Así no la ve un administrador de configuración de un tenant cliente. La ruta exige `feriado.gestionar`.
- Sin permisos ni roles nuevos.

## Plan de implementación

1. **Back: ítem propio por id y feriados paginados.**
   - `ObtenerItemPropio` y su ruta.
   - `ListarFeriados` con `alcance`, orden y página, y su DTO de página. Se actualizan las pruebas del 19c que esperaban un arreglo.
   - Pruebas:
     - un propio se lee;
     - un global, de otro tenant o que no es UUID da 404;
     - 2027 con `tamano=5` da 5 filas y el `total` real;
     - `alcance=GLOBAL` solo trae globales;
     - una página más allá de la última da `items: []`;
     - `tamano` 101 da 400.
   - Verificar: `pnpm nx test catalogos` y las rutas en `/v1/docs`.
2. **`shared/ui`: panel lateral.**
   - `PanelLateralService`, `vit-panel-lateral`, los tokens de animación y los estilos con `prefers-reduced-motion`.
   - Pruebas:
     - abre con `panelClass` `vit-panel-lateral` y `disableClose`;
     - Esc y la X cierran;
     - un clic en el fondo no cierra;
     - el foco vuelve al botón que lo abrió.
   - Agregar una muestra en `/dev/componentes` de `plataforma-admin`.
   - Verificar: `pnpm nx run-many -t lint test build -p shared-ui plataforma-admin`.
3. **Lib `feriados`.**
   - Generador Nx, modelos, cliente, `selector-anio`, `formulario-feriado` y `FeriadosPage` con el modo por `data.alcances`.
   - Pruebas:
     - el año por defecto es el de Lima;
     - las flechas respetan 2000 y 2100;
     - los filtros y la página van en la URL;
     - la consola pide `alcance=GLOBAL` y no muestra filtros;
     - en admin, un global no tiene acciones aunque `editable` sea true;
     - SUCURSAL exige sucursal;
     - `FERIADO_DUPLICADO` va al campo `fecha` y no cierra el panel;
     - al editar, el alcance va en solo lectura;
     - borrar un recurrente avisa que deja de aplicar en todos los años;
     - doble clic envía una sola petición.
4. **Rutas de feriados en las dos apps y manifiesto `1.13.0`.**
   - `consola/feriados` y `admin/feriados` con su `data`.
   - Las tres opciones de menú.
   - Verificar:
     - `pnpm nx run-many -t lint test build -p plataforma-feriados plataforma-consola plataforma-admin`;
     - `pnpm manifiesto:aplicar` dos veces, con 0 cambios la segunda.
5. **Admin: lista y detalle de catálogos con ajustes.**
   - `CatalogosAdminCliente`, `catalogos-lista`, `catalogo-detalle` y `panel-ajuste`.
   - Pruebas:
     - GLOBAL sin acciones y con la nota (TR-CA-067);
     - apagar «Plin» envía `visible: false` con el `alias`, el `orden` y la `version` actuales, y un error revierte el interruptor (TR-CA-066);
     - «Personalizar» envía el alias;
     - «Restablecer» envía el ajuste neutro;
     - `origen` solo aparece en MIXTO;
     - sin `personalizar` no hay interruptor;
     - sin `item_propio` no hay «Nuevo ítem propio».
6. **Admin: formulario de ítem propio y borrar.**
   - `item-propio-formulario` con `vit-formulario-item`, y borrar con cierre de vigencia.
   - Pruebas:
     - crear «Medicina General» con código `MED_GEN` en ESPECIALIDAD con 409 muestra «El código ya existe en el catálogo» (TR-CA-069);
     - un propio nuevo aparece con origen «Propio» (TR-CA-068);
     - recargar `items/:id/editar` lo carga con `GET items/{id}`;
     - `ITEM_REFERENCIADO` ofrece cerrar la vigencia.
7. **Regla y roadmap.**
   - `CLAUDE.md`, sección «Diseño UI»: «Todo diálogo con formulario usa el panel lateral de `shared/ui` (`PanelLateralService`, desde la derecha); las confirmaciones siguen con `AvisosService`».
   - `docs/roadmap-specs.md`: estado de la fila 19e.
8. **Verificación en navegador** (MCP `playwright`, con `nx serve api`, `plataforma-admin` y `plataforma-consola` contra Supabase dev).
   - Recorrer los criterios de UI en claro y oscuro y a 360, 600 y 1280 px, con la consola sin errores.
   - axe-core en las pantallas nuevas y en el panel abierto.
   - Capturas, incluida la animación del panel a medio camino.
   - Casos:
     - administrador de «Sabores del Sur» con `PLAT_ADMIN_CONFIGURACION`: ocultar «Plin», crear un propio y crear un feriado de la sucursal «Cusco»;
     - operador en la consola: crear un feriado GLOBAL de Semana Santa 2028;
     - el mismo operador en admin ve ese global en solo lectura.
   - Borrar los datos de prueba al final.

## Criterios de aceptación

**Ajustes (TR-RF-025):**

- [ ] Apagar «Visible» de «Plin» en MEDIO_PAGO lo deja `OCULTO` para el tenant, y otro tenant lo sigue viendo visible (TR-CA-066).
- [ ] Si el `PUT` del ajuste falla, el interruptor vuelve a su valor anterior y se avisa el error.
- [ ] Un alias guardado en «Personalizar» se muestra en la tabla, con el nombre global debajo.
- [ ] «Restablecer» deja el ítem sin ajuste (`ajuste: null`).
- [ ] TIPO_COMPROBANTE (GLOBAL) se ve en solo lectura, sin interruptor, sin acciones y con la nota de catálogo normativo (TR-CA-067).

**Ítems propios (TR-RF-026):**

- [ ] Crear la especialidad propia «Nutrición clínica» en ESPECIALIDAD la muestra con origen «Propio» solo para esa clínica (TR-CA-068).
- [ ] El código `MED_GEN`, que ya existe como global, muestra «El código ya existe en el catálogo» en el campo `codigo` (TR-CA-069).
- [ ] Recargar `items/:id/editar` carga el ítem desde `GET .../items/{id}`. Un id global en esa ruta muestra «El ítem no existe».
- [ ] Borrar un propio referenciado ofrece cerrar su vigencia hoy.

**Feriados (TR-RF-029):**

- [ ] En admin, un feriado de la sucursal «Cusco» aparece con alcance «Sucursal» y filtrar por «Miraflores» no lo muestra (TR-CA-076, parte de UI).
- [ ] Registrar el 08/10/2026 como feriado de la empresa muestra «La fecha ya está registrada como feriado» en el campo `fecha`, y el panel sigue abierto (TR-CA-077).
- [ ] En 2027, los recurrentes de la semilla aparecen con su fecha de 2027. En admin no tienen acciones, ni para el operador.
- [ ] En la consola solo se listan globales y el panel crea GLOBAL sin preguntar el alcance.
- [ ] La tabla tiene paginador con 20, 50 y 100 por página. `anio`, `pagina` y `tamano` sobreviven a recargar.
- [ ] El selector de año no baja de 2000 ni sube de 2100.

**Panel lateral:**

- [ ] El panel entra desde la derecha en unos 280 ms y sale en unos 200 ms. Con movimiento reducido solo cambia la opacidad.
- [ ] Esc, la X y «Cancelar» cierran el panel. Un clic en el fondo no lo cierra.
- [ ] El foco va al primer campo al abrir y vuelve al botón que lo abrió al cerrar.
- [ ] A 600 px el panel ocupa todo el ancho y su pie con las acciones queda visible.

**Menú y acceso:**

- [ ] Un administrador con `PLAT_ADMIN_CONFIGURACION` ve «Configuración > Catálogos» y «Configuración > Feriados» en admin. En la consola no ve «Feriados».
- [ ] El operador ve «Consola > Feriados».
- [ ] La versión `1.13.0` figura en `seg.manifiesto_aplicado` de dev, y aplicarla dos veces da 0 cambios.

**Back:**

- [ ] `GET /v1/feriados` responde `{ items, total, pagina, tamano }`, con `alcance` filtrando y `tamano` 101 en 400.
- [ ] `GET /v1/catalogos/{codigo}/items/{id}` responde 404 para un global o un propio de otro tenant.
- [ ] Las dos rutas figuran en `/v1/docs` con sus códigos de error.

**Calidad y estructura:**

- [ ] `feriados` tiene `type:feature` y `scope:plataforma`, exporta solo `FERIADOS_ROUTES` e importa solo de `shared/*`.
- [ ] `admin-cliente` importa `vit-formulario-item` de `catalogos-ui` y no de `consola-catalogos`.
- [ ] Ningún diálogo nuevo con formulario usa un modal centrado. `CLAUDE.md` tiene la regla del panel lateral.
- [ ] Las pantallas nuevas se usan a 360, 600, 768 y 1280 px sin scroll horizontal de página, en claro y oscuro. axe-core sin `critical` ni `serious`.
- [ ] Sin hex sueltos. Campos de 40 px y botones de fila de 32 px.
- [ ] Las pantallas coinciden con la página «19e · Admin catálogos» del canvas.
- [ ] El código nuevo sigue «Código limpio» de `CLAUDE.md` y pasó por `code-simplifier`.
- [ ] `pnpm nx run-many -t lint test build` termina con código 0 y `nx affected` está en verde en CI.
- [ ] La verificación en navegador con el MCP `playwright` está hecha, con capturas y consola sin errores. Si no se pudo, se dice en el cierre.
- [ ] Las horas reales de D-05 (parte de RF-025/026) y de la UI de RF-029 quedan registradas en el plan.

## Decisiones

- **Sí: formulario de ítem y editor de atributos en `libs/plataforma/catalogos-ui`, desde el 19d.** Lo decidió el usuario. El 19d se corrigió para crearlos ahí; nada se mueve después.
- **No: que admin importe de `consola-catalogos`.** Admin quedaría dependiendo de una lib de consola.
- **No: copiar el formulario en `admin-cliente`.** Duplicaría el editor de atributos.
- **Sí: en admin, los GLOBAL en solo lectura.** Lo decidió el usuario. El tenant ve los valores oficiales que usa (TR-CA-067).
- **Sí: interruptor «Visible» en la fila y panel «Personalizar» para alias y orden.** Lo decidió el usuario. Ocultar es lo más frecuente y queda a un clic.
- **Sí: el modo de la página de feriados sale de `data.alcances` de la ruta.** Lo decidió el usuario. En admin, los globales son de solo lectura también para el operador; cada app hace una sola cosa.
- **No: decidir solo con `editable`.** El operador podría editar globales desde admin.
- **Sí: formularios en panel lateral desde la derecha, en `shared/ui`, como regla de `CLAUDE.md`.** Lo pidió y decidió el usuario.
- **Sí: animación con CSS sobre `MatDialog`, de 280 ms al entrar y 200 ms al salir, con curvas emphasized de M3.** La propuso Claude y la aceptó el usuario.
- **No: `animate.css` (`animate__fadeInRight`).** Una dependencia entera por una keyframe, y sin las curvas de M3.
- **Sí: el panel no se cierra con un clic en el fondo.** Evita perder lo escrito. Esc, la X y «Cancelar» sí lo cierran.
- **Sí: las confirmaciones siguen con `AvisosService`.** El panel es para formularios, no para preguntas.
- **Sí: feriados paginados en el back, con paginador y combo de registros como el resto de tablas.** Lo decidió el usuario. Cambia el contrato del 19c, que aún no tiene consumidores.
- **Sí: filtro `alcance` en `GET /v1/feriados`.** Con paginación en el back, la consola no puede filtrar los globales en el cliente sin romper el `total`.
- **No: paginar en el cliente con `filasDePagina`.** Lo descartó el usuario para feriados.
- **Sí: lista de catálogos de admin paginada en el cliente.** `GET /v1/catalogos` no pagina y son decenas de filas. Mismo criterio que la lista de catálogos del 19d.
- **Sí: «Consola > Feriados» con el permiso `item_gestionar`.** Lo decidió el usuario, igual que «Catálogos» del 19d.
- **Sí: «Configuración > Catálogos» y «Configuración > Feriados» en admin.** Lo decidió el usuario.
- **Sí: ruta nueva `GET items/{id}` para propios.** Lo decidió el usuario. Mismo patrón que `items-globales/{id}` del 19d.
- **Sí: feriado en panel lateral con los datos de la fila.** Lo decidió el usuario. Son 5 campos y la fila trae `version`; no hace falta `GET` por id.
- **Sí: tabla por año con selector ‹ año ›, sin calendario anual.** Lo decidió el usuario.
- **Sí: sucursales del selector desde `mi-contexto`.** Ya están en `SesionService`, sin otra petición.
- **Sí: dibujar las pantallas del 19e en el canvas después de guardar el spec.** Lo decidió el usuario.

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| `MatDialog` de Angular Material 21 no deja reemplazar la animación de salida | Se usa `exitAnimationDuration` con la duración del token y se aplica la keyframe por `panelClass`. Si no alcanza, la salida queda con fundido y se anota en el cierre. |
| Cambiar la respuesta de `GET /v1/feriados` rompe pruebas del 19c | El paso 1 las actualiza. Se busca en el repo cualquier otro uso antes de cambiar. |
| Doble clic en el interruptor manda dos ajustes con la misma `version` | El interruptor se deshabilita mientras viaja. El segundo da `VERSION_OBSOLETA` y se recarga la fila. |
| El administrador cree que ocultar un ítem lo borra para todos | Toast «oculto para su empresa» y nota en la cabecera: «Los cambios solo afectan a su empresa». |
| `mi-contexto` no trae una sucursal nueva hasta recargar | El selector usa lo que hay. El 17c ya recarga el contexto al crear sucursales (`RecargaContextoService`). |
| Pasarse de 10 h | Se recorta el filtro por alcance de admin. El de la consola es parte del contrato. |

## Lo que **no** está en este spec

- UI de parámetros y series (resto de D-05).
- Arrastrar para reordenar.
- Calendario anual.
- Migrar diálogos existentes al panel lateral.
- Feriados gestionados por un administrador de sucursal.
- `<ui-catalogo-select>`.
- E2E y axe en CI (spec 27).
- Prod.

Cada uno entra en su propio spec cuando su sprint lo pida.
