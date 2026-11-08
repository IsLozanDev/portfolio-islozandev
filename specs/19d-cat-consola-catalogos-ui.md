# SPEC 19d — Catálogos: consola de catálogos, ítems globales e importación con seguimiento global de avance

> **Status:** Aprobado
> **Depends on:** SPEC 19a, SPEC 19b, SPEC 19c, SPEC 15, SPEC 15b, SPEC 15c, SPEC 15d, SPEC 17b
> **Date:** 2026-11-08
> **Objective:** Crear `libs/plataforma/consola-catalogos` para que el operador administre desde `plataforma-consola` los catálogos, sus ítems globales con vigencia y la importación de las tablas oficiales, con un seguimiento del avance que vive en el shell y avisa con un toast al terminar (D-06).

## Por qué existe este spec

Fila 19d de `docs/roadmap-specs.md`. Contexto: `docs/spec-context/19-cat-catalogos.md`. Historia **D-06** (sprint 7, 3 h de front según el plan).

La fila 19d del roadmap juntaba la consola (D-06) y la UI del admin cliente para los propios, los ajustes y los feriados (RF-025, RF-026 y la UI de RF-029, la parte de D-05 sin dueño). Eso daba unas 14-16 h y pasaba el tope de 10 h. El usuario decidió partirla:

- **19d** (este spec): la consola. Catálogos, ítems globales, importación y seguimiento del avance.
- **19e** `cat-admin-propios-feriados-ui`: crea `libs/plataforma/feriados`, una página por año compartida por las dos apps (GLOBAL en la consola; TENANT y SUCURSAL en admin), y las páginas de propios y ajustes en `admin-cliente`. Se especifica con su propio `/spec`.

Lo que hay en el código hoy (revisado al redactar):

- Back completo en `libs/plataforma/catalogos`:
  - 19a: 11 rutas de catálogos e ítems;
  - 19b: 7 rutas de importación, una de ellas SSE;
  - 19c: `GET /v1/catalogos/{codigo}/items/administracion` y las rutas de feriados.
- `CatalogoDto` no dice si el catálogo es importable: `TABLAS_IMPORTABLES` vive en `domain/importacion/tipos.ts`.
- No hay `GET` de un ítem global por id.
- `plataforma-consola` monta `consola/soporte` y `consola` (tenants) con `aal2Guard` y filtra el menú por `/consola`.
- `plataforma-consola` usa `provideHttpClient(withInterceptors([authInterceptor, erroresHttpInterceptor]))`, sin `withFetch`.
- `authInterceptor` pone el Bearer con `SesionService.token()` y `X-Sucursal-Id` con `SesionService.sucursalId()`.
- `AvisosService.toast(tipo, texto)` existe (spec 15) y espera a que se cierre el modal abierto.
- `InsigniasMenuService` (spec 18) es el patrón de servicio en raíz que una lib diferida alimenta y el shell pinta.
- `iniciarInsigniasSoporte` (`apps/plataforma-admin`) es el patrón de `provideAppInitializer` con `import()` dinámico de la lib.
- Manifiesto PLAT en `1.11.0`. El módulo `consola` tiene «Tenants» (orden 1) y «Soporte» (orden 2).

Contrato de UI que deja el 19b y este spec cumple:

- Un servicio a nivel de app abre el stream de cada importación activa del usuario, y el usuario sigue navegando mientras tanto.
- Al iniciar sesión o recargar, recupera las activas con `GET /v1/catalogos/importaciones?activas=true`.
- Muestra el porcentaje en un indicador del shell.
- Al recibir `fin`, avisa con un toast: el resumen si quedó `APLICADA`, el motivo si quedó `FALLIDA` u `OBSOLETA`.
- Abre el stream con `fetch` y el Bearer. Si se corta, hace un solo `GET` del estado y reconecta. Sin polling periódico.

RF cubiertos (UI): **TR-RF-022** (catálogos globales), **TR-RF-023** (ítems con vigencia) y **TR-RF-028** (importación).

Criterios del SRS en lo que toca a la UI: **TR-CA-058, 059, 060, 061, 062, 072 y 073**. Los de seguimiento, toast y reconexión son propios de este spec.

Reglas: **TR-RN-012** (globales solo del operador), **TR-RN-013** (un ítem referenciado no se borra: se cierra su vigencia), **TR-RN-009** (consola entera con aal2).

RNF propios:

- **TR-RNF-021**: confirmación antes de borrar, cerrar vigencia o aplicar una importación con bajas.
- **TR-RNF-008**: botón de envío deshabilitado mientras viaja la petición.
- **TR-RNF-018**: usable a 360, 600, 768 y 1280 px; textos en español de Perú.
- **TR-RNF-019**: axe-core sin `critical` ni `serious` en las pantallas nuevas.
- **TR-RNF-122**: sin colores fijos, solo tokens.

RNF heredados: 010, 011, 012, 024/119, 026, 101.

Estimado: 9 h. El plan da 3 h a D-06; la importación por pasos, el seguimiento global y el hueco del shell suman. Si se pasa, se recorta primero el editor JSON avanzado de atributos (las claves libres quedan en solo lectura).

## Diseño UI

| Pantalla | Pantalla tipo del canvas | Cambia en |
| --- | --- | --- |
| Lista de catálogos | Lista | Filtros en el cliente (la API no pagina) y chip de alcance |
| Formulario de catálogo | Formulario | `alcance` solo al crear |
| Detalle de catálogo (`CAT-Detalle*` en el canvas) | Detalle | Pestañas «Ítems» e «Importaciones»; esta última solo si `importable`. En las importables, ítems en solo lectura |
| Formulario de ítem | Formulario | Bloque de vigencia y bloque de atributos con editor JSON plegable |
| Confirmaciones (borrar, cerrar vigencia, aplicar) | Confirmación | — |
| Importación por pasos | **Nueva** | Ver abajo |
| Indicador de tareas en curso (barra del shell) | **Nueva** | Ver abajo |

