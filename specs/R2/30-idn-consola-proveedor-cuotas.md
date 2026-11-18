# SPEC 30 — Identidad: consola de cuotas y proveedores DNI/RUC, y tarjeta de consumo en admin

> **Status:** Aprobado
> **Depends on:** SPEC 29, SPEC 17b, SPEC 17c, SPEC 15b, SPEC 15c, SPEC 15d
> **Date:** 2026-11-16
> **Objective:** Dar en `plataforma-consola` la lista de cuotas DNI/RUC por tenant y mes, su detalle con ajuste de incluidas del mes actual y la edición de proveedores, y en el Inicio de `plataforma-admin` una tarjeta con el consumo del propio tenant.

## Por qué existe este spec

Fila 30 de `docs/roadmap-specs.md` (UI de TR-RF-047; pantalla «Proveedor DNI/RUC y cuotas» del plan 6.1, fila R2). Contexto: `docs/spec-context/tr-idn/idn-cuota-y-consola-proveedor.md`, partición B. El spec 29 dejó los seis endpoints implementados; este spec solo los consume. No toca el back salvo el manifiesto.

Lo que hay en el código hoy (revisado al redactar):

- `GET /v1/identidad/cuota-actual` (`plat.identidad.cuota`): `{ periodo, plan, incluidas, consumidas, porcentaje, umbral_aviso }`. No crea la fila; si no existe devuelve la cuota calculada con `consumidas = 0`.
- `GET /v1/identidad/cuotas?periodo=&q=&pagina=&tamano=` (`plat.identidad.cuota_gestionar`, operador): `{ periodo, items, total, pagina, tamano }`. Cada ítem trae `tenant_id, tenant_nombre, plan, incluidas, consumidas, porcentaje, avisado_umbral_en, avisado_agotada_en, version`, ordenados de mayor a menor consumo. Solo lista tenants con fila en ese mes.
- `GET /v1/identidad/cuotas/{tenantId}/{periodo}`: la fila más `periodo`, `creada_en` y `consultas_por_resultado` (`CACHE, PROVEEDOR, NO_ENCONTRADO, INVALIDO, CUOTA_AGOTADA, PROVEEDOR_NO_DISPONIBLE`). Sin fila: 404 `CUOTA_NO_ENCONTRADA`.
- `PATCH /v1/identidad/cuotas/{tenantId}/{periodo}` (sensible, aal2): body `{ incluidas, version }`. Errores 422 `INCLUIDAS_MENOR_QUE_CONSUMIDAS`, 422 `PERIODO_CERRADO`, 409 `VERSION_OBSOLETA`.
- `GET /v1/identidad/proveedores` (`plat.identidad.proveedor`, operador): `[{ codigo, tipos_doc, prioridad, ttl_dias, timeout_ms, activo, version }]` por prioridad.
- `PATCH /v1/identidad/proveedores/{codigo}` (sensible, aal2): body parcial `{ prioridad?, ttl_dias?, timeout_ms?, activo?, version }`. Rangos en `RANGOS_PROVEEDOR` de `identidad` (prioridad > 0, TTL 1-365, timeout 100-10 000). Errores 422 `ULTIMO_PROVEEDOR_ACTIVO`, 404 `PROVEEDOR_NO_ENCONTRADO`, 409 `VERSION_OBSOLETA`.
- Los dos de gestión responden 403 `OPERADOR_REQUERIDO` desde un tenant cliente.
- `apps/plataforma-consola/src/app/app.routes.ts`: rutas lazy con `aal2Guard` y `permisoGuard`. Las libs de consola (`consola-catalogos`, `consola-tenants`, `consola-soporte`) son `scope:plataforma`, `type:feature`, con `pages/`, `services/*.cliente.ts` (URL base `inject(CONFIG_AUTH).apiUrl`), `models/` (incluido `tonos.ts`) y `src/testing/`.
- `apps/plataforma-admin/src/app/pages/inicio/inicio.page.*`: portada con correo y sucursal. `SiPermisoDirective` (`*siPermiso`) en `@vitrina/shared/auth`.
- `shared/ui`: `vit-tabla`, `vit-filtros`, `vit-chip-estado` (`TonoEstado`: `exito | advertencia | info | neutro | error`), `vit-estado-vacio`, `vit-cargando`, `vit-acciones-formulario`, `PanelLateralService`, `AvisosService`.
- Manifiesto PLAT `1.18.0`: los tres permisos de identidad, sin opción de menú.

