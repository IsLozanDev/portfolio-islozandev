# SPEC 15e — Diseño UI: secciones plegables en `shared/ui` para páginas con muchas tarjetas

> **Status:** Aprobado
> **Depends on:** SPEC 15, SPEC 15b, SPEC 15c, SPEC 38
> **Date:** 2026-11-25
> **Objective:** Agregar a `shared/ui` los componentes `vit-grupo-plegable` y `vit-seccion-plegable`, que dejan contraer y expandir cada tarjeta de una página con un resumen visible, animación y teclado, y aplicarlos a la ficha de persona como primer consumidor, con la regla en `CLAUDE.md` de usarlos en toda página con tres o más secciones.

## Por qué existe este spec

Revisión de diseño pedida por el usuario el 2026-11-25, al ver el canvas del spec 62. No viene de una historia del plan. Las páginas con varias tarjetas apiladas obligan a desplazarse mucho; la más larga hoy es la ficha de persona, con seis secciones, y la siguiente será la página del emisor electrónico (spec 62), con cuatro. Hace falta un patrón único y transversal, no uno distinto por feature.

Estimado: 4-5 h (1 h de canvas, 2 h del componente y 1,5 h de la ficha de persona). Si se pasa de 10 h, la ficha de persona pasa a un 15f y este spec cierra con el componente y la regla.

Lo que hay en el código hoy (revisado al redactar):

- `shared/ui` tiene `acciones-formulario`, `cargando`, `chip-estado`, `estado-vacio`, `filtros`, `panel-lateral` y `tabla`. No hay nada plegable.
- `@angular/cdk` `~21.2.14` está instalado. `CdkAccordion` y `CdkAccordionItem` resuelven el estado, el modo de una o varias abiertas y los ids, sin imponer estilos.
- Tokens en `libs/shared/ui/src/estilos/tema.css`: `--color-superficie`, `--color-superficie-contenedor`, `--color-borde`, `--color-sobre-superficie`, `--color-sobre-superficie-variante`, `--color-primario`, los `--color-chip-*` y los `--color-sobre-chip-*`.
- `persona-detalle.page.html` apila `vit-persona-datos-basicos`, la sección de duplicados, `vit-persona-contactos`, `vit-persona-direcciones`, `vit-persona-roles` y `vit-persona-consentimientos`.

## Alcance

**Entra:**

- `vit-seccion-plegable` (`shared/ui`):
  - cabecera como botón, con ranuras de entrada (número de paso o ícono), título, resumen y fin (chip o acción);
  - galón que gira y contenido con animación de altura;
  - `expandida` como `model()` y estado `deshabilitada`.
- `vit-grupo-plegable` (`shared/ui`), sobre `CdkAccordion`: varias abiertas a la vez por defecto (`multiple`) y controles «Expandir todo» y «Contraer todo» desde tres secciones.
- Accesibilidad:
  - `aria-expanded` y `aria-controls` en la cabecera y `role="region"` con `aria-labelledby` en el contenido;
  - el contenido contraído queda `inert`, así que el foco no entra en él;
  - Enter y Espacio pliegan y despliegan;
  - foco visible con el token primario.
- El contenido contraído sigue en el DOM: un formulario a medio llenar no pierde lo escrito al contraerse.
- Movimiento: 200 ms con `grid-template-rows: 0fr → 1fr`; sin animación con `prefers-reduced-motion`.
- Primer consumidor: la ficha de persona, donde cada sección pasa a ser plegable con su resumen.
- Regla nueva en `CLAUDE.md`, sección «Diseño UI».
- Artboards de referencia en el canvas, página nueva «15e · Secciones plegables».
- Verificación con Playwright en claro, oscuro y 600 px.

**No entra:**

- Recordar qué secciones quedaron abiertas entre visitas (`localStorage`). Si se pide, va en otro spec.
- Pasar las demás páginas existentes. Hoy solo la ficha de persona tiene tres o más secciones; la comparación de duplicados queda fuera porque compara lado a lado y necesita todo a la vista.
- La página del emisor del spec 62: la arma ese spec con estos componentes.
- Reordenar secciones con arrastre.

## Base de código reutilizada

| Pieza | Qué se hace |
| --- | --- |
| `@angular/cdk/accordion` (`CdkAccordion`, `CdkAccordionItem`) | Estado, ids y modo de una o varias abiertas; se envuelve, no se expone al consumidor. |
| `shared/ui` (`estado-vacio` como molde de componente, `tema.css`) | Estructura del componente, que usa solo tokens. |
| `persona-detalle.page.html` y los componentes de `personas-ui` | Cada sección se envuelve en `vit-seccion-plegable` con su resumen. |
| Canvas: `PER-Ficha` | Base del artboard de la ficha con secciones contraídas. |

## Modelo de datos

No hay datos, tablas, endpoints ni eventos nuevos.

### `libs/shared/ui/src/lib/components/seccion-plegable/`

