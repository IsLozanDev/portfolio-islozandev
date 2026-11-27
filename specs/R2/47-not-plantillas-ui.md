# SPEC 47 — Notificaciones: lista de plantillas con vista rápida y editor con vista previa en vivo, historial y restauración de la base

> **Status:** Aprobado
> **Depends on:** SPEC 43, SPEC 44, SPEC 17c, SPEC 15b, SPEC 15c, SPEC 15d, SPEC 15e
> **Date:** 2026-11-26
> **Objective:** Dar al administrador del cliente, en `admin-cliente`, una lista de las plantillas de notificación que puede personalizar, con vista rápida en panel lateral, y una página de edición con asunto, cuerpo HTML, variables que se insertan con un clic, vista previa en vivo junto al editor, historial de versiones y restauración de la base (UI de TR-RF-074).

## Por qué existe este spec

Fila 47 de `docs/roadmap-specs.md` (R2-11: UI de TR-RF-074). Contexto: `docs/spec-context/tr-not/not-plantillas-ui.md`. El back está implementado en el spec 43: seis rutas bajo `/v1/notificaciones/plantillas` con permisos `plat.plantilla_notificacion.consultar` y `.gestionar`, ya en `PLAT_PROPIETARIO`.

El roadmap da 4-5 h. Estimado: 6-7 h (1 h de canvas, 1 h de back y 4-5 h de UI). Crece por tres cosas que salieron al redactar: la vista rápida desde la lista, ocultar las plantillas de operación y el nombre legible de cada plantilla. Las dos últimas piden un cambio chico en el back.

Si el spec se pasa de 10 h, se recorta en este orden: (1) alternar la vista previa entre personalizada y base, (2) la vista rápida desde la lista. Lo recortado pasa a un 47b.

Lo que hay en el código hoy (revisado al redactar):

- `notificaciones` (back, spec 43): `GET /`, `GET /{codigo}/{canal}`, `GET /{codigo}/{canal}/versiones`, `POST /{codigo}/{canal}/vista-previa`, `PUT /{codigo}/{canal}` y `DELETE /{codigo}/{canal}/personalizacion`. El detalle trae `origen`, `asunto`, `cuerpo`, `variables [{nombre, tipo, ejemplo}]`, `version` (`null` si rige la base) y `base { asunto, cuerpo }`. `VARIABLE_NO_PERMITIDA` responde 400 con `variables: string[]`. El `PUT` devuelve el cuerpo ya saneado.
- Plantillas base sembradas: `PRUEBA_CORREO` (spec 42), `SUSCRIPCION_POR_VENCER`, `TENANT_SUSPENDIDO`, `SOPORTE_SOLICITADO` e `INTEGRIDAD_ROTA` (spec 44). `INTEGRIDAD_ROTA` va a la dirección de operación de la plataforma, pero el mensaje lleva el `tenant_id` del evento: hoy un tenant podría personalizarla y `vigente()` la usaría.
- Manifiesto PLAT `1.30.0`. Módulo «Configuración» con parámetros, series, catálogos y feriados (orden 1 a 4). No hay opción «Plantillas».
- Última letra de migración: `01x` (spec 52).
- `admin-cliente`: rutas en `admin-cliente.routes.ts`, permisos de la lib en `models/permisos-*.ts`. No existe ningún guard de salida (`canDeactivate`) en el repo.
- `shared/ui`: `TablaComponent`, `ChipEstadoComponent` con `TonoEstado`, `FiltrosComponent`, `EstadoVacioComponent`, `CargandoComponent`, `AccionesFormularioComponent`, `PanelLateralService`, `AvisosService` (`confirmar`, `confirmarDestructiva` con `pedirMotivo` opcional), `vit-grupo-plegable` y `vit-seccion-plegable` (spec 15e).

## Pantalla tipo

