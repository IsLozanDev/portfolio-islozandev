# SPEC 15d — Menú lateral colapsable y búsqueda de opciones

> **Status:** Aprobado
> **Depends on:** SPEC 15, SPEC 15b
> **Date:** 2026-11-01
> **Objective:** Permitir en `shared/shell` ocultar el menú lateral a una franja de iconos con submenú, recordar esa elección por dispositivo y buscar opciones del menú por texto, con atajo Ctrl K y navegación por teclado.

## Por qué existe este spec

No tiene fila previa en `docs/roadmap-specs.md`: nace de la revisión de diseño que originó el 15b. El 15b ya está en su límite de tamaño, por eso el menú colapsable va aparte.

Referencia visual: canvas «Vitrina · Diseño UI» (https://claude.ai/artifact/UGvcmiWUiBsMuWerqMiWxh), página «Shell · menú»: menú expandido, menú oculto con submenú, búsqueda con resultados y búsqueda sin resultados. Cuando el canvas y este spec choquen, manda este spec. El menú de 9 módulos del canvas es de ejemplo; el real lo arma `mi-contexto`.

Hallazgos sobre el código actual:

- `vit-layout` usa `mat-sidenav` en modo `side` en escritorio (>= 1024 px, `ANCHO_ESCRITORIO_PX`) y `over` por debajo. El ancho viene de `--mat-sidenav-container-width: 18rem`.
- `vit-menu-lateral` pinta el árbol completo, con cualquier profundidad, y arranca con todos los grupos cerrados (`expandidos` vacío).
- `construirArbolMenu` ya entrega `NodoMenu` con `codigo`, `nombre`, `ruta` (null en grupos), `icono` e `hijos`. La búsqueda trabaja sobre ese árbol, en el cliente.
- El 15b deja el menú lateral en noche, con la marca arriba y la cápsula menta en la opción activa. Este spec parte de ese estado.

RF cubiertos: ninguno nuevo. Es presentación sobre **TR-RF-015** (el menú lo calcula la API; el shell no recalcula permisos).

Reglas: **TR-RN-007**. La búsqueda solo muestra opciones que ya vinieron en `mi-contexto`.

RNF propios:

- **TR-RNF-018**: escritorio con franja de iconos; celular y tablet con el menú encima del contenido y la búsqueda arriba; textos en español de Perú.
- **TR-RNF-019**: 0 violaciones `critical` o `serious` de axe-core con el menú expandido, oculto, con submenú abierto y con resultados de búsqueda.
- **TR-RNF-023**: se verifica en Chromium.

RNF heredados: 024/119 (límites Nx), 025 (cobertura >= 70 % en `shared-shell`), 026 (la búsqueda no se registra en logs).

Historias del backlog: ninguna. Estimado: 6 h.

## Alcance

**In:**

- **Menú oculto o visible (escritorio, >= 1024 px)**:
  - Botón en la barra superior, a la izquierda: `menu_open` con «Ocultar menú» y `menu` con «Mostrar menú», con `aria-expanded`.
  - Visible: 272 px, como hoy con el 15b. Oculto: franja de 72 px.
  - El contenido ocupa el ancho que libera el menú.
  - El cambio de ancho se anima en 200 ms y no se anima con `prefers-reduced-motion`.
- **Franja de iconos (menú oculto)**:
  - Arriba, la inicial «V» de la marca y un botón de búsqueda.
  - Debajo, un botón de icono por cada nodo del primer nivel, con `matTooltip` con su nombre a la derecha y `aria-label` con el mismo nombre.
  - El nodo que contiene la página actual lleva la cápsula menta.
  - Un nodo con ruta navega. Un grupo abre un `mat-menu` a la derecha con su subárbol completo: los niveles más profundos van con sangría, sin expandir ni plegar. Esc lo cierra.
  - El botón de búsqueda muestra el menú y pone el foco en la caja.
- **Recordar la elección**: `localStorage`, clave `vitrina.menu-colapsado`, valor `"true"` o `"false"`. Sin valor o sin acceso a `localStorage`, el menú arranca visible.
- **Grupo de la página actual**: al cargar y en cada `NavigationEnd`, se expanden los grupos que contienen la ruta activa. Los grupos que el usuario abrió siguen abiertos.
- **Búsqueda en el menú** (`vit-buscador-menu`, arriba del árbol, en escritorio y en celular):
  - Busca nodos con ruta cuyo nombre, o el de cualquier grupo que los contiene, incluya el texto. No distingue tildes ni mayúsculas.
  - Cada resultado muestra el icono de su nodo de primer nivel, el nombre con la coincidencia marcada y debajo la ruta de grupos («Caja», «Ventas › Comprobantes»).
  - Sin texto, se ve el árbol. Con texto, se ven solo los resultados.
  - Sin resultados: «Ninguna opción coincide con «…»» y una ayuda.
  - Un botón «Borrar búsqueda» aparece con texto. Sin texto se ve la pista «Ctrl K».
  - Elegir un resultado navega, borra la búsqueda, expande sus grupos y, en celular, cierra el menú como hoy.
  - Teclado (patrón combobox de ARIA): ↑ y ↓ recorren los resultados desde la caja (`aria-activedescendant`), Enter abre el resultado activo y Esc borra la búsqueda. El número de resultados se anuncia con `aria-live="polite"`.
- **Atajo Ctrl K** (Cmd K en macOS): desde cualquier página con shell, muestra el menú si estaba oculto (en celular lo abre), pone el foco en la caja de búsqueda y evita la acción del navegador.
- **Textos** nuevos en `mensajes-shell.ts`.
- **Verificación** con el MCP `playwright` en `plataforma-admin` y `plataforma-consola`.

**Out of scope (for future specs):**

- Guardar la preferencia del menú en la API, por usuario.
- Búsqueda de contenido (usuarios, productos, comprobantes): solo se buscan opciones del menú.
- Franja de iconos en tablet o celular.
- Favoritos u opciones recientes en el menú.
- Arrastrar para cambiar el ancho del menú.
- Tema oscuro (15c) y patrones de `shared/ui` (15e).

## Base de código reutilizada

- `vit-layout`: se conserva `escritorio()`, el cierre del menú al navegar en celular, `VolverAService`, el selector de sucursal y el menú de usuario. Cambian:
  - El ancho del sidenav pasa a depender del estado oculto o visible.
  - El botón de menú de la barra pasa a estar también en escritorio.
  - Se suma el atajo Ctrl K.
- `vit-menu-lateral`: se conservan el árbol, `alternar`, `sangria`, `esRutaExacta`, `routerLinkActive` y el estado vacío. Cambian:
  - Recibe el buscador arriba.
  - Muestra el árbol o los resultados.
  - Expande los grupos de la ruta activa.
- `construirArbolMenu`, `filtrarMenuPorPrefijo` y `NodoMenu`: sin cambios.
- Marca, colores y cápsula: los del 15b.

## Modelo de datos

No hay tablas, migraciones, eventos ni endpoints nuevos. Solo se lee el árbol que ya arma el shell (regla 8).

### Preferencia (`services/preferencia-menu.service.ts`)

```ts
export const CLAVE_MENU_COLAPSADO = 'vitrina.menu-colapsado';

@Injectable({ providedIn: 'root' })
export class PreferenciaMenuService {
  readonly colapsado: Signal<boolean>;   // lee localStorage al crear; false si no hay valor o falla
  alternar(): void;                       // cambia el signal y escribe localStorage (try/catch)
  mostrar(): void;                        // colapsado = false, sin tocar si ya lo está
}
```

### Búsqueda (`utils/buscar-en-menu.ts` y `models/resultado-busqueda-menu.ts`)

```ts
export interface ResultadoBusquedaMenu {
  codigo: string;
  nombre: string;
  ruta: string;                       // nunca null: solo nodos con ruta
  icono: string;                      // el del nodo de primer nivel que lo contiene
  grupos: string[];                   // nombres de los grupos, de afuera hacia adentro
  coincidencia: { inicio: number; fin: number } | null;   // en `nombre`; null si coincidió por un grupo
}

export function normalizarTexto(texto: string): string;   // NFD, sin diacríticos, minúsculas
export function buscarEnMenu(arbol: readonly NodoMenu[], consulta: string): ResultadoBusquedaMenu[];
export function gruposDeRuta(arbol: readonly NodoMenu[], url: string): ReadonlySet<string>;   // códigos de los ancestros del nodo activo
```

- `buscarEnMenu` recorta espacios y devuelve `[]` con consulta vacía. Conserva el orden del árbol. No tiene límite de resultados: el menú no supera unas decenas de opciones.
- Los índices de `coincidencia` se calculan sobre el texto normalizado. Valen para el original porque `normalizarTexto` solo quita marcas combinantes de texto en NFC.
- `gruposDeRuta` usa la misma regla que `esRutaExacta`: la raíz solo en sí misma y el resto también en sus subrutas.

### Componentes nuevos (`shared/shell/src/lib/components/`)

| Componente | Entradas y salidas | Nota |
| --- | --- | --- |
| `buscador-menu` | `nodos: NodoMenu[]`; salida `elegido: ResultadoBusquedaMenu`; método público `enfocar()` | Caja, resultados, combobox y estado sin resultados |
| `riel-menu` | `nodos: NodoMenu[]`; salida `buscar: void` | Franja de iconos, `matTooltip` y `mat-menu` con el subárbol |

### Textos (`mensajes-shell.ts`, se agregan)

| Clave | Texto |
| --- | --- |
| `ocultarMenu` | Ocultar menú |
| `mostrarMenu` | Mostrar menú |
| `buscarEnMenu` | Buscar en el menú |
| `borrarBusqueda` | Borrar búsqueda |
| `atajoBusqueda` | Ctrl K |
| `resultadosMenu(cantidad)` | `1 opción` / `N opciones` |
| `sinResultadosMenu(consulta)` | `Ninguna opción coincide con «${consulta}»` |
| `ayudaSinResultados` | Revise cómo lo escribió o pruebe con otra palabra. |

### Medidas

`ANCHO_MENU_VISIBLE_PX = 272`, `ANCHO_MENU_OCULTO_PX = 72` y `DURACION_ANIMACION_MENU_MS = 200`, en `models/medidas-shell.ts`. El ancho se aplica con `--mat-sidenav-container-width` y `mat-sidenav-container` en `autosize` para que el contenido se reacomode.

## Plan de implementación

1. **Búsqueda pura.** `normalizarTexto`, `buscarEnMenu`, `gruposDeRuta` y `ResultadoBusquedaMenu`, con pruebas:
   - tildes y mayúsculas;
   - coincidencia por grupo;
   - orden;
   - consulta vacía;
   - árbol de tres niveles;
   - raíz frente a subrutas.

   Verificar: `nx test shared-shell`.
2. **Preferencia.** `PreferenciaMenuService` con pruebas: sin valor, valor guardado y `localStorage` que lanza error.
3. **Grupo activo.** `vit-menu-lateral` expande los grupos de `gruposDeRuta` al iniciar y en `NavigationEnd`, sin cerrar los abiertos. Prueba con un router de prueba.
4. **Buscador.** `vit-buscador-menu` con su plantilla de árbol o resultados, la marca de coincidencia, el estado sin resultados y el combobox de teclado. Pruebas de escribir, ↑ ↓ Enter, Esc, el anuncio de resultados y la salida `elegido`. Montarlo en `vit-menu-lateral`.
5. **Franja.** `vit-riel-menu` con `matTooltip`, el `mat-menu` del subárbol y la cápsula del activo. Pruebas: un nodo con ruta navega, un grupo abre el submenú y la búsqueda emite `buscar`.
6. **Layout.**
   - Botón de ocultar y mostrar en escritorio.
   - Ancho según `PreferenciaMenuService`, `autosize` y animación con reducción de movimiento.
   - El menú completo o la franja según el estado.
   - Atajo Ctrl K / Cmd K.

   Actualizar las pruebas del layout.
7. **Verificación en navegador.**
   - Playwright en las dos apps a 1280 y 360 px.
   - Ocultar, recargar y seguir oculto.
   - Submenú con teclado.
   - Buscar «caja» y «salon», elegir un resultado con Enter.
   - Ctrl K con el menú oculto.
   - axe y consola sin errores, y capturas comparadas con el canvas.

   Pasar `code-simplifier:code-simplifier` sobre los archivos modificados.

## Criterios de aceptación

- [ ] `nx affected -t lint test build` en verde; cobertura >= 70 % en `shared-shell`.
- [ ] A 1280 px, «Ocultar menú» deja una franja de 72 px con un icono por nodo de primer nivel, y el contenido se ensancha.
- [ ] «Mostrar menú» vuelve a 272 px.
- [ ] El botón cambia de icono, de nombre accesible y de `aria-expanded`.
- [ ] Con el menú oculto, recargar la página lo mantiene oculto. Borrar la clave `vitrina.menu-colapsado` lo deja visible al recargar.
- [ ] Con `localStorage` bloqueado, el menú se oculta y se muestra sin errores en consola y arranca visible.
- [ ] Con `prefers-reduced-motion: reduce`, el ancho cambia sin animación.
- [ ] En la franja, cada icono muestra su nombre como tooltip al recibir el puntero o el foco, y tiene ese nombre como `aria-label`.
- [ ] En la franja, pulsar un grupo abre un submenú con todo su subárbol. Esc lo cierra y devuelve el foco al icono. Elegir una opción navega.
- [ ] En la franja, el icono del módulo que contiene la página actual lleva la cápsula menta.
- [ ] Al entrar por URL a una página de un grupo, ese grupo aparece expandido en el menú visible.
- [ ] Escribir «salon» muestra las opciones de «Salón» con la coincidencia marcada y la ruta de grupos debajo.
- [ ] Escribir «zzz» muestra «Ninguna opción coincide con «zzz»».
- [ ] La búsqueda solo muestra opciones presentes en `mi-contexto`.
- [ ] ↓ marca el primer resultado y Enter navega a él, borra la búsqueda y expande su grupo. Esc borra la búsqueda.
- [ ] El número de resultados se anuncia en una región `aria-live`.
- [ ] Ctrl K (Cmd K en macOS) con el menú oculto lo muestra y pone el foco en la búsqueda. En celular abre el menú con el foco en la búsqueda.
- [ ] A 360 px, el menú se abre encima del contenido, con la búsqueda arriba y sin franja de iconos. Elegir un resultado lo cierra.
- [ ] axe-core: 0 violaciones `critical` o `serious` con el menú visible, oculto, con submenú abierto y con resultados, en las dos apps.
- [ ] Consola del navegador sin errores en esos estados.
- [ ] El código nuevo sigue la sección «Código limpio» de `CLAUDE.md` y la estructura de libs Angular.

## Decisiones

- **Sí:** submenú con el subárbol completo, sin expandir ni plegar (decisión del usuario). Un solo clic muestra todo el módulo.
- **No:** submenú solo con el primer nivel. Obliga a volver al menú completo para los niveles profundos.
- **Sí:** `mat-menu` para el submenú. Trae foco, Esc y posición sin código propio.
- **Sí:** preferencia en `localStorage`, por dispositivo (decisión del usuario).
- **No:** preferencia por usuario en la API. Suma un endpoint para una comodidad local.
- **Sí:** buscar nodos con ruta, también por el nombre de sus grupos, y sin distinguir tildes ni mayúsculas (decisión del usuario).
- **Sí:** atajo Ctrl K / Cmd K (decisión del usuario). Es la convención de las paletas de comandos. Pisa la acción del navegador solo mientras la página tiene el foco.
- **No:** la tecla «/». Choca al escribir en campos y no es tan conocida en apps de gestión.
- **Sí:** patrón combobox con flechas, Enter y Esc (decisión del usuario).
- **Sí:** expandir solos los grupos de la página actual (decisión del usuario).
- **Sí:** en celular solo se suma la búsqueda (decisión del usuario). La franja de iconos no tiene sentido en un menú que se abre encima.
- **Sí:** búsqueda en el cliente sobre el árbol ya cargado. El menú no supera unas decenas de opciones y no hace falta la API.
- **Sí:** `autosize` en `mat-sidenav-container` para que el contenido acompañe el ancho del menú.

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| `autosize` de `mat-sidenav-container` recalcula en cada ciclo y puede costar rendimiento | Medir en Playwright con el perfil de rendimiento. Si se nota, cambiar el margen del contenido por CSS con el mismo signal y dejar `autosize` apagado |
| Ctrl K no llega si el foco está dentro de un iframe o un control que lo consume | El escuchador va en `document` y el botón de búsqueda de la franja da otro camino |
| Los índices de coincidencia se corren con texto en NFD de la API | Pasar el nombre a NFC antes de buscar y una prueba con un nombre en NFD |
| Tooltips y submenú de la franja quedan detrás de otros overlays | Los dos usan el overlay del CDK, como el resto de Material |

## Lo que **no** está en este spec

- Preferencia del menú guardada en la API.
- Búsqueda de contenido fuera del menú.
- Franja de iconos en tablet o celular.
- Favoritos, recientes o menú redimensionable.
- Tema oscuro y patrones de `shared/ui`.

Cada uno, si llega, va en su propio spec.