Las dos pantallas nuevas están en el canvas «Vitrina · Diseño UI» (https://claude.ai/artifact/UGvcmiWUiBsMuWerqMiWxh), en la página «19d · Catálogos». Se dibujaron antes de aprobar el spec, como decidió el usuario, porque ninguna pantalla tipo las cubría:

- «Importación por pasos» (`CAT-Importacion*`): previsualización, archivo con errores y confirmación con bajas. Está en claro y oscuro y a 600 px.
- «Tareas en curso» (`CAT-Tareas*`): panel abierto sobre otra pantalla (Tenants) y aviso al terminar. Está en claro y oscuro y a 600 px.

Si el canvas y este spec no coinciden, se corrige uno de los dos antes de implementar.

Cada pantalla se verifica en tema claro y oscuro y a 600 px de ancho.

## Alcance

**In:**

- **`libs/plataforma/consola-catalogos`** (nueva, `scope:plataforma`, `type:feature`):
  - clientes HTTP;
  - modelos;
  - páginas de lista, formulario y detalle de catálogo, y formulario de ítem;
  - importación por pasos;
  - `SeguimientoImportacionesService`;
  - `CONSOLA_CATALOGOS_ROUTES`.
- **`libs/plataforma/catalogos-ui`** (nueva, `scope:plataforma`, `type:ui`). Contiene lo que comparte con admin (spec 19e):
  - `vit-formulario-item` (con el editor de atributos);
  - modelos de ítem y atributos;
  - `formulario-item.ts`;
  - `TONOS_ESTADO_ITEM`;
  - `hoyEnLima`.
- **`libs/shared/shell`**:
  - `TareasEnCursoService` (signal en raíz);
  - componente `vit-tareas-en-curso` en la barra del layout.
- **`apps/plataforma-consola`**:
  - ruta `consola/catalogos`;
  - `iniciarSeguimientoImportaciones()` con `provideAppInitializer`.
- **Back, cambio chico en `libs/plataforma/catalogos`**:
  - `importable: boolean` en `CatalogoDto`;
  - ruta nueva `GET /v1/catalogos/{codigo}/items-globales/{id}`.
- **Manifiesto PLAT `1.12.0`**: opción de menú `plat.consola.catalogos`.
- **`docs/roadmap-specs.md`**: fila 19d con el contenido de este spec y fila nueva 19e.
- **Pruebas**:
  - Vitest con `TestBed` zoneless y `HttpTestingController`;
  - supertest de la ruta nueva;
  - verificación en navegador con el MCP `playwright` contra Supabase dev.

**Out of scope (para otros specs):**

- **Feriados**: la UI completa, GLOBAL en la consola y TENANT y SUCURSAL en admin, con la lib `libs/plataforma/feriados` y la opción de menú «Feriados». Va en el spec 19e.
- **Propios y ajustes del tenant** (RF-025, RF-026) en `admin-cliente`: spec 19e. Esto incluye los propios del tenant operador, porque la consola muestra solo los globales.
- **Cancelar una importación en curso**: el back no lo soporta (19b).
- **Seguir importaciones lanzadas por otro operador**: el SSE y las activas son solo de quien la lanzó (19b). El historial sí las muestra.
- **Notificaciones push o por correo al terminar.**
- **`<ui-catalogo-select>`**: no tiene RF ni historia.
- **Mover los DTO a `libs/shared/contracts`.**
- **E2E multinavegador y axe en CI**: spec 27.
- **Proyecto prod.**

## Base de código reutilizada

**Se conserva sin cambios:**

- Spec 13: `SesionService` (`token()`, `sucursalId()`, `estado`), `aal2Guard`, `permisoGuard`, `*siPermiso`, `authInterceptor` con step-up y `OMITIR_AVISO_ERROR`.
- Spec 15 y 15b: `vit-tabla` (`ColumnaTabla.movil`), `vit-chip-estado` con `TonoEstado`, `vit-filtros` (`valorInicial`), `vit-acciones-formulario`, `vit-cargando`, `vit-estado-vacio` y `AvisosService` (`toast`, `confirmar`, `confirmarDestructiva`), además de la clase `vit-destructivo` y `erroresHttpInterceptor`.
- Spec 17b: `AccionSensibleService.exigirMfa()` antes de cada acción sensible y `filtrarMenuPorPrefijo`.
- Spec 17b: patrón de `consola-tenants`:
  - `utils/filtro-url.ts` (filtros y página en la URL);
  - `utils/solicitar.ts`;
  - `testing/` (doble de sesión y arnés HTTP);
  - `AdaptadorFechaPeru` y `CalendarioEnEspanol`, que se copian.
- Spec 18: patrón de `InsigniasMenuService` e `iniciarInsigniasSoporte`.
- Specs 19a, 19b y 19c: contratos HTTP tal cual, salvo los dos cambios de abajo.

**Cambia:**

- `libs/plataforma/catalogos/src/interface/catalogos.dto.ts`: `CatalogoDto.importable`, calculado en el mapeo con `TABLAS_IMPORTABLES.includes(codigo)`.
- `libs/plataforma/catalogos/src/interface/catalogos.controller.ts`: `@Get(':codigo/items-globales/:id')` con `plat.catalogo.item_gestionar`. Usa un caso de uso nuevo, `ObtenerItemGlobal`, sobre el repositorio de ítems del 19a.
- `libs/shared/shell/src/lib/components/layout/layout.component.html`: `<vit-tareas-en-curso />` antes de `<vit-selector-sucursal />`.
- `libs/shared/shell/src/index.ts`: exporta `TareasEnCursoService` y el tipo `TareaEnCurso`.
- `apps/plataforma-consola/src/app/app.routes.ts`: `consola/catalogos` va antes de `consola`, como `consola/soporte`.
- `apps/plataforma-consola/src/app/app.config.ts`: agrega `iniciarSeguimientoImportaciones()`.
- `libs/plataforma/seguridad/manifiesto/plat.manifiesto.json`: `1.11.0` → `1.12.0`.

## Modelo de datos

No hay tablas nuevas. El back suma un campo y una ruta. Los tipos del front repiten los DTO en `models/`, en camelCase, y los clientes mapean desde snake_case.

### Back

```ts
// CatalogoDto (19a) + campo nuevo
importable: boolean;   // true si codigo está en TABLAS_IMPORTABLES

// GET /v1/catalogos/{codigo}/items-globales/{id}  →  200 ItemDto (el del 19a, con version y atributos)
// Errores: 404 CATALOGO_NO_EXISTE; 404 ITEM_NO_ENCONTRADO si el id no es UUID, no existe, es propio de un tenant
//          o es de otro catálogo; 403 OPERADOR_REQUERIDO fuera del operador.
```

- `ObtenerItemGlobal` llama a `VerificadorOperador.exigir`, igual que las escrituras de globales.
- **Tablas importables en solo lectura manual.** `CrearItemGlobal`, `ActualizarItemGlobal` y `EliminarItemGlobal` rechazan un catálogo de `TABLAS_IMPORTABLES` con el error nuevo `TablaSoloImportacionError`: 409 `TABLA_SOLO_IMPORTACION`, «Esta tabla se actualiza solo por importación».
  - La regla vive en el dominio (`Catalogo.admiteEdicionManualDeGlobales()`), no solo en la UI.
  - La aplicación de importaciones del 19b no pasa por esos casos de uso: usa sus funciones `SECURITY DEFINER`, así que no se afecta.
  - Editar la definición del catálogo (nombre, fuente) sigue permitido.
- La ruta estática `items-globales/:id` no choca con `items/administracion`: tienen prefijos distintos.

### Front, `libs/plataforma/consola-catalogos`

```
src/
  index.ts                                   export { CONSOLA_CATALOGOS_ROUTES, SeguimientoImportacionesService }
  lib/consola-catalogos.routes.ts
  lib/models/catalogo.ts                     AlcanceCatalogo, Catalogo, SolicitudCatalogo, mapeos
  lib/models/fila-item.ts                    FilaItem, FiltroItems (origen=GLOBAL fijo), mapeo de items/administracion
  lib/models/importacion.ts                  EstadoImportacion, Previsualizacion, ErrorFila, ImportacionListada,
                                             ImportacionActiva, DetalleImportacion, AvisoImportacion, mapeos
  lib/models/tonos.ts                        TONOS_ALCANCE, TONOS_ESTADO_IMPORTACION
  lib/models/permisos-catalogos.ts           PERMISOS_CATALOGOS
  lib/models/mensajes-catalogos.ts           MENSAJES_CATALOGOS
  lib/models/error-catalogos.ts              mapa código de la API → mensaje y campo
  lib/services/catalogos.cliente.ts          listar, crear, actualizar
  lib/services/items.cliente.ts              listarAdministracion, obtener, crear, actualizar, eliminar
  lib/services/importaciones.cliente.ts      previsualizar, aplicar, historial, activas, detalle, descargarErrores
  lib/services/eventos-importacion.cliente.ts   stream SSE con fetch
  lib/services/seguimiento-importaciones.service.ts
  lib/services/adaptador-fecha-peru.service.ts, calendario-en-espanol.service.ts   (copiados de consola-tenants)
  lib/components/items-catalogo/            pestaña «Ítems»
  lib/components/historial-importaciones/   pestaña «Importaciones»
  lib/components/resumen-previsualizacion/  contadores y muestra por tipo
  lib/components/errores-importacion/       tabla de los primeros 100 y descarga del CSV
  lib/pages/catalogos-lista/
  lib/pages/catalogo-formulario/
  lib/pages/catalogo-detalle/
  lib/pages/item-formulario/
  lib/pages/importacion/
  lib/utils/filtro-url.ts, solicitar.ts       (patrón de consola-tenants)
  lib/utils/lector-eventos.ts                 parseo puro de text/event-stream por fragmentos
  lib/utils/formulario-catalogo.ts
  testing/                                    doble de sesión, arnés HTTP y stream SSE falso
```

### Front, `libs/plataforma/catalogos-ui` (`type:ui`, compartida con admin en el 19e)

```
src/
  index.ts                                    export { FormularioItemComponent, ItemCatalogo, AtributosItem, SolicitudItem,
                                                       EstadoItem, TONOS_ESTADO_ITEM, hoyEnLima, ... } (rutas explícitas)
  lib/models/item.ts                          ItemCatalogo, EstadoItem, SolicitudItem, mapeos snake_case ↔ camelCase
  lib/models/atributos.ts                     AtributosItem, CLAVES_CONOCIDAS, LIMITE_ATRIBUTOS_BYTES
  lib/models/tonos-estado-item.ts             TONOS_ESTADO_ITEM
  lib/components/formulario-item/            <vit-formulario-item [catalogo] [item] [enviando] (guardar) (cancelar)>
  lib/components/editor-atributos/           campos conocidos + JSON avanzado
  lib/utils/formulario-item.ts                FormGroup, validadores y mapeo a SolicitudItem
  lib/utils/fecha-lima.ts                     hoyEnLima(): YYYY-MM-DD en America/Lima
```

- `vit-formulario-item` no hace HTTP. Emite `guardar(SolicitudItem)`, y la página que lo usa decide la ruta: globales en la consola, propios en admin.
- Recibe los errores de campo con `marcarError(campo, mensaje)`. `CODIGO_DUPLICADO` lo usa para el campo `codigo`.
- `type:ui` solo importa de `type:ui` y `type:util`, así que no conoce `shared/auth` ni los clientes.

Cada página o componente usa `.ts` + `.html`, y `.css` solo si tiene estilos propios.

```ts
// models/catalogo.ts
export type AlcanceCatalogo = 'GLOBAL' | 'MIXTO' | 'TENANT';
export interface Catalogo {
  id: string; codigo: string; nombre: string; alcance: AlcanceCatalogo; fuente: string | null;
  editablePorTenant: boolean; version: number; importable: boolean;
}

// consola-catalogos/models/fila-item.ts
export interface FiltroItems { texto?: string; estado?: EstadoItem; pagina: number; tamano: number }  // origen=GLOBAL fijo

// catalogos-ui/models/item.ts
export type EstadoItem = 'VISIBLE' | 'INACTIVO' | 'FUERA_DE_VIGENCIA' | 'OCULTO';
export interface ItemCatalogo {
  id: string; codigo: string; codigoExterno: string | null; nombre: string; abreviatura: string | null;
  orden: number | null; atributos: AtributosItem; vigenteDesde: string; vigenteHasta: string | null;
  activo: boolean; version: number;
}

// catalogos-ui/models/atributos.ts
export const CLAVES_CONOCIDAS = ['longitud', 'regex', 'valida_reniec', 'mascara'] as const;
export const LIMITE_ATRIBUTOS_BYTES = 4096;

// models/importacion.ts
export type EstadoImportacion =
  'PREVISUALIZADA' | 'RECHAZADA' | 'EN_COLA' | 'EN_PROCESO' | 'APLICADA' | 'FALLIDA' | 'OBSOLETA' | 'VENCIDA';
export type AvisoImportacion =
  | { tipo: 'avance'; estado: 'EN_COLA' | 'EN_PROCESO'; avance: number }
  | { tipo: 'fin'; estado: 'APLICADA' | 'FALLIDA' | 'OBSOLETA';
      resumen: { altas: number; cambios: number; bajas: number; sinCambios: number } | null; motivo: string | null };
```

- `PERMISOS_CATALOGOS`:
  - `leer = 'plat.catalogo.leer'`;
  - `gestionar = 'plat.catalogo.gestionar'`;
  - `itemGestionar = 'plat.catalogo.item_gestionar'`;
  - `importar = 'plat.catalogo.importar'`.
- Los tres últimos son sensibles: antes de cada escritura se llama a `AccionSensibleService.exigirMfa()`.
- `TONOS_ESTADO_ITEM`:
  - `VISIBLE` → `exito`;
  - `INACTIVO` → `neutro`;
  - `FUERA_DE_VIGENCIA` → `advertencia`;
  - `OCULTO` → `info`.
- `TONOS_ESTADO_IMPORTACION`:
  - `APLICADA` → `exito`;
  - `EN_COLA` y `EN_PROCESO` → `info`;
  - `PREVISUALIZADA` → `neutro`;
  - `VENCIDA` y `OBSOLETA` → `advertencia`;
  - `RECHAZADA` y `FALLIDA` → `error`.

### Shell, `libs/shared/shell`

```ts
// models/tarea-en-curso.ts
export interface TareaEnCurso {
  id: string;             // único entre tareas; la consola usa el id de la importación
  titulo: string;         // «Importando UBIGEO»
  avance: number | null;  // 0-100; null = indeterminado (EN_COLA sin avance)
  detalle: string;        // «En cola», «Aplicando 42 %»
  ruta: string | null;    // enlace del panel: /consola/catalogos/UBIGEO?pestana=importaciones
}

// services/tareas-en-curso.service.ts  (@Injectable({ providedIn: 'root' }))
readonly tareas: Signal<readonly TareaEnCurso[]>;
registrar(tarea: TareaEnCurso): void;            // reemplaza si el id ya existe
actualizar(id: string, cambios: Partial<Omit<TareaEnCurso, 'id'>>): void;   // ignora ids desconocidos
quitar(id: string): void;
vaciar(): void;
```

- `vit-tareas-en-curso` no se pinta si no hay tareas.
- Con tareas, muestra un botón con `mat-progress-spinner` y una insignia con la cantidad:
  - el spinner es determinado con el promedio de los avances conocidos;
  - es indeterminado si ninguna tiene avance;
  - en escritorio, junto al spinner va el texto «N %» (o «En cola»); a 600 px solo el spinner y la insignia.
- El botón abre un `mat-menu` con una fila por tarea:
  - título y detalle;
  - `mat-progress-bar` determinada o indeterminada;
  - enlace a `ruta` si la hay.
- El texto accesible es «Tareas en curso: N» y se anuncia con `aria-live="polite"` cuando cambia la cantidad.
- El shell no sabe qué es una importación. Solo pinta lo que otra lib registra.

### `SeguimientoImportacionesService` (raíz)

- **Arranque.** `iniciarSeguimientoImportaciones()` en `apps/plataforma-consola` lo instancia con `import()` dinámico, como `iniciarInsigniasSoporte`.
- **Sesión.** Observa el estado de `SesionService`:
  - Al quedar con sesión aal2 y el permiso `plat.catalogo.importar`, hace un `GET /v1/catalogos/importaciones?activas=true` y llama a `seguir(id, codigo)` por cada activa.
  - Sin sesión, aborta todos los streams y llama a `TareasEnCursoService.vaciar()`.
- **`seguir(id, codigo)`.**
  - Lo llama también la página de importación después del 202 de `aplicar`.
  - Es idempotente: si ya sigue ese id, no abre otro stream.
  - Registra la tarea y abre `EventosImportacionCliente.abrir(id, señal)`.
- **Por cada `avance`.** Actualiza la tarea:
  - `EN_COLA`: avance `null` y detalle «En cola»;
  - `EN_PROCESO`: avance N y detalle «Aplicando N %».
- **Por el `fin`.** Quita la tarea y muestra `AvisosService.toast`:

  | Estado | Tipo | Texto |
  | --- | --- | --- |
  | `APLICADA` | `exito` | «UBIGEO importado: 18 altas, 0 cambios, 0 bajas» |
  | `FALLIDA` | `error` | «La importación de UBIGEO falló: {motivo}» |
  | `OBSOLETA` | `advertencia` | «La importación de UBIGEO quedó obsoleta: el catálogo cambió. Vuelva a previsualizar» |

  Los conteos van en singular o plural según el número («1 baja», «3 cambios»). Además emite el id por `terminadas` (un `Observable<string>`). El detalle del catálogo abierto lo usa para recargar el historial y los ítems.
- **Corte del stream sin `fin`** (red, cierre a los 15 min del back o 401):
  1. Hace un solo `GET /v1/catalogos/importaciones/{id}`. Ese `GET` pasa por el interceptor, que renueva el token si hace falta.
  2. Con estado final, se trata como un `fin` con el resumen o el motivo del detalle.
  3. Con `EN_COLA` o `EN_PROCESO`, reconecta una vez. Si ese `GET` falla, espera `ESPERA_RECONEXION_MS = 5000` y reintenta, hasta `REINTENTOS_MAXIMOS = 3`.
  4. Agotados los reintentos, quita la tarea y avisa con un toast de advertencia: «Se perdió el seguimiento de UBIGEO. Revise el historial del catálogo».
- No hay polling periódico. El único temporizador es la espera entre reintentos.

### `EventosImportacionCliente` (SSE con fetch)

- Pide `GET {API_URL}/v1/catalogos/importaciones/{id}/eventos` con `fetch`:
  - cabeceras `Authorization: Bearer {SesionService.token()}`, `Accept: text/event-stream` y `X-Sucursal-Id` si hay sucursal;
  - `signal` de un `AbortController`.
- Lee `response.body` con `TextDecoderStream` y entrega los fragmentos a `lectorEventos`.
- `lectorEventos` es una función pura de `utils/lector-eventos.ts`:
  - acumula hasta una línea en blanco;
  - toma `event:` y `data:`, y descarta los comentarios `: ping`;
  - devuelve los `AvisoImportacion` parseados.
- Devuelve un `Observable<AvisoImportacion>`:
  - completa al recibir `fin`;
  - falla con `CorteDeStream` (red, cuerpo cerrado sin `fin`) o con `StreamRechazado(status)` (401, 404, 5xx).
- 404 del stream es otro usuario o un id inexistente. El servicio no reintenta y quita la tarea sin toast.

### Rutas

`apps/plataforma-consola/src/app/app.routes.ts`, dentro de `rutasDelShell`, antes de `consola`:

```ts
{ path: 'consola/catalogos', canActivate: [aal2Guard],
  loadChildren: () => import('@vitrina/plataforma/consola-catalogos').then((modulo) => modulo.CONSOLA_CATALOGOS_ROUTES) },
```

`CONSOLA_CATALOGOS_ROUTES`:

| Ruta | Página | Guard |
| --- | --- | --- |
| `/consola/catalogos` | `CatalogosListaPage` | `permisoGuard(plat.catalogo.leer)` |
| `/consola/catalogos/nuevo` | `CatalogoFormularioPage` | `permisoGuard(plat.catalogo.gestionar)` |
| `/consola/catalogos/:codigo` | `CatalogoDetallePage` | `permisoGuard(plat.catalogo.leer)` |
| `/consola/catalogos/:codigo/editar` | `CatalogoFormularioPage` | `permisoGuard(plat.catalogo.gestionar)` |
| `/consola/catalogos/:codigo/items/nuevo` | `ItemFormularioPage` | `permisoGuard(plat.catalogo.item_gestionar)` |
| `/consola/catalogos/:codigo/items/:id/editar` | `ItemFormularioPage` | `permisoGuard(plat.catalogo.item_gestionar)` |
| `/consola/catalogos/:codigo/importar` | `ImportacionPage` | `permisoGuard(plat.catalogo.importar)` |

- `nuevo` va antes de `:codigo`.
- `:codigo` que no existe muestra `vit-estado-vacio` «El catálogo no existe», con enlace a la lista.

### Pantallas

**Lista (`/consola/catalogos`):**

- `GET /v1/catalogos` una vez. El filtrado y el paginador (`TAMANOS_PAGINA` con `filasDePagina`) son en el cliente: la API no pagina y son decenas de filas.
- `vit-filtros`:
  - búsqueda `q` por código o nombre;
  - `alcance` (`GLOBAL`, `MIXTO`, `TENANT`);
  - van en la URL y se precargan con `valorInicial`.
- `vit-tabla`:
  - columnas código, nombre, alcance (`vit-chip-estado` con `TONOS_ALCANCE`), fuente, versión y «Importable» (ícono `upload_file` con texto accesible);
  - en celular, código y nombre como título y alcance como chip;
  - enlace › al detalle con `vitAccionesFila`.
- Botón «Nuevo catálogo» con `*siPermiso="plat.catalogo.gestionar"`.
- `vit-cargando` y `vit-estado-vacio`.

**Formulario de catálogo (`nuevo` y `:codigo/editar`):**

- Campos:
  - `codigo` con `^[A-Z][A-Z0-9_]{2,59}$` y mensaje «El código debe tener de 3 a 60 mayúsculas, dígitos o guion bajo»; solo al crear;
  - `nombre` de 3 a 150;
  - `alcance` (radio); solo al crear; al editar se muestra en solo lectura;
  - `fuente`, opcional, hasta 150;
  - `editable_por_tenant`.
- Coherencia en el cliente, con los mensajes del 19a:
  - `GLOBAL` fuerza `editable_por_tenant = false` y deshabilita el control;
  - `MIXTO` y `TENANT` lo fuerzan a `true`.
- Al guardar: `exigirMfa()` y luego `POST` o `PUT` con `version`.
  - Éxito: navega al detalle y avisa «Catálogo creado» o «Catálogo actualizado».
  - `cambiado: false`: avisa «No había cambios».
- Errores:
  - `CATALOGO_DUPLICADO`: en `codigo`;
  - `CATALOGO_INVALIDO`: el mensaje en el campo que corresponda, o como alerta (TR-CA-059);
  - `VERSION_OBSOLETA`: alerta con «Recargar».
- `vit-acciones-formulario`, con el botón deshabilitado mientras viaja la petición.

**Detalle (`/consola/catalogos/:codigo`):**

- Cabecera:
  - código, nombre, alcance (chip), fuente, versión y si es editable por el tenant;
  - botón «Editar» con `*siPermiso="plat.catalogo.gestionar"`;
  - si `importable`, botón «Importar» con `*siPermiso="plat.catalogo.importar"`.
- `mat-tab-group`. La pestaña activa va en `?pestana=items|importaciones`, y «Importaciones» solo aparece si `importable`.
- **Pestaña «Ítems»** (`items-catalogo`):
  - consume `GET .../items/administracion` con `origen=GLOBAL` fijo, `texto`, `estado`, `pagina` y `tamano`, todo en la URL;
  - paginador estándar con `TAMANOS_PAGINA` (20, 50 y 100; 20 por defecto);
  - columnas código, código externo, nombre, orden, vigencia (`dd/MM/yyyy` – `dd/MM/yyyy` o «sin fin»), estado (chip) y activo;
  - acciones de fila (32 px):
    - «Editar», que navega al formulario;
    - «Borrar», con `vit-destructivo`;
  - las dos con `*siPermiso="plat.catalogo.item_gestionar"`, y solo en catálogos `GLOBAL` o `MIXTO` que no son `importable`;
  - botón «Nuevo ítem» con el mismo permiso y la misma condición;
  - en un catálogo `TENANT` no hay acciones y se muestra «Este catálogo solo tiene ítems de cada tenant»;
  - en un catálogo `importable` no hay acciones ni «Nuevo ítem». Se muestra la nota «Esta tabla se actualiza solo por importación, para que coincida con la fuente oficial», con un enlace a «Importar» si se tiene `plat.catalogo.importar`.
- **Borrar un ítem:**
  1. `exigirMfa()` y `confirmarDestructiva` «¿Borrar el ítem {código}?», sin motivo.
  2. `DELETE` con `version`. Éxito: toast «Ítem borrado» y recarga de la página actual de la tabla.
  3. Con 409 `ITEM_REFERENCIADO` (TR-CA-061), segunda confirmación destructiva: «El ítem está en uso y no se puede borrar. ¿Cerrar su vigencia hoy?».
  4. Al aceptar: `GET` del ítem por id, y `PUT` con todos sus campos y `vigente_hasta = hoyEnLima()`.
  5. Si `vigente_desde` es posterior a hoy, la vigencia no se puede cerrar hoy. Se avisa «El ítem aún no entra en vigencia; edítelo para cambiarla» y no se envía nada.
  6. Éxito: toast «Vigencia cerrada» y recarga.
- **Pestaña «Importaciones»** (`historial-importaciones`):
  - consume `GET .../importaciones` paginado (20);
  - columnas fecha (`dd/MM/yyyy HH:mm`), versión oficial, fecha de vigencia, estado (chip), altas, cambios, bajas, errores y motivo;
  - en las `RECHAZADA`, acción «Descargar errores» con `descargarErrores`;
  - se recarga cuando `SeguimientoImportacionesService.terminadas` emite una importación de este catálogo.

**Formulario de ítem (`items/nuevo` y `items/:id/editar`):**

- La página usa `vit-formulario-item` de `catalogos-ui`, que trae los campos, la vigencia y los atributos de abajo. La página solo hace el HTTP y traduce los errores.
- Editar carga con `GET .../items-globales/{id}`. Un 404 muestra «El ítem no existe».
- Campos, con límites y mensajes del 19a:
  - `codigo` de 1 a 40, solo al crear;
  - `codigo_externo` hasta 40;
  - `nombre` de 1 a 200;
  - `abreviatura` hasta 30;
  - `orden` entero opcional;
  - `activo`.
- **Vigencia**:
  - `vigente_desde` es obligatorio y por defecto hoy en Lima;
  - `vigente_hasta` es opcional y no puede ser menor que `vigente_desde` («La vigencia final no puede ser anterior a la inicial»);
  - datepicker con `AdaptadorFechaPeru`.
  - Si `vigente_desde` es futura, se muestra la nota «No aparecerá en las consultas hasta el dd/MM/yyyy» (TR-CA-062).
- **Atributos** (`editor-atributos`):
  - Campos tipados para las claves conocidas:
    - `longitud`, entero de 1 a 100;
    - `regex`, hasta 200 y debe compilar con `new RegExp`, si no «La expresión regular no es válida»;
    - `valida_reniec`, casilla;
    - `mascara`, hasta 50.
  - Un panel plegable «JSON avanzado» con un `textarea` para las demás claves:
    - debe ser un objeto JSON;
    - no puede repetir una clave conocida («Use el campo de arriba para {clave}»).
  - Al guardar se combinan los dos.
  - Si el JSON combinado pasa de `LIMITE_ATRIBUTOS_BYTES`, se muestra «Los atributos superan 4 KB». Se mide con `TextEncoder`.
  - Al editar, las claves desconocidas que trae el ítem se precargan en el JSON avanzado, así que no se pierden.
- Al guardar: `exigirMfa()`, y luego `POST .../items-globales` o `PUT .../items-globales/{id}` con `version`.
  - Éxito: vuelve al detalle en la pestaña «Ítems» y avisa.
  - `CODIGO_DUPLICADO`: va al campo `codigo` («El código ya existe en el catálogo»).
  - `ITEM_INVALIDO`: el mensaje del back como alerta.
  - `ALCANCE_NO_PERMITE` y `VERSION_OBSOLETA`: alerta.

**Importación (`/consola/catalogos/:codigo/importar`):**

- Si el catálogo no es `importable`, muestra «Este catálogo no se importa» y un enlace al detalle.
- Al iniciar se llama a `exigirMfa()`.
- `MatStepper` lineal de 2 pasos. El estado vive solo en la página: al recargar se vuelve al paso 1. La previsualización anterior queda en la base hasta que vence o hasta que otra la reemplaza.
- **Paso 1, «Archivo»:**
  - `archivo` (`.csv` o `.xlsx`, hasta 20 MB, validado en el cliente con «El archivo supera 20 MB» o «Solo se aceptan archivos CSV o XLSX»);
  - `version_oficial` de 1 a 40;
  - `fecha_vigencia` con datepicker.
  - «Previsualizar» envía el `multipart`, con el botón deshabilitado y `vit-cargando` mientras viaja.
- **Respuesta 422 (filas inválidas, TR-CA-073):**
  - El paso 1 muestra `errores-importacion` con el total («Se encontraron N errores; se muestran los primeros 100»).
  - Tabla con fila, columna, valor y mensaje, y botón «Descargar todos los errores (CSV)».
  - No se avanza de paso.
- **Errores 400 y 413** (archivo o cabecera): su `mensaje` va como alerta sobre el paso 1.
- **Paso 2, «Previsualización»** (`resumen-previsualizacion`, TR-CA-072):
  - contadores de altas, cambios, bajas, sin cambios y total de filas;
  - pestañas con la muestra de cada tipo, hasta 20 por tipo; los cambios con columnas «antes» y «después» de los campos que difieren;
  - el vencimiento: «Puede aplicarla hasta el dd/MM/yyyy HH:mm».
- **«Aplicar»:**
  1. Llama a `exigirMfa()`.
  2. Con bajas > 0: `confirmarDestructiva` «¿Aplicar la importación?» con el texto «Se cerrará la vigencia de N ítems», sin motivo. El botón dice «Aplicar y cerrar N vigencias».
  3. Sin bajas: `confirmar` con el resumen.
  4. Al aceptar, `POST .../aplicar` con `version`.
  5. Con el 202, llama a `seguimiento.seguir(id, codigo)`, navega al detalle en `?pestana=importaciones` y avisa con el toast informativo «Importación en cola. Puede seguir trabajando».
- **Errores al aplicar:**
  - `IMPORTACION_NO_APLICABLE` (vencida): alerta «La previsualización venció; vuelva a cargar el archivo» y vuelve al paso 1;
  - `IMPORTACION_EN_CURSO`: alerta con el mensaje del back;
  - `COLA_NO_DISPONIBLE` (503): alerta «No se pudo encolar; intente de nuevo», y se queda en el paso 2.
- Botón «Cancelar»: vuelve al detalle sin llamar a la API.

### Descarga del CSV de errores

- `ImportacionesCliente.descargarErrores(id)` pide con `HttpClient` y `responseType: 'blob'`, así el interceptor pone el Bearer.
- Toma el nombre de `Content-Disposition` (`errores-{codigo}-{fecha}.csv`).
- Dispara la descarga con un enlace temporal y `URL.createObjectURL`, y libera la URL al terminar.

### Menú (manifiesto PLAT `1.12.0`)

```json
{ "codigo": "plat.consola.catalogos", "modulo": "consola", "padre": "plat.consola", "nombre": "Catálogos",
  "ruta": "/consola/catalogos", "icono": "library_books", "orden": 3, "permisos": ["plat.catalogo.item_gestionar"] }
```

- El permiso de la opción es `item_gestionar` y no `leer`. Así no la ven los administradores de configuración de un tenant cliente, que tienen `leer`. Los roles que gestionan la consola tienen `item_gestionar` (`PLAT_PROPIETARIO`).
- Sin permisos ni roles nuevos.
- La opción «Feriados» llega con el 19e.

## Plan de implementación

1. **Back: `importable`, obtener un ítem global y tablas importables en solo lectura.**
   - `CatalogoDto.importable` en el mapeo.
   - Caso de uso `ObtenerItemGlobal` y ruta `GET :codigo/items-globales/:id` con OpenAPI.
   - `TablaSoloImportacionError` y la regla en los tres casos de uso de ítems globales.
   - Pruebas:
     - `GET /v1/catalogos` trae `importable: true` en UBIGEO y `false` en MEDIO_PAGO;
     - `POST`, `PUT` y `DELETE` de `items-globales` en UBIGEO dan 409 `TABLA_SOLO_IMPORTACION`;
     - en MEDIO_PAGO siguen funcionando;
     - una importación aplicada de UBIGEO sigue escribiendo sus ítems;
     - el `GET` por id devuelve el ítem con `version` y `atributos`;
     - un id propio, de otro catálogo o que no es UUID da 404;
     - fuera del operador da 403;
     - sin `item_gestionar` da 403.
   - Verificar: `pnpm nx test catalogos` y la ruta en `/v1/docs`.
2. **Shell: `TareasEnCursoService` y `vit-tareas-en-curso`.**
   - Servicio, modelo, componente en la barra del layout y exportaciones.
   - Pruebas:
     - sin tareas no se pinta;
     - `registrar` dos veces el mismo id deja una fila;
     - el spinner promedia los avances conocidos y es indeterminado si ninguno lo tiene;
     - `quitar` y `vaciar`;
     - el panel muestra título, detalle, barra y enlace.
   - Verificar: `pnpm nx run-many -t lint test build -p shared-shell plataforma-admin plataforma-consola`. Admin no cambia, porque nadie registra tareas.
3. **Lib `consola-catalogos`: base, modelos y clientes.**
   - Generador Nx con `type:feature` y `scope:plataforma`, el alias `@vitrina/plataforma/consola-catalogos`, `index.ts` y rutas vacías.
   - `models/`, `CatalogosCliente`, `ItemsCliente` e `ImportacionesCliente` con sus mapeos.
   - `lectorEventos` con sus pruebas:
     - un evento partido en dos fragmentos;
     - dos eventos en un fragmento;
     - `: ping`;
     - `\r\n`.
   - Ruta en `plataforma-consola` y opción en el manifiesto `1.12.0`.
   - Verificar: `pnpm nx run-many -t lint test build -p plataforma-consola-catalogos plataforma-consola` y `pnpm manifiesto:aplicar` dos veces con 0 cambios la segunda.
4. **Lista y formulario de catálogo.**
   - `CatalogosListaPage`, `CatalogoFormularioPage` y `formulario-catalogo.ts`.
   - Pruebas:
     - filtro `MIXTO` y `q=pago` en la URL;
     - `GLOBAL` deshabilita y fuerza `editable_por_tenant = false` (TR-CA-059);
     - crear MEDIO_PAGO MIXTO envía el cuerpo snake_case y navega al detalle (TR-CA-058);
     - `CATALOGO_DUPLICADO` va al campo `codigo`;
     - al editar no se envía `codigo` ni `alcance`;
     - sin `gestionar` no hay botón.
5. **Detalle y pestaña «Ítems».**
   - `CatalogoDetallePage` y `items-catalogo`, con borrar y cerrar vigencia.
   - Pruebas:
     - la petición lleva `origen=GLOBAL`;
     - los filtros y la página van en la URL;
     - en un catálogo `TENANT` no hay acciones;
     - en UBIGEO no hay «Editar», «Borrar» ni «Nuevo ítem», y se muestra la nota de solo importación;
     - la pestaña «Importaciones» solo aparece si `importable`;
     - borrar «Yape» con 409 `ITEM_REFERENCIADO` ofrece cerrar la vigencia y envía `PUT` con `vigente_hasta` igual a hoy en Lima (TR-CA-061);
     - con `vigente_desde` futura avisa y no envía.
6. **Formulario de ítem y editor de atributos.**
   - Lib `catalogos-ui` (generador Nx con `type:ui` y `scope:plataforma`), con modelos, `formulario-item.ts`, `editor-atributos` y `vit-formulario-item`.
   - `ItemFormularioPage` en `consola-catalogos`, sobre `vit-formulario-item`.
   - Pruebas:
     - DNI con `longitud` 8 y `regex` `^\d{8}$` envía `atributos: { longitud: 8, regex: '^\\d{8}$' }` (TR-CA-060);
     - un `regex` inválido no deja guardar;
     - una clave desconocida del ítem aparece en el JSON avanzado y se reenvía;
     - una clave conocida en el JSON avanzado se rechaza;
     - más de 4 KB no deja guardar;
     - `vigente_hasta` menor no deja guardar;
     - `vigente_desde` 2027-01-01 muestra la nota (TR-CA-062);
     - `CODIGO_DUPLICADO` va al campo;
     - doble clic envía una sola petición.
7. **Importación por pasos e historial.**
   - `ImportacionPage`, `resumen-previsualizacion`, `errores-importacion`, `historial-importaciones` y `descargarErrores`.
   - Pruebas:
     - 21 MB o un `.pdf` no envía;
     - el 422 muestra el total, 100 filas y la descarga, y no avanza (TR-CA-073);
     - el 201 muestra 18 altas y la muestra (TR-CA-072);
     - con bajas pide confirmación destructiva y sin bajas, normal;
     - el 202 llama a `seguir` y navega a `?pestana=importaciones`;
     - `IMPORTACION_NO_APLICABLE` vuelve al paso 1;
     - el historial muestra «Descargar errores» solo en `RECHAZADA`.
8. **Seguimiento global.**
   - `EventosImportacionCliente`, `SeguimientoImportacionesService` e `iniciarSeguimientoImportaciones()`.
   - Pruebas con un stream falso:
     - al quedar con sesión recupera dos activas y registra dos tareas;
     - `seguir` dos veces abre un solo stream;
     - un `avance` 42 `EN_PROCESO` actualiza la tarea;
     - un `fin` `APLICADA` quita la tarea y muestra el toast con el resumen;
     - `FALLIDA` y `OBSOLETA` muestran su texto;
     - un corte con detalle `APLICADA` se trata como `fin`;
     - un corte con `EN_PROCESO` reconecta una vez;
     - tres fallos seguidos avisan y quitan la tarea;
     - un 404 quita sin toast;
     - cerrar sesión aborta los streams y vacía las tareas;
     - sin `plat.catalogo.importar` no llama a `activas`;
     - ningún `setInterval`.
9. **Roadmap.**
   - `docs/roadmap-specs.md`: fila 19d con el contenido de este spec, 9 h y estado Draft.
   - Fila nueva 19e `cat-admin-propios-feriados-ui`: RF-025, RF-026 y la UI de RF-029, con la lib `feriados` en las dos apps; depende de 19c, 19d y 17c; estado Pendiente.
   - Nota de la partición en el párrafo de «19 se partió en…».
10. **Verificación en navegador** (MCP `playwright`, con `nx serve api`, `nx serve worker` y `nx serve plataforma-consola` contra Supabase dev).
    - Recorrer los criterios de UI en tema claro y oscuro y a 360, 600 y 1280 px, con la consola sin errores.
    - axe-core en lista, detalle, formulario de ítem, importación y panel de tareas.
    - Capturas de cada pantalla nueva.
    - Casos:
      - operador con MFA;
      - un usuario de un tenant cliente con `PLAT_ADMIN_CONFIGURACION` no ve «Catálogos» en el menú;
      - importar UBIGEO desde `docs/datos-oficiales/` y navegar a «Tenants» mientras avanza;
      - recargar a mitad: la tarea reaparece;
      - un archivo con errores descarga el CSV;
      - borrar los datos de prueba al final.

## Criterios de aceptación

**Acceso y menú:**

- [ ] El menú de la consola muestra «Consola > Catálogos» al operador. Un usuario con solo `plat.catalogo.leer` no la ve, y el menú de `plataforma-admin` no la muestra.
- [ ] Con sesión aal1, `/consola/catalogos` lleva a `/auth/mfa?returnUrl=/consola/catalogos`.
- [ ] Sin el permiso de la ruta (tabla de Rutas) se va a `/403`.
- [ ] La versión `1.12.0` del manifiesto figura en `seg.manifiesto_aplicado` de dev, y aplicarla dos veces da 0 cambios.

**Catálogos (TR-RF-022):**

- [ ] Crear MEDIO_PAGO con alcance MIXTO lo deja en versión 1 y abre su detalle (TR-CA-058).
- [ ] Con alcance GLOBAL, «Editable por el tenant» queda desmarcado y deshabilitado. Si la API responde `CATALOGO_INVALIDO`, se muestra «Un catálogo normativo global no puede ser editable por el tenant» (TR-CA-059).
- [ ] Los filtros de la lista sobreviven a recargar la URL.
- [ ] Un código inexistente en `/consola/catalogos/XYZ` muestra «El catálogo no existe».

**Ítems (TR-RF-023):**

- [ ] La pestaña «Ítems» pide `origen=GLOBAL` y no muestra ítems propios del tenant operador.
- [ ] Crear el ítem DNI con `longitud` 8 y `regex` `^\d{8}$` lo guarda con esos atributos (TR-CA-060).
- [ ] Borrar «Yape» referenciado ofrece cerrar la vigencia; al aceptar, el ítem queda con `vigente_hasta` igual a hoy en Lima y estado `FUERA_DE_VIGENCIA` desde mañana (TR-CA-061).
- [ ] Un ítem con `vigente_desde` 2027-01-01 muestra la nota «No aparecerá en las consultas hasta el 01/01/2027» (TR-CA-062).
- [ ] Editar un ítem con una clave de atributos desconocida conserva esa clave tras guardar.
- [ ] Recargar `items/:id/editar` carga el ítem desde `GET .../items-globales/{id}`.
- [ ] En un catálogo `TENANT` no hay botones de ítems.
- [ ] En las 7 tablas importables los ítems se ven en solo lectura, con la nota «Esta tabla se actualiza solo por importación…». Un `PUT` directo a `items-globales` de UBIGEO responde 409 `TABLA_SOLO_IMPORTACION`.
- [ ] En MEDIO_PAGO (no importable), el operador edita un ítem desde «Editar» y el cambio se ve en la tabla.

**Importación (TR-RF-028):**

- [ ] El botón «Importar» y la pestaña «Importaciones» solo aparecen en las 7 tablas con `importable: true`.
- [ ] Un CIE10 sin la columna `descripcion` muestra el error de cabecera de la API sobre el paso 1 y no avanza (TR-CA-073, error de cabecera).
- [ ] Un archivo con 3 000 filas inválidas muestra «Se encontraron 3000 errores; se muestran los primeros 100». «Descargar todos los errores (CSV)» baja `errores-{codigo}-{fecha}.csv`.
- [ ] La previsualización de UBIGEO 1 874 → 1 892 muestra 18 altas y su muestra (TR-CA-072).
- [ ] Con bajas, «Aplicar» pide una confirmación destructiva con el número de ítems; sin bajas, una confirmación normal.
- [ ] Una previsualización vencida al aplicar vuelve al paso 1 con «La previsualización venció; vuelva a cargar el archivo».
- [ ] Mientras viaja «Previsualizar» o «Aplicar», el botón está deshabilitado y un doble clic envía una sola petición (TR-RNF-008).

**Seguimiento global:**

- [ ] Después de «Aplicar», el operador navega a «Tenants» y la barra muestra el indicador con el porcentaje de UBIGEO, que sube sin recargar.
- [ ] Al terminar aparece el toast «UBIGEO importado: 18 altas, 0 cambios, 0 bajas», el indicador desaparece y el historial abierto muestra `APLICADA` sin recargar.
- [ ] Recargar el navegador a mitad de la aplicación vuelve a mostrar la tarea con su avance.
- [ ] Una `FALLIDA` o una `OBSOLETA` muestra su toast con el motivo.
- [ ] Cortar la red a mitad y restaurarla retoma el seguimiento con un solo `GET` del detalle, sin peticiones periódicas en la pestaña Network.
- [ ] Cerrar sesión borra el indicador y no deja streams abiertos.
- [ ] El stream lleva `Authorization: Bearer` y la URL no contiene el token.

**Calidad y estructura:**

- [ ] `consola-catalogos` tiene tags `type:feature` y `scope:plataforma`. Exporta solo `CONSOLA_CATALOGOS_ROUTES` y `SeguimientoImportacionesService` por ruta explícita, e importa solo de `shared/*` y `catalogos-ui`.
- [ ] `catalogos-ui` tiene `type:ui` y `scope:plataforma`, no hace HTTP y no importa `shared/auth`.
- [ ] `shared/shell` no importa nada de catálogos. `TareasEnCursoService` no conoce las importaciones.
- [ ] Las pantallas nuevas se usan a 360, 600, 768 y 1280 px sin scroll horizontal de página, en tema claro y oscuro. axe-core sin `critical` ni `serious`.
- [ ] Sin hex sueltos: solo tokens `--color-*`, el tema M3 y utilidades de Tailwind. Campos de 40 px y botones de fila de 32 px sin alturas sobrescritas.
- [ ] Las pantallas «Importación por pasos» y «Tareas en curso» están en el canvas «Vitrina · Diseño UI», y la implementación coincide con ellas.
- [ ] La ruta `GET items-globales/{id}` figura en `/v1/docs` con sus códigos de error.
- [ ] El código nuevo sigue la sección «Código limpio» de `CLAUDE.md` y pasó por `code-simplifier`.
- [ ] `pnpm nx run-many -t lint test build` termina con código 0 y `nx affected` está en verde en CI.
- [ ] La verificación en navegador con el MCP `playwright` está hecha, con capturas y consola sin errores. Si no se pudo, se dice así en el cierre.
- [ ] `docs/roadmap-specs.md` tiene la fila 19d actualizada y la fila 19e.
- [ ] Las horas reales de D-06 quedan registradas en el plan.

## Decisiones

- **Sí: partir la fila 19d en 19d (consola) y 19e (admin cliente).** Lo decidió el usuario. Junta llegaba a 14-16 h.
- **Sí: los feriados, GLOBAL incluidos, completos en el 19e.** Lo decidió el usuario. Así el 19d queda en 9 h, y la lib `feriados` y su página compartida nacen en un solo spec.
- **Sí: página de feriados compartida entre las dos apps, en `libs/plataforma/feriados`.** La decidió el usuario para el 19e. El nombre no queda atado a ninguna app.
- **No: feriados GLOBAL en el 19d y los del tenant en el 19e.** Partía la misma página en dos specs.
- **Sí: formulario de ítem, editor de atributos y modelos de ítem en `libs/plataforma/catalogos-ui` (`type:ui`).** Lo decidió el usuario al redactar el 19e: admin los reusa para los propios sin depender de una lib de consola.
- **Sí: lib nueva `consola-catalogos`.** Lo decidió el usuario. Sigue el patrón de `consola-tenants`; lo de admin va en `admin-cliente` (19e).
- **Sí: diseñar en el canvas la importación y el indicador antes de aprobar el spec.** Lo decidió el usuario. Ninguna pantalla tipo las cubre.
- **Sí: hueco genérico de tareas en curso en `shared/shell`.** Lo decidió el usuario. Otras tareas largas lo pueden usar, y se ve con el menú colapsado.
- **No: panel flotante propio de la lib.** Necesita un punto de montaje fuera del layout.
- **No: insignia del menú.** No se ve con el menú colapsado y no dice qué tabla se importa.
- **Sí: atributos con campos para las claves conocidas y un JSON avanzado para las demás.** Lo decidió el usuario. Las claves libres no se pierden al editar.
- **Sí: el 409 `ITEM_REFERENCIADO` ofrece cerrar la vigencia hoy, sin motivo.** Lo decidió el usuario. El back no guarda motivo; la confirmación cumple TR-RNF-021.
- **No: ofrecer también inactivar.** Dos caminos para lo mismo. Inactivar se hace desde el formulario.
- **Sí: rutas con detalle en pestañas y la pestaña en la URL.** Lo decidió el usuario.
- **Sí: la consola lista solo ítems globales (`origen=GLOBAL`).** Lo decidió el usuario. Los propios del tenant operador se gestionan en admin como los de cualquier tenant.
- **Sí: confirmación destructiva al aplicar solo si hay bajas.** Lo decidió el usuario. Las bajas cierran vigencias; las altas y los cambios no destruyen.
- **Sí: `importable` en `CatalogoDto`.** Lo decidió el usuario. Una sola fuente de verdad en `TABLAS_IMPORTABLES`.
- **No: copiar la lista de las 7 tablas en el front.** Quedaría duplicada.
- **Sí: las 7 tablas importables no se editan a mano; solo cambian por importación.** Lo decidió el usuario. Así coinciden con la fuente oficial (TR-RNF-017), y una edición manual no queda pisada por la próxima importación ni deja obsoleta una previsualización pendiente. La regla está en el dominio, no solo en la UI.
- **No: edición libre en las tablas importables.** Corrige un error puntual, pero el cambio se pierde en la siguiente importación.
- **Sí: ruta nueva `GET items-globales/{id}`.** La decidió el usuario. El formulario de edición no depende de la lista y sobrevive a recargar.
- **No: pasar la fila por `history.state`.** Se pierde al recargar.
- **Sí: SSE con `fetch` directo y `SesionService.token()`.** Lo decidió el usuario. No cambia el backend HTTP de la consola, y el `GET` de recuperación sí pasa por el interceptor, que renueva el token.
- **No: `HttpClient` con `withFetch` y `partialText`.** Cambia todo el `HttpClient` de la consola y obliga a reparsear el texto acumulado.
- **Sí: al terminar, toast y la fila sale del panel.** Lo decidió el usuario. El resultado queda en el historial.
- **Sí: reintentos acotados (3, cada 5 s) solo si el `GET` de recuperación falla.** El 19b pide un solo `GET` y reconectar, sin polling. Sin tope, una API caída dejaría la tarea colgada para siempre.
- **Sí: el estado del asistente de importación solo en memoria de la página.** Recargar vuelve al paso 1. La previsualización sigue en la base y la próxima la vence. No hay datos personales que preservar, pero tampoco hace falta un borrador.
- **Sí: lista de catálogos filtrada en el cliente.** `GET /v1/catalogos` no pagina y son decenas de filas.
- **Sí: la opción de menú usa `item_gestionar` y no `leer`.** Un administrador de configuración de un tenant cliente tiene `leer` y no debe ver la consola de catálogos.
- **Sí: `exigirMfa()` antes de cada escritura.** `gestionar`, `item_gestionar` e `importar` son sensibles. La consola exige aal2, pero la recencia de 15 min la valida la API.

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| Un proxy o el dev server de Angular almacena el `text/event-stream` y el avance llega de golpe al final | El back manda `X-Accel-Buffering: no` y `: ping`. Se revisa en el paso 10 con el proxy `/v1` de `nx serve`. Si almacena, se ajusta `proxy.conf.json` y se anota. |
| El token vence durante una importación larga y el stream se corta con 401 | El corte hace un `GET` que pasa por el interceptor (renueva) y se reconecta con el token nuevo. |
| El `PUT` para cerrar la vigencia choca con otra edición (`VERSION_OBSOLETA`) | Se toma la `version` del `GET` justo antes. Si aun así choca, alerta con «Recargar». |
| La previsualización de CIE-10 (miles de cambios) tarda y el usuario cree que se colgó | `vit-cargando` con el texto «Validando el archivo completo…» y el botón deshabilitado. El 19b mide el tiempo. |
| Un usuario de un tenant cliente con `PLAT_PROPIETARIO` abre la consola y tiene `item_gestionar` | La API responde 403 `OPERADOR_REQUERIDO` en las escrituras y en `GET items-globales/{id}`, y `erroresHttpInterceptor` lo avisa. Mismo comportamiento que tenants en el 17b. |
| El canvas cambia algo del spec | Se corrige el spec antes de aprobarlo. |

## Lo que **no** está en este spec

- Feriados, GLOBAL y del tenant, con la lib `feriados` y su opción de menú (spec 19e).
- Ítems propios y ajustes del tenant en `admin-cliente` (spec 19e).
- Cancelar una importación en curso.
- Seguir importaciones de otro operador.
- Notificaciones push o por correo.
- `<ui-catalogo-select>`.
- DTO en `libs/shared/contracts`.
- E2E y axe en CI (spec 27).
- Prod.

Cada uno entra en su propio spec cuando su sprint lo pida.