- **Lista** (pantalla tipo lista del canvas «Vitrina · Diseño UI»): tabla de plantillas con filtro de texto. Cambia en: acción «Ver» por fila que abre la vista rápida en el panel lateral.
- **Editor** (pantalla tipo formulario): página propia, no panel lateral, porque el editor y la vista previa van lado a lado. Cambia en: dos columnas (editor a la izquierda, vista previa a la derecha; a 600 px la vista previa va debajo), chips de variables encima del cuerpo, contador del asunto e historial en una sección plegable al pie.
- El editor no encaja en ninguna pantalla tipo. Se diseñó en el canvas «Vitrina · Diseño UI», página «47 · Plantillas», aprobada por el usuario el 2026-11-27. La página entra en la excepción de «pantallas que comparan lado a lado» de la regla de secciones plegables: solo el historial va plegado.

## Alcance

**Entra:**

- **Back (`notificaciones`):**
  - columna `personalizable` en `ntf.plantilla`; `INTEGRIDAD_ROTA` queda en `false`. La API de plantillas no lista ni deja consultar, previsualizar, personalizar ni restaurar las no personalizables (404 `PLANTILLA_NO_ENCONTRADA`). El envío (`vigente()`) no cambia;
  - columna `nombre` en `ntf.plantilla` con el título legible de cada plantilla («Aviso de suscripción por vencer»). La siembran las migraciones de cada base; la versión personalizada lo copia de la base y el tenant no lo edita. La lista y el detalle de la API lo devuelven.
- **Manifiesto PLAT `1.31.0` → `1.32.0`** (el spec 62 tomó la `1.31.0`): opción de menú «Plantillas» en «Configuración», ruta `/admin/plantillas`, permiso `plat.plantilla_notificacion.consultar`.
- **Lista** `/admin/plantillas`: plantilla (nombre con el código debajo), asunto, canal (chip), origen (chip), versión y actualizado; filtro de texto (`q`); paginada; vista de celular.
- **Vista rápida:** panel lateral de solo lectura con el asunto y el cuerpo vigentes renderizados, origen y versión, y un enlace «Editar» si hay `gestionar`.
- **Editor** `/admin/plantillas/:codigo/:canal`:
  - título de la página con el nombre de la plantilla y el código debajo;
  - asunto con contador `n/150`; cuerpo en un `textarea` monoespaciado con el HTML;
  - variables declaradas (nombre, tipo, ejemplo) como chips que insertan `{{nombre}}` en el cursor del último campo enfocado (asunto o cuerpo);
  - validación local de marcadores contra las variables declaradas, con «Variable no permitida: X» en el campo (TR-CA-185); el 400 del servidor se pinta igual;
  - vista previa en vivo (debounce de 600 ms) en un `iframe` con `sandbox` vacío y `srcdoc`; selector «Personalizada / Base» para ver la original;
  - guardar (versión nueva), restaurar la base con confirmación destructiva, aviso si el servidor quitó contenido al sanear;
  - historial de versiones en `vit-seccion-plegable` contraída (versión, activa, autor, fecha);
  - sin `gestionar`: campos en solo lectura y sin botones de guardar ni restaurar.
- **Guard de salida** con cambios sin guardar y manejo del 409 `VERSION_OBSOLETA` sin perder el texto.

**No entra (specs futuros):**

- Editor de texto enriquecido o WYSIWYG: el cuerpo se edita como HTML.
- Restaurar una versión anterior concreta del historial: la API solo restaura la base.
- Editar o crear plantillas base desde `plataforma-consola`.
- Canales SMS, WhatsApp y PUSH, contador de segmentos y costo (TR-CA-186, latente) y estado de aprobación de Meta (TR-RN-026, spec 104).
- Otros idiomas y layout de marca del tenant.
- Envío de prueba real desde el editor: la vista previa no envía.

## Base de código reutilizada

| Pieza | Qué se hace |
| --- | --- |
| API de plantillas (spec 43) | Se consume tal cual; se agregan el filtro de `personalizable` y el campo `nombre`. |
| `catalogos-lista` + `item-propio-formulario` (spec 19e) | Patrón de lista con página de formulario, manejo del 409 y mapeo de errores a campos. |
| `shared/ui` | Tabla, chips, filtros, vacío, cargando, acciones de formulario, panel lateral, avisos, sección plegable. |
| `shared/auth` (`permisoGuard`, `vitSiPermiso`) | Ruta con `consultar`; controles de edición con `gestionar`. |
| Manifiesto y su CLI | Opción de menú y versión `1.32.0`. |