RF cubierto (UI): **TR-RF-047** (consumo visible por tenant).

Criterios del SRS: **TR-CA-120** a **122** se probaron en el 29 (back). TR-CA-121 «el formulario habilita el ingreso manual» es de `<ui-persona-buscador>` (spec 38). Los de este spec son propios.

Reglas: **TR-RN-009** (la consola exige aal2; los `PATCH` son sensibles), **TR-RN-031** (la UI solo muestra lo que cuenta el back).

RNF propios:

- **TR-RNF-018**: 360, 600, 768 y 1280 px.
- **TR-RNF-019**: axe-core sin `critical` ni `serious`.
- **TR-RNF-122**: solo tokens.
- Constitución, regla 9: ninguna pantalla muestra ni edita credenciales de proveedor.

RNF heredados: 010, 012, 024/119, 101.

Historias del backlog: ninguna propia (el plan 6.1 nombra la pantalla sin historia front). Estimado: 8 h. Si se pasa, se recortan primero los contadores por resultado del detalle.

## Diseño UI

| Pantalla | Pantalla tipo | Cambia en |
| --- | --- | --- |
| Cuotas DNI/RUC (consola) | Lista | Select de mes junto a `vit-filtros` (búsqueda por nombre); columna «Consumo» con barra y `consumidas / incluidas`; chip de estado |
| Detalle de cuota (consola) | Detalle | Barra de consumo grande, fechas de los avisos, tabla de consultas por resultado; botón «Ajustar incluidas» solo en el mes actual |
| Ajustar incluidas | Formulario en panel lateral | Un campo numérico con el mínimo = consumidas |
| Proveedores DNI/RUC (consola) | Lista | Sin filtros ni paginación (pocas filas); chip Activo/Inactivo; tipos de documento como texto |
| Editar proveedor | Formulario en panel lateral | Prioridad, TTL (días), timeout (ms) e interruptor «Activo»; desactivar pide confirmación |
| Tarjeta de consumo (admin, Inicio) | Ninguna (nueva) | Tarjeta con mes, plan, barra, `consumidas de incluidas` y texto del estado |

Estado de la cuota (el mismo mapa en la lista, el detalle y la tarjeta), en `models/tonos.ts`:

| Estado | Condición | Tono | Texto |
| --- | --- | --- | --- |
| `AGOTADA` | `consumidas >= incluidas` | `error` | «Agotada» |
| `EN_AVISO` | `avisado_umbral_en` no nulo (consola) o `porcentaje >= umbral_aviso` (tarjeta) | `advertencia` | «Sobre el umbral» |
| `NORMAL` | el resto | `exito` | «Normal» |

