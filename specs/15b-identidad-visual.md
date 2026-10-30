# SPEC 15b — Identidad visual: tema esmeralda, shell oscuro, marco de autenticación, chips de estado y tabla móvil

> **Status:** Draft
> **Depends on:** SPEC 14, SPEC 15, SPEC 16a, SPEC 17b, SPEC 17c
> **Date:** 2026-10-30
> **Objective:** Aplicar la identidad visual aprobada en el canvas (tema Material esmeralda con Roboto, menú lateral oscuro, marco con la ilustración de la vitrina en las páginas `/auth`, chips de estado y `vit-tabla` como lista en celular) sobre `shared/ui`, `shared/shell` y `shared/auth-ui`, y adoptarla en usuarios (16a) y tenants (17b).

## Por qué existe este spec

No tiene fila previa en `docs/roadmap-specs.md`: nace de una revisión de diseño posterior al spec 15. Este spec agrega la fila 15b.

Referencia visual: canvas «Vitrina · Diseño UI» (https://claude.ai/artifact/UGvcmiWUiBsMuWerqMiWxh), páginas «Auth» y «Pantallas tipo». Cuando el canvas y este spec choquen, manda este spec.

Hallazgos que cambian lo que muestra el canvas:

- `GET /v1/seg/mi-contexto` no trae el nombre del tenant ni el del usuario. El menú lateral muestra el nombre de la app en lugar del tenant y el menú de usuario muestra la inicial del correo en lugar de las iniciales del nombre (decisión del usuario).
- Ninguna app fija `nombreApp` en los datos de ruta: las dos muestran «Plataforma» (`MENSAJES_SHELL.nombreAppPorDefecto`). Este spec lo fija en cada app.
- `vit-tabla` solo pinta texto en las celdas. Los chips y la lista móvil necesitan dos campos nuevos en `ColumnaTabla`.
- El estado se muestra hoy con `bg-contenedor-secundario` igual para todos los valores (`usuario-detalle`, `tenant-detalle`, `rol-detalle`).

RF cubiertos: ninguno nuevo. Es presentación sobre pantallas existentes.

RNF propios:

- **TR-RNF-018**: responsiva en 360, 768 y 1280 px; textos en español de Perú.
- **TR-RNF-019**: 0 violaciones `critical` o `serious` de axe-core en las páginas `/auth`, en usuarios (lista y detalle) y en tenants (lista y detalle). Incluye contraste 4.5:1 en los chips y en el menú oscuro.
- **TR-RNF-021**: las acciones destructivas se distinguen por color, además de la confirmación que ya existe.
- **TR-RNF-023**: se verifica en Chromium.

RNF heredados: 024/119 (límites Nx), 025 (cobertura >= 70 % en `shared-ui`, `shared-shell` y `shared-auth-ui`), 026.

Historias del backlog: ninguna. Estimado: 9 h.

Se implementa después de que el 17c esté Implementado: los dos tocan `libs/plataforma/admin-cliente` (decisión del usuario).

## Alcance

**In:**

- **Tema (`libs/shared/ui/src/estilos`)**:
  - Paleta M3 generada desde `#0B6E5B` en `_paleta-vitrina.scss`, que reemplaza a `mat.$azure-palette` en `material.scss`. Tipografía Roboto sin cambios.
  - Campos de formulario (`mat-form-field` con input, select, fecha y búsqueda) con densidad −4: 40 px de alto, como los botones. Se aplica con el mixin de densidad del form-field en `material.scss`, sin tocar la densidad 0 del resto del tema. El campo del código MFA queda en 48 px.
  - Tokens nuevos en `tema.css`: noche, sobre-noche, menta, menta-suave y los cuatro tonos de chip.
  - `destructivo.css`: clase `vit-destructivo` para `mat-button` y `mat-stroked-button` con `--mat-sys-error`.
  - `sweetalert.css` no cambia: ya toma los colores de `--mat-sys-*`.
- **Componentes de `shared/ui`**:
  - `components/chip-estado`: `vit-chip-estado`.
  - `models/tono-estado.ts`.
  - `ColumnaTabla` suma `tono` y `movil`.
  - `vit-tabla` pinta chips en las columnas con `tono` y, por debajo de 600 px, una lista en lugar de la tabla.
  - Tablas compactas: filas de 40 px, encabezado de texto a 13 px, líneas verticales entre columnas (`--color-borde`), resaltado de la fila al pasar el mouse con transición de 120 ms (sin transición con `prefers-reduced-motion`) y botones de acción de la fila a 32 px. Se aplica a `vit-tabla` y a las tablas `mat-table` de los detalles de usuario y tenant.
- **Shell (`libs/shared/shell`)**:
  - Menú lateral en noche, con la marca «Vitrina» y el nombre de la app arriba, y la opción activa en una cápsula menta.
  - Barra superior blanca en escritorio y noche en celular, con «Vitrina».
  - Menú de usuario con la inicial del correo en un círculo.
- **Apps**:
  - `nombreApp` en los datos de ruta del shell: «Administración» en `plataforma-admin` y «Consola de plataforma» en `plataforma-consola`.
  - `destructivo.css` en `styles` de las dos apps.
  - El asset `vitrina.svg` en `assets` de las dos apps.
- **Auth (`libs/shared/auth-ui`)**:
  - `components/marco-auth`: `vit-marco-auth`, con el panel de la vitrina a la izquierda (arriba en celular) y el contenido proyectado.
  - Las 6 páginas `/auth` usan el marco y no cambian su lógica.
  - `vitrina.svg` en `src/assets/`.
- **Adopción**:
  - `usuarios-lista`: chip de estado y columnas móviles.
  - `usuario-detalle`: chip de membresía, chip en la columna de estado de las asignaciones, y `vit-destructivo` en Finalizar y Revocar.
  - `tenants-lista`: chip y columnas móviles.
  - `tenant-detalle`: chip, y `vit-destructivo` en los destinos SUSPENDIDO y BAJA.
- **Verificación** con el MCP `playwright` en las dos apps contra Supabase dev y la API local.

**Out of scope (for future specs):**

- Nombre del tenant y nombre del usuario en `mi-contexto`: cambio de API, spec propio.
- Modo oscuro.
- Marca por tenant (logo y colores propios): sigue fuera desde el spec 15.
- Selector de alcance como botones segmentados (canvas, «Formulario»): `vit-selector-alcance` queda como está.
- Chips y botones destructivos en roles (`rol-detalle`, 16b) y en las pantallas del 17c: se adoptan cuando esos specs se revisen.
- Páginas de diseño por spec (16a completo, 16b, 17c) en el canvas.
- Ilustración fotorrealista o hecha con IA: se usa el SVG del canvas.
- Identidad propia de SazónPOS (spec 26).

## Base de código reutilizada

- `libs/shared/ui/src/estilos/material.scss`: se conserva el mixin `aplicar-tema()` y su firma. Cambia la paleta.
- `tema.css`: se conservan todos los tokens existentes y se agregan los nuevos.
- `vit-tabla`: se conservan entradas, salidas, paginador, orden, carga y estado vacío. Las columnas sin `tono` ni `movil` se pintan igual que hoy.
- `vit-layout`, `vit-menu-lateral`, `vit-menu-usuario`: se conserva la lógica (árbol, expandir, `routerLinkActive`, `salir()`, `VolverAService`). Cambian plantilla y estilos.
- Las 6 páginas de `auth-ui`: se conservan formularios, mensajes y navegación. Se quita su `<main class="mx-auto … max-w-sm">` y su contenido pasa a `vit-marco-auth`.
- `vitrina.svg`: el asset del canvas (`/_blob/52f0d50230ea5094dfbbfe3dd127ffe0`), copiado tal cual.

## Modelo de datos

No hay tablas, migraciones, eventos ni endpoints nuevos.

### Tokens (`tema.css`, se agregan)

```css
@theme {
  --color-noche: #071A17;            /* menú lateral, panel de la vitrina */
  --color-sobre-noche: #C9DCD6;      /* texto e iconos sobre noche */
  --color-menta: #5EE2C0;            /* icono activo, brillos; solo sobre noche */
  --color-menta-suave: #A8E9D7;      /* texto secundario sobre noche */
  --color-chip-exito: #D8F3EA;       --color-sobre-chip-exito: #0B4D40;
  --color-chip-advertencia: #FCEFD2; --color-sobre-chip-advertencia: #5E4100;
  --color-chip-info: #DDEBF7;        --color-sobre-chip-info: #173F5F;
  --color-chip-neutro: #E6EAE8;      --color-sobre-chip-neutro: #37423F;
}
```

El tono `error` del chip usa `--mat-sys-error-container` y `--mat-sys-on-error-container`. La cápsula activa del menú es menta al 16 % sobre noche.

### Chip y columnas (`shared/ui`)

```ts
// models/tono-estado.ts
export type TonoEstado = 'exito' | 'advertencia' | 'info' | 'neutro' | 'error';

// models/columna-tabla.ts (agregados)
export type RolMovil = 'titulo' | 'detalle' | 'estado';
export interface ColumnaTabla<Fila> {
  clave: keyof Fila & string;
  titulo: string;
  ordenable?: boolean;
  tono?: (fila: Fila) => TonoEstado;   // con tono, la celda es un vit-chip-estado
  movil?: RolMovil;                     // sin movil, la columna no aparece en celular
}
```

`vit-chip-estado`: entradas `texto: string` (requerida) y `tono: TonoEstado` (por defecto `neutro`). Es un `<span>` con el texto; el color no es la única señal porque el texto siempre está.

### `vit-tabla` en celular

- Corte: `BREAKPOINT_MOVIL = '(max-width: 599.98px)'` con `BreakpointObserver` del CDK.
- Debajo del corte pinta una `<ul>` con una `<li>` por fila:
  - Fila de arriba: la columna `titulo` y el chip de la columna `estado`.
  - Debajo: las columnas `detalle`, en una línea cada una, cortadas con elipsis.
  - A la derecha: la plantilla `vitAccionesFila`, si la hay.
- Paginador, carga y estado vacío, igual que en escritorio. El orden no se ofrece en celular.

### Tonos por estado

| Pantalla | Valor | Tono |
| --- | --- | --- |
| Membresía | ACTIVO | exito |
| Membresía | INVITADO | advertencia |
| Membresía | SUSPENDIDO, FINALIZADO | neutro |
| Asignación | VIGENTE | exito |
| Asignación | FUTURA | info |
| Asignación | VENCIDA, REVOCADA | neutro |
| Tenant | ACTIVO | exito |
| Tenant | PRUEBA | info |
| Tenant | SUSPENDIDO | advertencia |
| Tenant | BAJA | neutro |

Cada feature guarda su mapa (`TONOS_ESTADO_MEMBRESIA`, `TONOS_ESTADO_ASIGNACION`, `TONOS_ESTADO_TENANT`) junto a sus etiquetas. Las filas suman `tonoEstado: TonoEstado`, calculado en el mismo mapeo que hoy pone la etiqueta.

### Columnas móviles

| Lista | titulo | detalle | estado |
| --- | --- | --- | --- |
| Usuarios | nombre | correo | estado |
| Tenants | nombre (razón social) | la columna de identificación que ya muestra la lista | estado |

### Shell

- `vit-menu-lateral` suma arriba un bloque de marca: «Vitrina» y `nombreApp`. `nombreApp` pasa del layout al menú lateral como entrada.
- Escritorio: barra blanca con borde inferior y, a la derecha, el selector de sucursal y el menú de usuario.
- Celular: barra noche con el botón de menú, «Vitrina», el selector de sucursal y el menú de usuario.
- Los colores de `mat-sidenav`, `mat-nav-list` y `mat-toolbar` se fijan con los mixins de overrides de Material en `material.scss`, no con selectores sobre clases internas. Los nombres exactos de los tokens se confirman con ctx7.
- `vit-menu-usuario`: el botón muestra la primera letra del correo, en mayúscula, en un círculo `chip-exito`. Su `aria-label` sigue siendo `mensajes.menuUsuario`. Sin correo, el ícono `account_circle` de hoy.

### Marco de autenticación (`auth-ui`)

```html
<vit-marco-auth [destacado]="tenantNombre()">  <!-- destacado: solo invitación -->
  … contenido actual de la página …
</vit-marco-auth>
```

- Escritorio (>= 960 px): grilla 7fr / 5fr.
  - Izquierda: panel noche con `vitrina.svg` en `object-fit: cover`, «Vitrina» y «Administración de su negocio» arriba, y, si hay `destacado`, «Invitación de» y el nombre abajo.
  - Derecha: el contenido, con 360 px de ancho máximo, centrado en vertical y alineado a la izquierda.
- Por debajo: franja noche de 168 px arriba con la ilustración recortada y la marca, y el contenido debajo con 16 px de margen lateral.
- El panel es decorativo: `alt=""` y `aria-hidden="true"`. El `<main>` de cada página queda dentro del marco.
- `vitrina.svg` se sirve desde `assets/auth-ui/vitrina.svg`: entrada `{ glob: 'vitrina.svg', input: 'libs/shared/auth-ui/src/assets', output: 'assets/auth-ui' }` en `project.json` de las dos apps.

## Plan de implementación

1. **Paleta y tokens.** Generar la paleta desde `#0B6E5B` con el schematic de Material (comando y salida confirmados con ctx7) en `_paleta-vitrina.scss`. Usarla en `material.scss`. Agregar los tokens a `tema.css`. Verificar: `nx build plataforma-admin` y `nx build plataforma-consola`; en `nx serve`, `--mat-sys-primary` vale `#0B6E5B` o el tono más cercano (ver riesgos).
2. **Destructivo.** `destructivo.css` con `vit-destructivo` y su registro en `styles` de las dos apps. Verificar en la página `/dev/componentes`.
3. **Chip.** `TonoEstado`, `vit-chip-estado` con pruebas (texto y clase por tono), exportados desde `index.ts`. Sumarlo a `/dev/componentes`.
4. **Tabla: chips.** `tono` en `ColumnaTabla` y la celda con `vit-chip-estado`. Prueba: una columna con `tono` pinta el chip y una sin `tono` pinta texto.
5. **Tabla: celular.** `movil` en `ColumnaTabla` y la lista bajo el corte. Pruebas con `BreakpointObserver` simulado: titulo, detalle, estado y acciones en su lugar, y columnas sin `movil` ausentes.
6. **Shell.** Overrides de sidenav, lista y toolbar. Bloque de marca en `vit-menu-lateral`, barra según el ancho en `vit-layout` e inicial en `vit-menu-usuario`. `nombreApp` en `app.routes.ts` de las dos apps. Actualizar pruebas del layout, el menú lateral y el menú de usuario.
7. **Marco de auth.** `vitrina.svg` en `auth-ui/src/assets`, asset en las dos apps, `vit-marco-auth` con pruebas (proyección y `destacado`). Envolver las 6 páginas. Las pruebas existentes de las páginas siguen verdes sin cambios de lógica.
8. **Adopción en usuarios.** Tonos de membresía y asignación, `tonoEstado` en las filas, `tono` y `movil` en las columnas de `usuarios-lista`, chips y `vit-destructivo` en `usuario-detalle`. Pruebas de los mapas de tono.
9. **Adopción en tenants.** Tonos de tenant, `tono` y `movil` en `tenants-lista`, chip y `vit-destructivo` (SUSPENDIDO, BAJA) en `tenant-detalle`.
10. **Verificación en navegador.**
    - Playwright en las dos apps, a 360, 768 y 1280 px: `/auth/ingresar`, `/auth/mfa`, `/auth/invitacion`, usuarios (lista y detalle) y tenants (lista y detalle).
    - axe-core y consola sin errores.
    - Capturas comparadas a ojo con el canvas.
    - Pasar `code-simplifier:code-simplifier` sobre los archivos modificados.

## Criterios de aceptación

- [ ] `nx affected -t lint test build` en verde.
- [ ] Cobertura >= 70 % en `shared-ui`, `shared-shell` y `shared-auth-ui`.
- [ ] `material.scss` no referencia `mat.$azure-palette`; el botón principal de `/auth/ingresar` se ve esmeralda en las dos apps.
- [ ] Los campos de texto, select, fecha y búsqueda miden 40 px de alto en `/auth/ingresar`, en invitar usuario y en los filtros de las listas; la etiqueta flotante y los mensajes de error se siguen viendo.
- [ ] En escritorio, el menú lateral tiene fondo `#071A17`, muestra «Vitrina» y el `nombreApp` de la app, y la opción activa tiene `aria-current="page"` y la cápsula menta.
- [ ] `plataforma-admin` muestra «Administración» y `plataforma-consola` «Consola de plataforma» debajo de «Vitrina».
- [ ] A 360 px, la barra superior es noche, muestra «Vitrina» y el botón de menú abre el menú lateral.
- [ ] El menú de usuario muestra la primera letra del correo en mayúscula; su nombre accesible sigue siendo el de hoy.
- [ ] Las 6 páginas `/auth` muestran la vitrina a la izquierda a 1280 px y arriba a 360 px, sin scroll horizontal.
- [ ] `/auth/invitacion` con una invitación vigente muestra el nombre de la empresa en el panel.
- [ ] La ilustración no se anuncia en el árbol de accesibilidad.
- [ ] En usuarios, ACTIVO se ve como chip `exito`, INVITADO como `advertencia` y SUSPENDIDO como `neutro`, en la lista y en el detalle.
- [ ] En tenants, ACTIVO, PRUEBA, SUSPENDIDO y BAJA usan el tono de la tabla de tonos, en la lista y en el detalle.
- [ ] A 360 px, las listas de usuarios y tenants se ven como lista con título, detalle, chip y acción; sin tabla ni scroll horizontal.
- [ ] Una columna sin `tono` ni `movil` pinta su valor como texto, sin chip (prueba de `vit-tabla`).
- [ ] En escritorio, las filas de usuarios, tenants y asignaciones miden 40 px, con líneas verticales entre columnas, y la fila cambia de fondo al pasar el mouse; con `prefers-reduced-motion` el cambio es inmediato.
- [ ] Finalizar y Revocar (usuarios), y Suspender y Dar de baja (tenants), se ven en el color de error y siguen pidiendo confirmación.
- [ ] axe-core: 0 violaciones `critical` o `serious` en las páginas listadas en el paso 10, en las dos apps.
- [ ] Consola del navegador sin errores en esas páginas.
- [ ] El código nuevo sigue la sección «Código limpio» de `CLAUDE.md` y la estructura de libs Angular (un artefacto por archivo, `templateUrl` y `styleUrl`, sin `.css` vacíos).

## Decisiones

- **Sí:** nombre de la app bajo la marca, no el del tenant. `mi-contexto` no trae el tenant y cambiar la API es otro spec (decisión del usuario).
- **Sí:** inicial del correo en el menú de usuario. Es el único dato que tiene el front (decisión del usuario).
- **No:** iniciales calculadas desde la parte local del correo (`ana.torres` → AT). Adivina y falla con correos genéricos.
- **Sí:** `tono` y `movil` como campos de `ColumnaTabla` (decisión del usuario). Cada pantalla declara su fila móvil en datos, sin plantilla propia.
- **No:** `ng-template` por pantalla para la fila móvil. Repite marcado en cada lista.
- **No:** dejar el scroll horizontal en celular. El canvas pide lista.
- **Sí:** adoptar chips en usuarios y tenants, que están cerrados. Las pantallas del 17c y de roles los adoptan después (decisión del usuario).
- **Sí:** `vit-destructivo` como clase global en `shared/ui` (decisión del usuario). Material 3 no tiene color de error para botones.
- **No:** el atributo `color="warn"`. En M3 solo funciona con la compatibilidad de variantes de color, que la plataforma no activa.
- **Sí:** colores del shell con mixins de overrides de Material. Sobrevive a cambios de clases internas.
- **Sí:** Roboto. Es la tipografía de Material y la eligió el usuario frente a Archivo.
- **Sí:** campos de formulario a 40 px (densidad −4), pedido del usuario. Iguala la altura de campos y botones.
- **No:** densidad −4 en todo el tema. Achicaría también listas y menús, que no se pidieron.
- **Sí:** tablas compactas de 40 px con líneas verticales y resaltado al pasar el mouse, pedido del usuario. Se fijan con `mat.table-overrides` y CSS propio de `vit-tabla`, no con la densidad global.
- **Sí:** ilustración SVG propia. Pesa unos 5 KB y no depende de imágenes de terceros.
- **Sí:** implementar después de cerrar el 17c (decisión del usuario).
- **Sí:** fila 15b en `docs/roadmap-specs.md` (decisión del usuario).

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| La paleta generada pone en `--mat-sys-primary` un tono distinto de `#0B6E5B` | Comparar en el paso 1. Si difiere, fijar `primary` con `mat.theme-overrides` en `material.scss` |
| El menú oscuro hereda colores de texto de M3 con contraste bajo | Fijar color de texto, ícono y cápsula en los overrides de lista y comprobarlo con axe |
| Las capturas de Playwright del 17c quedan con el tema viejo | Este spec corre después del 17c y sus capturas reemplazan a las anteriores |
| Las pruebas de páginas `/auth` dependen del `<main>` que se mueve al marco | Buscar por rol y texto, no por clases; ajustar solo selectores |
| El SVG no carga por la ruta del asset | Criterio de aceptación visual en las dos apps y revisión de la red en Playwright |

## Lo que **no** está en este spec

- Nombre del tenant y del usuario en `mi-contexto`.
- Modo oscuro y marca por tenant.
- Selector de alcance segmentado.
- Chips y botones destructivos en roles y en las pantallas del 17c.
- Páginas de diseño por spec en el canvas.
- Identidad de SazónPOS.

Cada uno, si llega, va en su propio spec.