## Modelo de datos

### Migración `db/02b_not_plantilla_personalizable.sql` (+ `db/rollback/02b_not_plantilla_personalizable.sql`, `db/tests/02b_not_plantilla_personalizable.test.sql`)

```sql
ALTER TABLE ntf.plantilla
  ADD COLUMN personalizable boolean NOT NULL DEFAULT true,
  ADD COLUMN nombre varchar(120);

UPDATE ntf.plantilla SET nombre = CASE codigo
    WHEN 'PRUEBA_CORREO'          THEN 'Correo de prueba'
    WHEN 'SUSCRIPCION_POR_VENCER' THEN 'Aviso de suscripción por vencer'
    WHEN 'TENANT_SUSPENDIDO'      THEN 'Aviso de cuenta suspendida'
    WHEN 'SOPORTE_SOLICITADO'     THEN 'Solicitud de acceso de soporte'
    WHEN 'INTEGRIDAD_ROTA'        THEN 'Alerta de integridad de la auditoría'
  END
 WHERE tenant_id IS NULL;

-- Las versiones del tenant toman el nombre de su base.
UPDATE ntf.plantilla AS propia
   SET nombre = base.nombre
  FROM ntf.plantilla AS base
 WHERE propia.tenant_id IS NOT NULL AND base.id = propia.plantilla_base_id;

ALTER TABLE ntf.plantilla
  ALTER COLUMN nombre SET NOT NULL,
  ADD CONSTRAINT ck_plantilla_nombre CHECK (char_length(nombre) BETWEEN 3 AND 120);

UPDATE ntf.plantilla
   SET personalizable = false
 WHERE tenant_id IS NULL AND codigo = 'INTEGRIDAD_ROTA';

-- Una personalización previa de una plantilla de operación deja de regir.
UPDATE ntf.plantilla
   SET activa = false
 WHERE tenant_id IS NOT NULL AND codigo = 'INTEGRIDAD_ROTA';
```

- Inverso: quita las dos columnas. No reactiva filas desactivadas: no se sabe cuáles estaban activas.
- `NOT NULL` obliga a que toda base sembrada después traiga su nombre. Si el `UPDATE` deja alguna base sin nombre, el `SET NOT NULL` falla y la migración no se aplica: así se detecta una base olvidada.
- Prueba SQL: `INTEGRIDAD_ROTA` base con `personalizable = false`; las otras cuatro con `true`; una personalización de `INTEGRIDAD_ROTA` sembrada en la prueba queda inactiva; toda fila tiene `nombre` y una versión del tenant tiene el de su base.
- La letra quedó en `02b`: `01y` y `02a` ya estaban tomadas al implementar. Las pruebas SQL anteriores que insertan en `ntf.plantilla` llevan `nombre` (decisión del usuario al implementar).

### Back (`libs/plataforma/notificaciones`)

- `PlantillaEntidad` y el agregado suman `personalizable: boolean` y `nombre: string`, mapeados en el adaptador.
- `nuevaVersionPersonalizada` (spec 43) copia `nombre` de la base, como ya copia código, canal, idioma y variables.
- `RepositorioPlantillas.listar` filtra las base con `personalizable = true`.
- Nuevo método `basePersonalizable(codigo, canal, idioma)` (o filtro en `base()` si nadie más la usa; se revisa al implementar). Lo usan `ConsultarPlantilla`, `VistaPreviaPlantilla`, `PersonalizarPlantilla` y `RestaurarPlantillaBase`; sin base personalizable → `PlantillaBaseNoEncontradaError` (404). `vigente()` no cambia.
- `ResumenPlantilla`, `ResumenPlantillaDto` y el detalle suman `nombre`, con su OpenAPI. Sin cambios en rutas ni permisos.
- La búsqueda `q` de la lista también busca en `nombre`.