- La barra es `mat-progress-bar` en modo `determinate`. Su color sale del tono del estado por tokens `--color-*`, sin hex.
- Después de guardar este spec se dibujan en el canvas «Vitrina · Diseño UI» (https://claude.ai/artifact/UGvcmiWUiBsMuWerqMiWxh), en una página «30 · Identidad», en claro y oscuro y a 600 px:
  - la lista de cuotas con filas en los tres estados;
  - el detalle con el panel «Ajustar incluidas» abierto;
  - la lista de proveedores con el panel de edición abierto;
  - la tarjeta de consumo en el Inicio de admin, en `NORMAL` y en `AGOTADA`.
- El usuario revisa el canvas antes de aprobar. Si el canvas cambia algo, se corrige el spec.
- Se verifica en tema claro y oscuro y a 600 px de ancho.

## Alcance

**Entra:**

- **Lib nueva** `libs/plataforma/consola-identidad` (`scope:plataforma`, `type:feature`, prefijo `vit`, alias `@vitrina/plataforma/consola-identidad`), con la estructura de `consola-catalogos`.
- **Rutas** en `CONSOLA_IDENTIDAD_ROUTES`: `cuotas`, `cuotas/:tenantId/:periodo` y `proveedores`. La app las monta en `consola/identidad` con `aal2Guard`. Cada ruta lleva su `permisoGuard`.
- **Páginas** `CuotasListaPage`, `CuotaDetallePage` y `ProveedoresListaPage`.
- **Componentes** `vit-panel-ajuste-cuota` y `vit-panel-proveedor` (contenido del panel lateral) y `vit-barra-consumo` (barra con su tono).
- **Clientes** `CuotasCliente` (`listar`, `detalle`, `ajustar`) y `ProveedoresCliente` (`listar`, `actualizar`).
- **Tarjeta** `vit-tarjeta-consumo-identidad` en `libs/plataforma/admin-cliente/src/lib/components/`, con su `CuotaActualCliente`, exportada por el `index.ts` de `admin-cliente` y puesta en `InicioPage` de `plataforma-admin` dentro de `*siPermiso="'plat.identidad.cuota'"`.
- **Manifiesto PLAT `1.19.0`**: opciones «Cuotas DNI/RUC» y «Proveedores DNI/RUC» bajo Consola.
- **Pruebas** unitarias (Vitest con `@angular/build:unit-test`) y verificación en el navegador con el MCP Playwright.
- **Nube, dev (manual)**: aplicar el manifiesto `1.19.0`.

**No entra (specs futuros):**

- Cambios en la API de `/v1/identidad` (el 29 está implementado).
- Ajustar las incluidas de un mes futuro o de un tenant sin fila en el mes. El select solo ofrece el mes actual y los 11 anteriores.
- Estado del circuit breaker (abierto/cerrado, último error) y alta o baja de proveedores.
- Credenciales de proveedor (regla 9).
- Bitácora de consultas por consulta y exportación.
- Editar `plat.identidad.cuota_umbral_aviso` desde la tarjeta: se cambia en la pantalla de parámetros que ya existe.
- Correo del aviso al 80 % (TR-NOT, R2-09).
- Ingreso manual del formulario del producto cuando la cuota se agota (`<ui-persona-buscador>`, spec 38).
- Etiquetas de plan distintas del código (`BASICO`, `PRO`, `EMPRESA` se muestran tal cual).

## Base de código reutilizada

| Pieza | Qué se hace |
| --- | --- |
| `consola-catalogos` y `consola-tenants` | Patrón de lib, clientes, `tonos.ts`, mensajes de error por código y filtros en la URL (`utils/filtro-url.ts` del 17b se copia adaptado; no se importa entre libs feature). |
| `vit-tabla`, `vit-filtros`, `vit-chip-estado`, `vit-estado-vacio`, `vit-cargando` | Lista de cuotas y de proveedores. `ColumnaTabla.movil` para 360-600 px. |
| `PanelLateralService`, `vit-acciones-formulario` | Ajuste de incluidas y edición de proveedor. |
| `AvisosService` | Confirmación al desactivar un proveedor y avisos de éxito. |
| `SiPermisoDirective` | Muestra la tarjeta solo con `plat.identidad.cuota`. |
| `RANGOS_PROVEEDOR` | No se importa (el front no depende de la lib de back): los rangos se repiten como constantes en `models/proveedor.ts` y el back sigue siendo la barrera. |

## Modelo de datos

Este spec no crea tablas ni endpoints. Solo modelos del front.

### `libs/plataforma/consola-identidad/src/lib/models/`

```ts
// cuota.ts
export type PlanCuota = 'BASICO' | 'PRO' | 'EMPRESA';
export type EstadoCuota = 'NORMAL' | 'EN_AVISO' | 'AGOTADA';

export interface FilaCuota {
  tenantId: string; tenantNombre: string; plan: PlanCuota;
  incluidas: number; consumidas: number; porcentaje: number;
  avisadoUmbralEn: string | null; avisadoAgotadaEn: string | null; version: number;
}
export interface PaginaCuotas { periodo: string; items: FilaCuota[]; total: number; pagina: number; tamano: number }
export type ResultadoConsulta = 'CACHE' | 'PROVEEDOR' | 'NO_ENCONTRADO' | 'INVALIDO' | 'CUOTA_AGOTADA' | 'PROVEEDOR_NO_DISPONIBLE';
export interface DetalleCuota extends FilaCuota {
  periodo: string; creadaEn: string;
  consultasPorResultado: Record<ResultadoConsulta, number>;
}
// + mapeos desde el DTO snake_case de la API
```

```ts
// proveedor.ts
export interface Proveedor {
  codigo: string; tiposDoc: string[]; prioridad: number;
  ttlDias: number; timeoutMs: number; activo: boolean; version: number;
}
export type CambiosProveedor = Partial<Pick<Proveedor, 'prioridad' | 'ttlDias' | 'timeoutMs' | 'activo'>> & { version: number };
export const RANGOS_PROVEEDOR = {
  prioridad: { minimo: 1 }, ttlDias: { minimo: 1, maximo: 365 }, timeoutMs: { minimo: 100, maximo: 10_000 },
} as const;
```

- `tonos.ts`: `TONOS_ESTADO_CUOTA: Record<EstadoCuota, TonoEstado>` y `TONOS_PROVEEDOR` (`activo` → `exito`, inactivo → `neutro`).
- `permisos-identidad.ts`: `PERMISOS_CONSOLA_IDENTIDAD = { cuotaGestionar: 'plat.identidad.cuota_gestionar', proveedor: 'plat.identidad.proveedor' }`.
- `mensajes-identidad.ts`: textos por código de error (`INCLUIDAS_MENOR_QUE_CONSUMIDAS`, `PERIODO_CERRADO`, `VERSION_OBSOLETA`, `ULTIMO_PROVEEDOR_ACTIVO`, `PROVEEDOR_NO_ENCONTRADO`, `CUOTA_NO_ENCONTRADA`, `OPERADOR_REQUERIDO`) y etiquetas de `ResultadoConsulta` («Desde caché», «Al proveedor», «No encontrado», «Inválido», «Rechazada por cuota», «Proveedor no disponible»).

### `utils/`

- `periodo.ts`: `periodoActual(ahora: Date)` en `America/Lima` con `Intl`; `periodosSeleccionables(ahora)` → el actual y los 11 anteriores, de más nuevo a más viejo; `etiquetaPeriodo('2026-11')` → «noviembre 2026»; `esPeriodoActual`.
- `estado-cuota.ts`: `estadoDeFila(fila)` (usa `avisadoUmbralEn`) y `estadoDeCuotaActual(cuota)` (usa `porcentaje >= umbralAviso`), según la tabla de Diseño UI.

### URL de la lista de cuotas

`/consola/identidad/cuotas?periodo=2026-11&q=pollo&pagina=1`. Sin `periodo` o con uno fuera de `periodosSeleccionables` se usa el actual. Cambiar el mes o la búsqueda vuelve a la página 1. Gana la última consulta (patrón de la bitácora).

### Tarjeta en admin (`libs/plataforma/admin-cliente`)

- `models/cuota-actual.ts`: `CuotaActual { periodo, plan, incluidas, consumidas, porcentaje, umbralAviso }` y su mapeo.
- `services/cuota-actual.cliente.ts`: `CuotaActualCliente.obtener()`.
- `components/tarjeta-consumo-identidad/`: estados cargando, cargada y error. Con error (cualquier 4xx/5xx) muestra «No se pudo cargar el consumo» sin bloquear el Inicio.
- `estadoDeCuotaActual`, `etiquetaPeriodo` y el mapa de tonos se repiten en `admin-cliente` (`utils/` y `models/`), porque una lib feature no importa de otra. Son tres funciones cortas; si aparece un tercer consumidor se mueven a una lib `shared`.

### Manifiesto PLAT `1.19.0`

```json
{ "codigo": "plat.consola.identidad_cuotas", "modulo": "consola", "padre": "plat.consola", "nombre": "Cuotas DNI/RUC", "ruta": "/consola/identidad/cuotas", "icono": "data_usage", "orden": 5, "permisos": ["plat.identidad.cuota_gestionar"] },
{ "codigo": "plat.consola.identidad_proveedores", "modulo": "consola", "padre": "plat.consola", "nombre": "Proveedores DNI/RUC", "ruta": "/consola/identidad/proveedores", "icono": "badge", "orden": 6, "permisos": ["plat.identidad.proveedor"] }
```

Sin permisos ni roles nuevos.

## Comportamiento

### Lista de cuotas

- Columnas: Tenant, Plan, Consumo (`vit-barra-consumo` + `consumidas / incluidas` + `porcentaje %`), Estado (chip). En móvil: tenant, consumo y estado.
- Clic en la fila → `cuotas/:tenantId/:periodo`.
- Lista vacía: `vit-estado-vacio` «No hay cuotas en {mes}». Con búsqueda: «Ningún tenant coincide con la búsqueda».
- Paginación de 20.

### Detalle de cuota

- Encabezado: nombre del tenant, mes, plan, chip de estado.
- Barra grande con `consumidas de incluidas (porcentaje %)`.
- «Aviso de umbral enviado el …» y «Aviso de agotada enviado el …» en hora de Lima, o «Sin aviso».
- Tabla «Consultas del mes» con las seis filas de `consultasPorResultado` y una fila de total.
- Botón «Ajustar incluidas» solo si `esPeriodoActual(periodo)`. Abre `vit-panel-ajuste-cuota` con el valor actual. Validación en el front: entero ≥ `consumidas`. Al guardar: `PATCH` con la `version` del detalle, aviso de éxito y recarga del detalle.
- 404 `CUOTA_NO_ENCONTRADA` → `vit-estado-vacio` «Este tenant no tiene cuota en {mes}» con enlace a la lista.
- 409 `VERSION_OBSOLETA` en el panel → mensaje «La cuota cambió mientras la editabas» y el panel recarga el detalle sin cerrarse.
- 422 → el mensaje del código bajo el campo.

### Proveedores

- Columnas: Prioridad, Código, Tipos de documento, TTL (días), Timeout (ms), Estado (chip). Orden de la API (prioridad).
- Clic en la fila → `vit-panel-proveedor` con los tres números y el interruptor «Activo». Validación con `RANGOS_PROVEEDOR`. El `PATCH` lleva solo los campos cambiados y la `version`.
- Si se pasa «Activo» a falso, antes del `PATCH` se pide confirmación con `AvisosService` («Las consultas dejarán de usar {codigo}»; botón `vit-destructivo`).
- 422 `ULTIMO_PROVEEDOR_ACTIVO` → mensaje en el panel, el interruptor vuelve a activo.
- 409 → mismo trato que en el ajuste de cuota.
- Al guardar: aviso de éxito y recarga de la lista (el orden puede cambiar).
- La pantalla no muestra ni pide credenciales.

### Errores comunes

- 403 `OPERADOR_REQUERIDO` en las tres pantallas → `vit-estado-vacio` «Esta pantalla solo está disponible para el operador de la plataforma». Pasa si un usuario con el rol abre la consola desde un tenant cliente.
- Los 5xx y la falta de conexión los avisa el interceptor global (`shared/shell`).

## Plan de implementación

1. **Lib y rutas.** Generar `consola-identidad` con los generadores de `nx.json` (tags, alias, `tsconfig.lib.json` sin `src/testing`). Crear `CONSOLA_IDENTIDAD_ROUTES` con las tres rutas y páginas vacías. Montarla en `consola/identidad` en `app.routes.ts` antes de la ruta genérica `consola`. Prueba de rutas y guards.
2. **Modelos y utilidades.** `cuota.ts`, `proveedor.ts`, `tonos.ts`, `permisos-identidad.ts`, `mensajes-identidad.ts`, `periodo.ts`, `estado-cuota.ts`, `filtro-url.ts`. Pruebas: periodo en el cambio de mes en Lima, 12 periodos seleccionables, los tres estados, mapeos desde el DTO.
3. **Clientes.** `CuotasCliente` y `ProveedoresCliente` con `HttpTestingController`: URL, query, body del `PATCH` (solo campos cambiados), mapeo de errores por código.
4. **Lista de cuotas.** `CuotasListaPage` y `vit-barra-consumo`: select de mes, búsqueda, paginación, URL, estados vacío y cargando, 403 operador.
5. **Detalle y ajuste.** `CuotaDetallePage` y `vit-panel-ajuste-cuota`: contadores, avisos, botón solo en el mes actual, 404, 409 y 422.
6. **Proveedores.** `ProveedoresListaPage` y `vit-panel-proveedor`: edición, confirmación al desactivar, 422 `ULTIMO_PROVEEDOR_ACTIVO`, 409.
7. **Tarjeta en admin.** `CuotaActualCliente`, utilidades, tonos y `vit-tarjeta-consumo-identidad` en `admin-cliente`; export en `index.ts`; uso en `InicioPage` con `*siPermiso`. Pruebas de los tres estados y del error.
8. **Manifiesto `1.19.0`** con las dos opciones y la versión esperada en las pruebas de manifiesto.
9. **Cierre.** `nx affected -t lint test build` verde, `code-simplifier` sobre los archivos tocados, verificación con el MCP Playwright (consola y admin levantadas, API con `IDN_PROVEEDOR=falso`) en claro, oscuro, 360 y 600 px, axe-core, y manifiesto aplicado en dev.

## Criterios de aceptación

- [ ] En la consola, con `plat.identidad.cuota_gestionar`, el menú muestra «Cuotas DNI/RUC»; con `plat.identidad.proveedor`, «Proveedores DNI/RUC». Sin el permiso, la opción no aparece y la ruta no carga.
- [ ] `/consola/identidad/cuotas` sin `periodo` lista el mes actual en hora de Lima; el select ofrece exactamente el mes actual y los 11 anteriores.
- [ ] Cambiar el mes o la búsqueda actualiza la URL y vuelve a la página 1; recargar la página conserva el filtro.
- [ ] Una fila con 500 de 500 muestra el chip «Agotada» en tono `error`; una con `avisado_umbral_en` y 400 de 500, «Sobre el umbral» en `advertencia`; una con 100 de 500, «Normal» en `exito`.
- [ ] Clic en una fila abre `/consola/identidad/cuotas/{tenantId}/{periodo}` con la barra, las fechas de aviso y las seis cuentas por resultado con su total.
- [ ] En un mes pasado el detalle no muestra «Ajustar incluidas».
- [ ] Ajustar a 800 una cuota de 500 con 120 consumidas manda `PATCH { incluidas: 800, version }`, muestra el aviso de éxito y el detalle queda en 120 de 800.
- [ ] El panel no deja guardar un valor menor que `consumidas`; si la API responde 422 `INCLUIDAS_MENOR_QUE_CONSUMIDAS`, el mensaje aparece bajo el campo.
- [ ] Con 409 `VERSION_OBSOLETA`, el panel avisa, recarga el detalle y sigue abierto.
- [ ] Un detalle sin fila (404) muestra «Este tenant no tiene cuota en {mes}».
- [ ] La lista de proveedores sale por prioridad. Pasar `DECOLECTA` de prioridad 1 a 3 manda `PATCH { prioridad: 3, version }` y la lista recargada lo muestra después del de prioridad 2.
- [ ] Desactivar un proveedor pide confirmación. Cancelar no manda nada. Si la API responde 422 `ULTIMO_PROVEEDOR_ACTIVO`, el panel lo explica y el interruptor vuelve a activo.
- [ ] Ninguna pantalla ni respuesta mostrada contiene credenciales de proveedor.
- [ ] Desde un tenant cliente con el rol, las pantallas de consola muestran el mensaje de solo operador (403 `OPERADOR_REQUERIDO`).
- [ ] En el Inicio de `plataforma-admin`, un usuario con `plat.identidad.cuota` ve la tarjeta con mes, plan, barra y «120 de 500 consultas»; sin el permiso no se pide `cuota-actual` ni se ve la tarjeta.
- [ ] La tarjeta con 410 de 500 y `umbral_aviso` 80 muestra «Sobre el umbral»; con 500 de 500, «Agotada»; si la API falla, «No se pudo cargar el consumo» y el resto del Inicio funciona.
- [ ] Las pantallas nuevas se ven correctas en tema claro y oscuro y a 360 y 600 px, sin scroll horizontal de página (Playwright, con capturas).
- [ ] axe-core sin `critical` ni `serious` en las cinco vistas.
- [ ] Solo tokens de color: ningún hex en los `.css` ni `.html` nuevos.
- [ ] La consola del navegador queda sin errores en los recorridos.
- [ ] `consola-identidad` solo importa de `scope:shared` (prueba de límites); `admin-cliente` no importa de `consola-identidad`.
- [ ] Manifiesto `1.19.0` con las dos opciones; aplicado en dev.
- [ ] El código nuevo sigue las secciones «Código limpio», «Estructura de libs Angular» y «Diseño UI» de `CLAUDE.md`.
- [ ] `nx affected -t lint test build` verde.

## Decisiones

- **Sí:** dos opciones de menú y dos rutas (`cuotas`, `proveedores`). Decisión del usuario. Cada una tiene su permiso y el menú las filtra sin lógica extra.
- **No:** una página con pestañas. Obliga a esconder pestañas por permiso dentro de la página.
- **Sí:** página de detalle con ruta propia y ajuste en el panel lateral. Decisión del usuario. El detalle se puede enlazar y el formulario sigue la regla del panel.
- **Sí:** tarjeta en el Inicio de admin, sin opción de menú. Decisión del usuario. Son cuatro números; una página propia sobra.
- **Sí:** select con el mes actual y los 11 anteriores. Decisión del usuario. Sin datepicker.
- **Sí:** solo se ajusta el mes actual. Decisión del usuario. La lista de un mes futuro sale vacía (la API solo lista filas existentes) y un buscador de tenants suma 2 h sin pedido del RF.
- **Sí:** toda la edición del proveedor en el panel, con confirmación al desactivar. Decisión del usuario. Un solo lugar que edita.
- **Sí:** se dibujan las cinco vistas en el canvas antes de aprobar. Decisión del usuario. La tarjeta no encaja en ninguna pantalla tipo.
- **Sí:** el estado «Sobre el umbral» en la consola sale de `avisado_umbral_en`, porque la lista no trae el umbral del tenant; en la tarjeta, de `porcentaje >= umbral_aviso`. Los dos coinciden salvo que el tenant cambie su umbral a mitad de mes.
- **Sí:** lib nueva `consola-identidad`, como las demás de consola. No se mezcla en `consola-tenants`.
- **Sí:** la tarjeta vive en `admin-cliente` y la usa la app. `plataforma-admin` ya depende de esa lib.
- **Sí:** repetir en `admin-cliente` las tres utilidades chicas de estado y periodo. Una lib feature no importa de otra; una lib `shared` nueva por tres funciones es más costo que la copia.
- **Sí:** los rangos de proveedor se repiten en el front para validar en el formulario; el back sigue siendo la barrera.
- **Sí:** el `PATCH` de proveedor manda solo los campos cambiados, así el evento `proveedor_identidad.actualizado` refleja lo que tocó el operador.
- **Sí:** el 403 `OPERADOR_REQUERIDO` se muestra como estado vacío y no como error.
- **No:** estado del circuit breaker, alta o baja de proveedores, credenciales ni bitácora por consulta. Fuera del 29 y del RF.
- **No:** editar el umbral de aviso desde la tarjeta. Ya existe la pantalla de parámetros.

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| Un tenant creado a mitad de mes que todavía no consulta no aparece en la lista | Es lo que devuelve la API. El estado vacío lo dice y la fila aparece con la primera consulta o el día 1. |
| El chip de la consola y el de la tarjeta difieren si el tenant cambia su umbral a mitad de mes | Decisión documentada; el chip de la consola refleja el aviso que de verdad se publicó. |
| La copia de utilidades entre `consola-identidad` y `admin-cliente` se desincroniza | Son funciones puras con prueba en los dos lados y casos iguales. |
| El `PATCH` sensible pide aal2 y la sesión lo perdió | La consola entera ya exige aal2 (`aal2Guard`); un 401 `MFA_REQUERIDA` lo atiende `authInterceptor` de `shared/auth` (lleva a la verificación con retorno). |

## Lo que **no** entra en este spec

- Cambios en la API de identidad.
- Ajuste de meses futuros o de tenants sin fila.
- Circuit breaker, alta o baja de proveedores y credenciales.
- Bitácora de consultas como pantalla.
- Correo del aviso (TR-NOT) e ingreso manual del producto (spec 38).