`seccion-plegable.component.ts` + `.html` + `.css` (la animación no se expresa bien con utilidades) + `.spec.ts`.

```ts
@Component({ selector: 'vit-seccion-plegable', hostDirectives: [CdkAccordionItem] /* ... */ })
export class SeccionPlegableComponent {
  readonly titulo = input.required<string>();
  /** Texto corto que se ve contraída: «3 contactos · principal: correo». */
  readonly resumen = input<string>('');
  readonly expandida = model<boolean>(true);
  readonly deshabilitada = input<boolean>(false);
  /** Nivel del título para la jerarquía de la página. */
  readonly nivelTitulo = input<2 | 3>(2);
}
```

- **Ranuras:**
  - `[vitSeccionEntrada]`: número de paso, ícono o marca de hecho;
  - `[vitSeccionFin]`: chip de estado o una acción secundaria, que no pliega al pulsarla porque detiene la propagación;
  - el contenido por defecto;
  - `[vitSeccionPie]`: acciones, que solo se ven expandida.
- **Cabecera:** fila de 56 px. Lleva la entrada, el título (16 px, peso 500) y el resumen (14 px, `--color-sobre-superficie-variante`, una línea con puntos suspensivos, solo contraída), y al final el fin y el galón `expand_more` de Material Symbols, que gira 180° expandida.
  - El hover usa `--color-superficie-contenedor`.
  - En celular (< 600 px) el resumen baja a una segunda línea bajo el título.
- **Tarjeta:** radio `rounded-tarjeta` y borde `--color-borde`; el separador entre la cabecera y el contenido solo se ve expandida.
- **Deshabilitada:** la cabecera no pliega, el título usa el tono variante y el resumen explica por qué («Guarda primero el proveedor»). Si llega deshabilitada, se muestra contraída.
- **Contenido:** envoltura con `display: grid` y `grid-template-rows` animado; el hijo tiene `min-height: 0` y `overflow: hidden`; `inert` cuando está contraída.

### `libs/shared/ui/src/lib/components/grupo-plegable/`

```ts
@Component({ selector: 'vit-grupo-plegable', hostDirectives: [CdkAccordion] /* ... */ })
export class GrupoPlegableComponent {
  /** false: abrir una cierra las demás. */
  readonly multiple = input<boolean>(true);
  /** null: se muestran desde MINIMO_SECCIONES_CONTROLES (3). */
  readonly conControles = input<boolean | null>(null);
  expandirTodo(): void;
  contraerTodo(): void;
}
```

- Los controles son dos botones de texto de 32 px alineados a la derecha, sobre la primera sección: «Expandir todo» y «Contraer todo». Se deshabilita el que no tiene efecto.
- Separación vertical de 16 px entre secciones.
- `src/index.ts` exporta `SeccionPlegableComponent`, `GrupoPlegableComponent` y las tres directivas de ranura por ruta explícita.
- Los textos van en `MENSAJES_UI`: `expandirTodo`, `contraerTodo`, `expandirSeccion` y `contraerSeccion`. Los dos últimos son la etiqueta accesible del galón, con el título.

### Ficha de persona (`admin-cliente` y `personas-ui`)

| Sección | Inicio | Resumen contraída |
| --- | --- | --- |
| Datos básicos | Expandida | Documento y fecha de nacimiento |
| Posibles duplicados (N) | Expandida si N > 0 | «N posibles duplicados» |
| Contactos | Expandida | «N contactos · principal: {tipo}» |
| Direcciones | Contraída | «N direcciones · principal: {distrito}» |
| Roles | Contraída | Roles separados por coma |
| Consentimientos | Contraída | «N de M vigentes» |

- Cada componente de `personas-ui` expone su resumen como `computed` (`resumen`), y la página lo pasa a la sección. Los encabezados propios que hoy tiene cada componente se quitan: el título lo pone la sección.
- Si una acción falla dentro de una sección contraída (por ejemplo, un guardado desde un panel lateral), la página la expande antes de mostrar el error.

### Regla en `CLAUDE.md` (sección «Diseño UI»)

> - Una página con tres o más secciones o tarjetas las envuelve en `vit-grupo-plegable` y `vit-seccion-plegable`, con un resumen útil en cada una. Se expande lo que el usuario necesita primero (el paso pendiente, el formulario principal) y se contrae lo completo o secundario. Si una sección contraída tiene un error, se expande sola. Excepción: las pantallas que comparan lado a lado.

### Diseño de referencia