### Front (`libs/plataforma/admin-cliente/src/lib/`)

`models/plantilla.ts`:

```ts
export type OrigenPlantilla = 'BASE' | 'PERSONALIZADA';
export type CanalPlantilla = 'CORREO';

export interface VariableDeclarada { nombre: string; tipo: string; ejemplo: string | null; }

export interface ResumenPlantilla {
  codigo: string; nombre: string; canal: CanalPlantilla; idioma: string; origen: OrigenPlantilla;
  version: number | null; asunto: string; actualizadoEn: string;
}

export interface DetallePlantilla extends ResumenPlantilla {
  cuerpo: string;
  variables: VariableDeclarada[];
  base: { asunto: string; cuerpo: string };
}

export interface VersionPlantilla { version: number; activa: boolean; creadoPor: string | null; creadoEn: string; }
export interface VistaPrevia { asunto: string; cuerpoHtml: string; }
export interface ContenidoPlantilla { asunto: string; cuerpo: string; version: number | null; }
```

- Mapeo snake_case → camelCase en el mismo archivo, como los demás modelos de la lib.
- `models/permisos-plantillas.ts`: `PERMISOS_PLANTILLAS = { consultar: 'plat.plantilla_notificacion.consultar', gestionar: 'plat.plantilla_notificacion.gestionar' }`.
- `models/tonos-plantilla.ts`: `BASE` → `neutro`, `PERSONALIZADA` → `info`.
- `utils/marcadores-plantilla.ts`: `marcadoresNoDeclarados(texto, variables)` con la misma expresión del back (`{{\s*nombre\s*}}`) y `insertarEnCursor(texto, inicio, fin, insercion)`. Funciones puras con pruebas.
- `services/plantillas.cliente.ts`: `listar({ q, pagina, tamano })`, `obtener(codigo, canal)`, `versiones(codigo, canal)`, `vistaPrevia(codigo, canal, { asunto?, cuerpo? })`, `guardar(codigo, canal, contenido)`, `restaurarBase(codigo, canal)`. Traduce `VARIABLE_NO_PERMITIDA`, `CONTENIDO_PLANTILLA_INVALIDO` y `VERSION_OBSOLETA` a errores propios de `models/`.
- `guards/cambios-sin-guardar.guard.ts`: `CanDeactivateFn` sobre una interfaz `ConCambiosSinGuardar { tieneCambiosSinGuardar(): boolean }`; si hay cambios pide confirmación con `AvisosService.confirmar`.
- `pages/plantillas-lista/`, `pages/plantilla-editor/` y `components/plantilla-vista-rapida/` (contenido del panel lateral), cada uno con `.ts`, `.html` y `.css` solo si hace falta.
- `components/vista-previa-correo/`: `iframe` con `sandbox=""` y `[srcdoc]`. El HTML ya viene saneado del servidor; se marca confiable con `DomSanitizer.bypassSecurityTrustHtml` solo dentro de este componente, con la razón en la decisión de este spec. Lo reutilizan el editor y la vista rápida.
- Rutas en `admin-cliente.routes.ts`: `plantillas` (`permisoGuard(consultar)`) y `plantillas/:codigo/:canal` (`permisoGuard(consultar)`, `canDeactivate: [cambiosSinGuardarGuard]`).

### Comportamiento del editor

