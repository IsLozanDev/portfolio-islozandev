# SPEC 15c — Tema oscuro con selector Sistema, Claro y Oscuro

> **Status:** Implementado
> **Depends on:** SPEC 15b, SPEC 15d
> **Date:** 2026-11-01
> **Objective:** Agregar a `shared/ui` y `shared/shell` un tema oscuro pensado para reducir la fatiga visual, con un selector Sistema / Claro / Oscuro en el menú de usuario que se recuerda por dispositivo y se aplica sin parpadeo en las dos apps.

## Por qué existe este spec

No tiene fila previa en `docs/roadmap-specs.md`: nace de la revisión de diseño del 15b, que deja el modo oscuro fuera de su alcance. Va después del 15b y del 15d para diseñar e implementar el oscuro una sola vez, cuando ya no cambian colores ni componentes del shell.

Referencia visual: canvas «Vitrina · Diseño UI» (https://claude.ai/artifact/UGvcmiWUiBsMuWerqMiWxh), página «Tema oscuro»: lista con selector de tema, ingresar, detalle, formulario y confirmación. Cuando el canvas y este spec choquen, manda este spec.

Hallazgos sobre el código actual:

- `material.scss` fija `color-scheme: light` dentro de `aplicar-tema()`. Material 3 en Angular 21 genera los colores con `light-dark()`, y basta cambiar `color-scheme` para pasar a oscuro (guía de theming de Angular Material 21, consultada con ctx7).
- `tema.css` (`@theme` de Tailwind) apunta casi todo a `--mat-sys-*`. Los tokens fijos que suma el 15b (noche, menta, tonos de chip, fila resaltada) no cambian solos.
- `sweetalert.css` ya usa `--mat-sys-*`: los avisos cambian con el tema sin tocarlo.
- Las apps no tienen Content Security Policy. Un script corto en línea en `index.html` puede fijar el tema antes de que Angular arranque.
- `plataforma-admin` y `plataforma-consola` son orígenes distintos: `localStorage` no se comparte entre ellas.

RF cubiertos: ninguno. Es presentación.

RNF propios:

- **TR-RNF-019**: 0 violaciones `critical` o `serious` de axe-core en los dos temas, incluido contraste 4.5:1 en texto y chips.
- **TR-RNF-018**: los dos temas en 360, 768 y 1280 px; textos en español de Perú.
- **TR-RNF-023**: se verifica en Chromium. `light-dark()` exige Chrome 123, Firefox 120 y Safari 17.5 o posteriores; la matriz completa es del spec 27.

RNF heredados: 024/119 (límites Nx), 025 (cobertura >= 70 % en `shared-ui` y `shared-shell`), 026.

Historias del backlog: ninguna. Estimado: 6 h.

## Alcance

**In:**

- **Preferencia y tema efectivo**:
  - La preferencia es `sistema`, `claro` u `oscuro`. Por defecto, `sistema`.
  - Se guarda en `localStorage` con la clave `vitrina.tema`, por app y por dispositivo.
  - El tema efectivo es `claro` u `oscuro`. Con `sistema` sale de `prefers-color-scheme` y cambia en vivo si el usuario cambia el sistema.
- **Atributo en `<html>`**: `data-tema="claro"` o `data-tema="oscuro"` siempre con el tema efectivo. Fija `color-scheme`, que mueve Material y los tokens con `light-dark()`, y activa la variante `dark:` de Tailwind.
- **Script anti-parpadeo** en el `<head>` de `index.html` de las dos apps: lee `vitrina.tema` y `prefers-color-scheme`, y fija `data-tema` antes del primer pintado. Si `localStorage` falla, usa el sistema.
- **Tema Material** (`material.scss`):
  - `theme-type: color-scheme` en la paleta del 15b.
  - `color-scheme` por `data-tema`.
  - `mat.theme-overrides` con `light-dark()` para fijar superficies, textos y bordes en los valores del canvas.
- **Tokens** (`tema.css`):
  - Los tokens fijos del 15b pasan a `light-dark(claro, oscuro)`.
  - Se suma `--color-borde-lateral` (transparente en claro y `#1E2926` en oscuro).
  - `@custom-variant dark` sobre `data-tema`.
- **Selector en el menú de usuario** (`vit-menu-usuario`): bajo el correo, «Tema» con tres opciones del menú (`mat-menu-item` con `role="menuitemradio"` y `aria-checked`): Sistema, Claro y Oscuro, con iconos `contrast`, `light_mode` y `dark_mode`, y una marca en la elegida. Marca la preferencia, no el tema efectivo.
- **Componentes del shell, del 15b y del 15d en oscuro**:
  - Menú lateral y franja de iconos sin cambio de color, más el borde lateral en oscuro.
  - Barra superior, tablas, chips, marco de auth, buscador del menú y avisos de SweetAlert: con los tokens.
  - La ilustración `vitrina.svg` no cambia.
- **Verificación** con el MCP `playwright` en las dos apps y en los dos temas.

**Out of scope (for future specs):**

- Preferencia de tema guardada en la API o compartida entre apps.
- Selector de tema en las páginas `/auth`: siguen la preferencia guardada o el sistema.
- Tema de alto contraste (`prefers-contrast: more`).
- Temas por tenant y marca propia de SazónPOS.
- Revisión de las pantallas de los specs 16b, 17c y posteriores más allá de que usen los tokens: lo que tenga colores escritos a mano se corrige en su spec o en el 15e.

## Base de código reutilizada

- `aplicar-tema()` de `material.scss`: se conserva su firma y la paleta del 15b. Cambia `color-scheme: light` por la regla según `data-tema`, y se agregan `theme-type` y los overrides.
- `tema.css`: se conservan todos los nombres de token. Cambian los valores fijos a `light-dark()`.
- `sweetalert.css`: sin cambios.
- `vit-menu-usuario`: se conservan el correo, «Salir» y `VolverAService`. Se suma el selector.
- `PreferenciaMenuService` del 15d: mismo patrón (signal más `localStorage` con try/catch) para `TemaService`.

## Modelo de datos

No hay tablas, migraciones, eventos ni endpoints nuevos.

### Preferencia (`libs/shared/ui/src/lib/models/tema.ts` y `services/tema.service.ts`)

```ts
export type PreferenciaTema = 'sistema' | 'claro' | 'oscuro';
export type TemaEfectivo = 'claro' | 'oscuro';
export const CLAVE_TEMA = 'vitrina.tema';
export const ATRIBUTO_TEMA = 'data-tema';
export const CONSULTA_OSCURO = '(prefers-color-scheme: dark)';

@Injectable({ providedIn: 'root' })
export class TemaService {
  readonly preferencia: Signal<PreferenciaTema>;   // de localStorage; 'sistema' si no hay valor válido o falla
  readonly efectivo: Signal<TemaEfectivo>;         // preferencia, o el sistema si es 'sistema'
  elegir(preferencia: PreferenciaTema): void;      // guarda (try/catch) y aplica
}
```

- Un `effect` escribe `data-tema` en `document.documentElement` cada vez que cambia `efectivo`.
- Con `sistema`, escucha `matchMedia(CONSULTA_OSCURO)` y deja de escuchar al elegir otra opción.
- Un valor guardado que no sea uno de los tres se trata como `sistema`.

### Script anti-parpadeo (`index.html`, en `<head>`, antes de los estilos)

Unas cinco líneas que repiten la regla de `TemaService`: leen `vitrina.tema` dentro de try/catch y fijan `data-tema`. Va igual en las dos apps. Una prueba de cada app compara el script con las constantes `CLAVE_TEMA` y `ATRIBUTO_TEMA` para que no se desincronicen.

### CSS

```css
/* material.scss, dentro de aplicar-tema() */
color-scheme: light;
&[data-tema='oscuro'] { color-scheme: dark; }

/* tema.css */
@custom-variant dark (&:where([data-tema=oscuro], [data-tema=oscuro] *));
```

La sintaxis exacta de `theme-type`, `theme-overrides` y `@custom-variant` se confirma con ctx7 al implementar.

### Valores (del canvas)

| Token | Claro | Oscuro |
| --- | --- | --- |
| `surface` (fondo) | `#F5F7F6` | `#0F1513` |
| `surface-container-lowest` (tarjetas) | `#FFFFFF` | `#161D1B` |
| `surface-container-high` (encabezado de tabla, menús) | `#F0F4F2` | `#1C2422` |
| `on-surface` | `#14201D` | `#DCE5E1` |
| `on-surface-variant` | `#4A5853` | `#A3B3AD` |
| `outline-variant` (bordes) | `#DCE3E0` | `#2A3532` |
| `outline` (campos) | `#73807B` | `#6F7D78` |
| Líneas de tabla (encabezado y celdas) | `outline-variant` | `outline-variant` |
| `--color-fila-resaltada` | `#EEF6F3` | `#1E2A27` |
| `--color-chip-exito` / sobre | `#D8F3EA` / `#0B4D40` | `#1E3A32` / `#9EE6CC` |
| `--color-chip-advertencia` / sobre | `#FCEFD2` / `#5E4100` | `#3A2E12` / `#F2D08A` |
| `--color-chip-info` / sobre | `#DDEBF7` / `#173F5F` | `#1D2E3D` / `#A9CBEA` |
| `--color-chip-neutro` / sobre | `#E6EAE8` / `#37423F` | `#262E2C` / `#C2CCC8` |
| `--color-borde-lateral` | `transparent` | `#1E2926` |

- `primary`, `on-primary`, `error` y `on-error` quedan como los genera M3 para la paleta del 15b. El canvas usa `#7DD8BE` / `#00382D` y `#FFB4AB` / `#690005` como referencia del tono 80.
- Noche, menta y menta suave no cambian.

### Textos (`mensajes-shell.ts`, se agregan)

`tema: 'Tema'`, `temaSistema: 'Sistema'`, `temaClaro: 'Claro'`, `temaOscuro: 'Oscuro'`.

## Plan de implementación

1. **Servicio.** `PreferenciaTema`, constantes y `TemaService` con pruebas:
   - sin valor;
   - valor guardado;
   - valor inválido;
   - `localStorage` que lanza error;
   - cambio del sistema con `sistema` y sin `sistema`;
   - atributo en `<html>`.

   Exportar desde `@vitrina/shared/ui`. Verificar: `nx test shared-ui`.
2. **Script anti-parpadeo.** En `index.html` de las dos apps, con su prueba de sincronía. Verificar: con `vitrina.tema = oscuro`, recargar no muestra un cuadro claro (Playwright con red lenta).
3. **Material.** `theme-type: color-scheme`, `color-scheme` por `data-tema` y `theme-overrides` con los valores de la tabla. Verificar en `/dev/componentes` con `data-tema` cambiado a mano.
4. **Tokens.** Valores fijos a `light-dark()`, `--color-borde-lateral` y `@custom-variant dark`. Verificar `nx build` de las dos apps.
5. **Selector.** Opciones `menuitemradio` en `vit-menu-usuario` y textos. Pruebas: marca la preferencia y llama a `elegir`.
6. **Repaso de colores escritos a mano.** Buscar hex y `bg-white`/`text-black` en `shared/ui`, `shared/shell`, `auth-ui`, `admin-cliente` y `consola-tenants`. Reemplazar los de este alcance por tokens y listar en el cierre los que queden para su spec.
7. **Verificación en navegador.**
   - Playwright en las dos apps, con `emulate_media` claro y oscuro, a 360, 768 y 1280 px.
   - Páginas: `/auth/ingresar`, `/auth/mfa`, usuarios (lista, detalle, invitar), tenants (lista, detalle), una confirmación de SweetAlert, el menú oculto y la búsqueda del 15d.
   - axe en los dos temas, consola sin errores y capturas comparadas con el canvas.

   Pasar `code-simplifier:code-simplifier` sobre los archivos modificados.

## Criterios de aceptación

- [ ] `nx affected -t lint test build` en verde; cobertura >= 70 % en `shared-ui` y `shared-shell`.
- [ ] Sin `vitrina.tema` guardado, la app sigue al sistema. Con el sistema en oscuro, `<html>` tiene `data-tema="oscuro"`.
- [ ] Con la preferencia en Sistema, cambiar el sistema de claro a oscuro cambia la app sin recargar.
- [ ] Elegir Oscuro en el menú de usuario cambia la app al instante y guarda `vitrina.tema = oscuro`. Recargar mantiene el oscuro aunque el sistema esté en claro.
- [ ] Elegir Claro con el sistema en oscuro deja la app en claro y lo mantiene al recargar.
- [ ] Al recargar con `vitrina.tema = oscuro`, el primer cuadro pintado ya es oscuro (captura con red lenta en Playwright).
- [ ] Con `localStorage` bloqueado, la app sigue al sistema, el selector cambia el tema en la sesión y no hay errores en consola.
- [ ] Un valor guardado inválido (`"azul"`) se trata como Sistema.
- [ ] Las páginas `/auth` siguen la preferencia guardada o el sistema, sin selector.
- [ ] El selector muestra Sistema, Claro y Oscuro con sus iconos. La opción marcada es la preferencia guardada y tiene `aria-pressed` o `aria-checked` en verdadero.
- [ ] En oscuro, el fondo de las páginas es `#0F1513`, las tarjetas `#161D1B` y el texto principal `#DCE5E1`.
- [ ] Ninguna pantalla del alcance muestra un fondo blanco ni texto negro.
- [ ] En oscuro, los chips de usuarios y tenants usan los valores oscuros de la tabla, y la fila resaltada al pasar el mouse es `#1E2A27`.
- [ ] Los avisos de SweetAlert (información, confirmación y destructiva) se ven con fondo oscuro y botón destructivo en el color de error de M3.
- [ ] La ilustración de la vitrina y el menú lateral se ven igual en los dos temas, y en oscuro el menú lateral tiene borde derecho.
- [ ] axe-core: 0 violaciones `critical` o `serious` en las páginas del paso 7, en los dos temas y en las dos apps.
- [ ] El script anti-parpadeo y `TemaService` usan la misma clave y el mismo atributo (prueba de sincronía).
- [ ] El código nuevo sigue la sección «Código limpio» de `CLAUDE.md` y la estructura de libs Angular.

## Decisiones

- **Sí:** Sistema por defecto (decisión del usuario). Respeta lo que la persona ya eligió en su equipo.
- **Sí:** `localStorage`, clave `vitrina.tema`, por app y por dispositivo (decisión del usuario).
- **No:** preferencia en la API. Pide endpoint y columna en SEG para una comodidad local.
- **No:** cookie compartida en el dominio padre. Depende de la configuración de subdominios y no funciona en local con `127.0.0.1`.
- **Sí:** `/auth` sigue la preferencia, sin selector propio (decisión del usuario).
- **Sí:** `data-tema` siempre con el tema efectivo, no con la preferencia. Así una sola regla mueve Material, `light-dark()` y la variante `dark:` de Tailwind, también cuando la preferencia es Sistema.
- **No:** `dark:` de Tailwind con su valor por defecto (`prefers-color-scheme`). No respeta la elección manual.
- **Sí:** `light-dark()` en los tokens en lugar de duplicar reglas bajo `[data-tema=oscuro]`. Un token, un lugar, y el mismo mecanismo que usa Material 3.
- **Sí:** fijar con `theme-overrides` las superficies, textos y bordes del canvas, y dejar `primary` y `error` como los genera M3. Las superficies son las que más pesan en la fatiga visual. Los colores de acción ya salen bien de la paleta.
- **Sí:** fondos en `#0F1513` y texto en `#DCE5E1`, sin negro ni blanco puros, con un contraste de unos 13:1. Leen cómodo y cumplen 4.5:1 sin encandilar.
- **Sí:** script en línea en `index.html` para evitar el parpadeo. No hay CSP que lo impida. Si se agrega una, este script necesita su hash.
- **Sí:** el selector usa `mat-menu-item` con `role="menuitemradio"`, no `mat-button-toggle-group` (cambio durante la implementación). Dentro de `mat-menu`, las flechas solo recorren los `mat-menu-item` y `Tab` cierra el menú: el grupo de botones no se alcanzaba con teclado (WCAG 2.1.1).
- **Sí:** menú lateral y vitrina sin cambios en oscuro. Ya son oscuros; solo se agrega un borde para separarlos del contenido.

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| Navegadores sin `light-dark()` (Safari < 17.5) | Fuera de la matriz de RNF-023. En ellos los tokens fijos quedan sin valor; el spec 27 decide si hace falta un respaldo |
| Una futura CSP bloquea el script en línea | Documentarlo en el spec de CSP: necesita su hash o `nonce` |
| Pantallas de otros specs con colores escritos a mano se ven claras dentro del oscuro | El paso 6 los busca y los lista; los que no entran aquí van a su spec o al 15e |
| `theme-overrides` y los valores que genera M3 quedan con poco contraste entre sí | axe en los dos temas como criterio de aceptación y ajuste en la tabla de valores |
| El script y `TemaService` se desincronizan | Prueba de sincronía de clave y atributo |

## Lo que **no** está en este spec

- Preferencia en la API o compartida entre apps.
- Selector en `/auth`.
- Alto contraste.
- Temas por tenant o por producto.
- Pasar a tokens los colores escritos a mano fuera del alcance.

Cada uno, si llega, va en su propio spec.