Canvas «Vitrina · Diseño UI» (https://claude.ai/artifact/UGvcmiWUiBsMuWerqMiWxh), página «15e · Secciones plegables».

| Artboard | Qué fija |
| --- | --- |
| `UI-Plegables` | Hoja del componente en claro y oscuro: expandida, contraída con resumen, con chip al final, deshabilitada, con foco, controles del grupo y en celular. |

La página del emisor del spec 62 (`FE-Emisor`) usa el mismo patrón y sirve de segundo ejemplo.

## Plan de implementación

1. **Diseño aprobado.** El usuario revisa `UI-Plegables` y `FE-Emisor`. Sin su visto bueno no se escribe código.
2. **Componente.** `seccion-plegable`, `grupo-plegable`, ranuras y mensajes, con pruebas:
   - clic y teclado pliegan;
   - `aria-expanded` cambia;
   - contraída es `inert`;
   - deshabilitada no pliega;
   - el fin no pliega;
   - «Contraer todo» cierra todas;
   - con `multiple` falso, abrir una cierra la otra;
   - un formulario conserva su valor tras contraer y expandir.

   API del CDK por ctx7 antes de escribir.
3. **Ficha de persona.** Secciones plegables, resúmenes `computed` en `personas-ui` con pruebas, y apertura de la sección cuando hay un error.
4. **Regla.** El párrafo nuevo en `CLAUDE.md`, sección «Diseño UI».
5. **Cierre.** `code-simplifier` sobre los archivos tocados; `npx nx run-many -t lint test -p ui personas-ui admin-cliente plataforma-admin`; recorrido con Playwright de la ficha en claro, oscuro y 600 px, con la consola sin errores y capturas comparadas con el canvas.

## Criterios de aceptación

- [ ] Pulsar la cabecera, o Enter o Espacio con el foco en ella, contrae y expande la sección. El galón gira y `aria-expanded` cambia.
- [ ] Contraída, la sección muestra el título, el resumen y el chip del final. Tabular no entra en su contenido.
- [ ] Un campo con texto escrito sigue con ese texto después de contraer y expandir.
- [ ] Una sección deshabilitada no se expande y su resumen explica por qué.
- [ ] Con tres o más secciones aparecen «Expandir todo» y «Contraer todo», y cada uno se deshabilita cuando no tiene efecto. Con dos o menos no aparecen.
- [ ] Con `prefers-reduced-motion: reduce` (emulado en Playwright) no hay transición.
- [ ] La ficha de persona abre con datos básicos y contactos expandidos (y duplicados, si hay), y con direcciones, roles y consentimientos contraídos con su resumen.
- [ ] Un error de guardado en una sección contraída de la ficha la expande y el mensaje queda a la vista.
- [ ] Claro, oscuro y 600 px se ven como `UI-Plegables`, solo con tokens `--color-*` y sin hex sueltos. En 600 px el resumen baja bajo el título. La consola no tiene errores.
- [ ] axe-core no reporta violaciones en la ficha con secciones contraídas.
- [ ] `CLAUDE.md` tiene la regla nueva en «Diseño UI».
- [ ] Los componentes siguen la estructura de libs Angular de `CLAUDE.md` (`templateUrl`, `styleUrl`, un artefacto por archivo, `index.ts` sin `export *`) y la sección «Código limpio».
- [ ] `npx nx run-many -t lint test -p ui personas-ui admin-cliente plataforma-admin` en verde; `nx affected` en verde en el CI del PR.

## Decisiones

- **Sí:** componente propio en `shared/ui` sobre `CdkAccordion`, y no `mat-expansion-panel`. El panel de Material trae su propio alto, sombra y relleno, que chocan con la tarjeta del canvas (borde, radio 12 y densidad media). El CDK da estado y accesibilidad sin estilos.
- **Sí:** varias secciones abiertas a la vez por defecto. En la ficha y en el emisor se trabaja con dos secciones a la vista; el modo de una sola queda como opción.
- **Sí:** el contenido contraído sigue en el DOM y queda `inert`. No se pierde lo escrito, y el foco y los lectores de pantalla no entran en lo oculto.
- **Sí:** el resumen lo arma cada feature. Solo ella sabe qué es útil («principal: correo»).
- **Sí:** la regla vale desde tres secciones. Con dos, plegar no ahorra desplazamiento y agrega clics.
- **No:** recordar el estado entre visitas. Agrega persistencia por página para un beneficio chico; lo que se abre al inicio lo decide la pantalla según el estado de los datos.
- **No:** aplicarlo a la comparación de duplicados. Comparar lado a lado necesita todo visible.

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| `inert` y la animación de altura se comportan distinto según el navegador | Chrome, Edge y Firefox actuales soportan `inert`; se prueba en Playwright con Chromium y Firefox. |
| Un panel lateral abierto desde una sección contraída devuelve el foco a un elemento `inert` | Al cerrar el panel el foco vuelve a la cabecera de la sección; hay una prueba. |
| Quitar los encabezados propios de los componentes de `personas-ui` rompe pruebas que los buscan | Las pruebas pasan a buscar por `data-seccion`, que se mantiene. |

## Lo que **no** entra en este spec

- Recordar el estado entre visitas.
- Llevar el patrón a otras páginas existentes (cada una, cuando llegue a tres secciones, en su propio spec).
- La página del emisor (spec 62).
- Reordenar secciones.

Cada uno, si llega, va en su propio spec.