| Situación | Qué pasa |
| --- | --- |
| Carga | `obtener` y `versiones` en paralelo; `vit-cargando` mientras tanto; 404 → `vit-estado-vacio` «La plantilla no existe» con vuelta a la lista. |
| Escribir en asunto o cuerpo | Validación local inmediata; si no hay errores locales, `vistaPrevia` con debounce de 600 ms y la última petición gana (`switchMap`). Con error local la vista previa no se pide y muestra el último render válido atenuado. |
| Vista previa falla (red o 5xx) | Mensaje en el panel de vista previa «No se pudo generar la vista previa»; el editor sigue usable. |
| Selector «Base» | Renderiza `base.asunto` y `base.cuerpo` con `vistaPrevia`; el editor no cambia. |
| Guardar | Deshabilitado si no hay cambios o hay errores. 200 → aviso de éxito, el formulario toma la respuesta (versión nueva, origen `PERSONALIZADA`) y se recarga el historial. Si el cuerpo devuelto difiere del enviado → aviso «Se quitó contenido no permitido al guardar». |
| 400 `VARIABLE_NO_PERMITIDA` | Error en el campo (asunto o cuerpo, según dónde aparezca cada nombre) con «Variable no permitida: X». |
| 400 `CONTENIDO_PLANTILLA_INVALIDO` | Error en el campo que corresponda (asunto vacío, largo o con salto de línea; cuerpo vacío). |
| 409 `VERSION_OBSOLETA` | Aviso «Otra persona guardó una versión nueva» con «Recargar» y «Seguir editando». El texto del editor no se descarta; «Recargar» copia antes el cuerpo al portapapeles y lo dice en el aviso. |
| Restaurar la base | Solo con origen `PERSONALIZADA` y `gestionar`; botón con `vit-destructivo`; `confirmarDestructiva` sin motivo. 204 → recarga el detalle (origen `BASE`) y el historial. 404 `SIN_PERSONALIZACION` → recarga sin error. |
| Salir con cambios | El guard pide confirmación; al confirmar se descartan. |

## Plan de implementación

1. **Canvas.** Hecho y aprobado: página «47 · Plantillas» del canvas «Vitrina · Diseño UI». Las pantallas se implementan contra sus artboards.
2. **Back.** Migración `02b` con inverso y prueba SQL; `personalizable` y `nombre` en entidad, mapeo, repositorio y DTO; filtro en `listar` y en la base que usan los cuatro casos de uso. Pruebas: la lista no trae `INTEGRIDAD_ROTA`; `GET`, `PUT`, vista previa y `DELETE` de `INTEGRIDAD_ROTA` → 404; el envío de `INTEGRIDAD_ROTA` sigue funcionando; una versión nueva conserva el nombre de la base; `q=suspendida` encuentra `TENANT_SUSPENDIDO` por el nombre.
3. **Modelos, utilidades y cliente.** `plantilla.ts`, permisos, tonos, `marcadores-plantilla.ts` y `plantillas.cliente.ts` con pruebas (mapeo, errores traducidos, `{{ nombre }}` con espacios aceptado, `{{diagnostico}}` rechazado, inserción en el cursor).
4. **Lista y vista rápida.** `plantillas-lista`, `plantilla-vista-rapida` y `vista-previa-correo`; ruta `plantillas`. Pruebas de la página (filtro, vacío, «Editar» solo con `gestionar`).
5. **Editor.** `plantilla-editor` con validación local, chips, vista previa en vivo, selector base, guardar, 400 y 409. Pruebas de la página con dobles del cliente.
6. **Historial, restaurar y guard.** Sección plegable del historial, restaurar con confirmación y `cambios-sin-guardar.guard.ts` con su prueba; ruta del editor con `canDeactivate`.
7. **Manifiesto.** Opción `plat.configuracion.plantillas` («Plantillas», icono `mail`, orden 5) y versión `1.32.0`; se aplica con el CLI del manifiesto en dev.
8. **Cierre.** `code-simplifier` sobre los archivos tocados; `pnpm db:up:remoto` y el CLI del manifiesto en Supabase dev; verificación con el MCP Playwright (criterios de UI, claro, oscuro y 600 px, consola sin errores, capturas); `npx nx run-many -t lint test -p notificaciones plataforma-admin-cliente plataforma-admin migrar seguridad` (más las libs cuyas pruebas fijan la versión del manifiesto).

## Criterios de aceptación

- [ ] Con `plat.plantilla_notificacion.consultar`, el menú «Configuración» muestra «Plantillas» y lleva a `/admin/plantillas`; sin ese permiso la opción no aparece y la ruta no carga.
- [ ] La lista muestra `PRUEBA_CORREO`, `SUSCRIPCION_POR_VENCER`, `TENANT_SUSPENDIDO` y `SOPORTE_SOLICITADO`, con chip de canal y de origen; no muestra `INTEGRIDAD_ROTA`.
- [ ] `GET`, `PUT`, vista previa y `DELETE` de `INTEGRIDAD_ROTA` por la API → 404 `PLANTILLA_NO_ENCONTRADA`; el correo de integridad rota a operación se sigue enviando con la base.
- [ ] La lista y el título del editor muestran el nombre de la plantilla («Aviso de suscripción por vencer») con el código debajo.
- [ ] El filtro de texto busca por nombre, código y asunto; sin resultados se ve `vit-estado-vacio`.
- [ ] «Ver» en una fila abre el panel lateral con el asunto y el cuerpo vigentes renderizados, sin entrar al editor; «Editar» aparece solo con `gestionar`.
- [ ] TR-CA-184 (adaptado a `SUSCRIPCION_POR_VENCER`): el usuario cambia el cuerpo, guarda, la lista muestra origen `PERSONALIZADA` con versión 1, y el siguiente correo de ese tenant usa el texto nuevo.
- [ ] TR-CA-185: escribir `{{diagnostico}}` en el cuerpo muestra «Variable no permitida: diagnostico» bajo el campo al instante y deshabilita «Guardar»; si el error llega del servidor (400), se muestra en el mismo campo.
- [ ] Pulsar el chip de una variable inserta `{{nombre}}` en la posición del cursor del último campo enfocado.
- [ ] El asunto muestra el contador `n/150` y no deja guardar con más de 150 caracteres ni con salto de línea.
- [ ] La vista previa se actualiza sola tras dejar de escribir (600 ms), muestra los valores de ejemplo declarados, no inserta en `ntf.mensaje` y se renderiza en un `iframe` con `sandbox` vacío.
- [ ] El selector «Base» muestra la plantilla original sin tocar el texto del editor.
- [ ] Guardar un cuerpo con `<script>` u `onclick` muestra el aviso de contenido quitado y el editor queda con el cuerpo saneado que devolvió el servidor.
- [ ] Con dos pestañas sobre la misma plantilla, guardar en la segunda tras guardar en la primera muestra el aviso de versión nueva; el texto de la segunda no se pierde.
- [ ] Restaurar la base pide confirmación destructiva; al confirmar, el origen vuelve a `BASE` y el historial muestra todas las versiones inactivas.
- [ ] El historial está contraído al abrir y lista versión, activa, autor y fecha.
- [ ] Salir del editor con cambios sin guardar pide confirmación; sin cambios sale directo.
- [ ] Un usuario con `consultar` y sin `gestionar` ve el editor en solo lectura, sin «Guardar» ni «Restaurar».
- [ ] Verificado con el MCP Playwright en tema claro y oscuro y a 600 px (vista previa debajo del editor, lista en vista de celular); consola sin errores; capturas de lista, vista rápida y editor.
- [ ] Las capturas coinciden con los artboards de «47 · Plantillas» (textos, íconos, tonos y ubicación de acciones). Una diferencia se corrige en el código o en el canvas antes de cerrar.
- [ ] Colores solo por tokens (`--color-*` y tema M3); sin hex sueltos en los componentes nuevos.
- [ ] Migración `02b` reversible y probada en CI contra PostgreSQL 16.
- [ ] Manifiesto `1.32.0` aplicado en dev.
- [ ] El código nuevo sigue la sección «Código limpio» de `CLAUDE.md` y la estructura de libs Angular (un artefacto por archivo, `templateUrl` y `styleUrl`, pruebas junto al archivo).
- [ ] `npx nx run-many -t lint test -p notificaciones plataforma-admin-cliente plataforma-admin migrar seguridad` verde; `nx affected` verde en el CI del PR.

## Decisiones

- **Sí:** cuerpo en `textarea` HTML con chips de variables. Decisión del usuario. Sin dependencias nuevas; el saneo que vale es el del servidor (spec 43).
- **No:** editor enriquecido (Tiptap o similar). Suma dependencia y horas, y su HTML puede no sobrevivir a la lista blanca.
- **No:** texto plano envuelto en párrafos. No deja enlaces ni negritas.
- **Sí:** editor en página propia, no en panel lateral. Decisión del usuario. Editor y vista previa lado a lado no caben en el panel; se diseña primero en el canvas, como pide `CLAUDE.md` para pantallas sin tipo.
- **Sí:** vista rápida en panel lateral desde la lista. Decisión del usuario. Ver el correo sin abrir el editor; es solo lectura, así que no choca con la regla de formularios en panel.
- **Sí:** vista previa automática con debounce de 600 ms y validación local de marcadores. Decisión del usuario. TR-RNF-020 (aprender en menos de 1 h) y TR-CA-185 en el campo.
- **Sí:** historial de versiones y alternar con la base. Decisión del usuario. El back ya los da.
- **Sí:** ocultar las plantillas de operación con la columna `personalizable`. Decisión del usuario. `INTEGRIDAD_ROTA` va a la plataforma; si un tenant la personaliza, `vigente()` la usaría. Columna en datos y no lista en código, por TR-RNF-027.
- **No:** mostrar todas las plantillas sin tocar el back.
- **Sí:** código dentro de `admin-cliente`. Decisión del usuario. Único consumidor; si la consola llega a editar bases, se extrae a una lib.
- **Sí:** guard de salida y 409 sin perder el texto. Decisión del usuario.
- **Sí:** `bypassSecurityTrustHtml` solo en `vista-previa-correo`, con `iframe` `sandbox=""`. El HTML viene saneado del servidor y el `sandbox` vacío bloquea scripts, formularios y navegación (TR-RNF-012). Angular no deja enlazar `srcdoc` sin marcarlo.
- **Sí:** restaurar con `confirmarDestructiva` sin motivo. El `DELETE` no recibe motivo y la auditoría ya registra quién y cuándo.
- **Sí:** canal como chip y solo CORREO. Es el único habilitado en R2; TR-CA-186 queda latente.
- **Sí:** origen `PERSONALIZADA` con tono `info`, no `exito`. Personalizar no es un estado bueno ni malo.
- **Sí:** columna `nombre` en `ntf.plantilla`, sembrada por migración y copiada de la base. Decisión del usuario al revisar el canvas. Un operativo no reconoce `SUSCRIPCION_POR_VENCER`; el nombre es de la plataforma y el tenant no lo edita.
- **No:** mapa de nombres en el front. Obligaría a tocar el front con cada base nueva (TR-RNF-027).
- **Sí (en el diseño):** canvas «47 · Plantillas» aprobado por el usuario el 2026-11-27, con el correo de la vista previa en blanco también en tema oscuro (como lo ve el destinatario) y el botón «Copiar y recargar» en el aviso del 409.

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| Otro frente en paralelo toma la letra `01y` o sube el manifiesto a `1.31.0` | Se confirma la letra y la versión contra `main` al implementar; el segundo PR se rebasa y renumera. |
| La vista previa en vivo dispara muchas peticiones | Debounce de 600 ms, `switchMap` que cancela la anterior y sin petición con errores locales. |
| `base()` del repositorio también la usa el envío | Si es así, método aparte `basePersonalizable`; la prueba del paso 2 verifica que integridad rota se sigue enviando. |
| El HTML de un correo con estilos complejos se ve distinto en el `iframe` que en el cliente de correo | La vista previa es orientativa; el humo del paso 8 envía un correo real con `notificaciones:probar:remoto` y se compara. |
| El copiado al portapapeles falla (permiso del navegador) | El aviso del 409 lo dice y «Seguir editando» deja el texto en el editor para copiarlo a mano. |

## Lo que **no** entra en este spec

- Editor enriquecido o WYSIWYG.
- Restaurar una versión anterior concreta.
- Edición de bases desde la consola.
- SMS, WhatsApp, PUSH, segmentos, costo y aprobación de Meta.
- Otros idiomas, layout de marca y envío de prueba desde el editor.

Cada uno, si llega, va en su propio spec.
