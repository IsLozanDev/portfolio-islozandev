# SPEC 43 — Notificaciones: API de plantillas con personalización por tenant, versiones, HTML saneado, vista previa y restauración de la base

> **Status:** Implementado
> **Depends on:** SPEC 42, SPEC 06, SPEC 20a
> **Date:** 2026-11-23
> **Objective:** Exponer en `libs/plataforma/notificaciones` la API `/v1/notificaciones/plantillas` para que cada tenant personalice las plantillas base de plataforma: se guarda una versión nueva con HTML saneado y solo con las variables declaradas, se ve una vista previa sin enviar y se vuelve a la base sin perderla.

## Por qué existe este spec

Fila 43 de `docs/roadmap-specs.md` (R2-09: TR-RF-074, parte back). Contexto: `docs/spec-context/tr-not/not-correo-plantillas-estados.md`, parte b, y el contrato propuesto en `docs/spec-context/tr-not/not-plantillas-ui.md` §6, que consume la UI del spec 47. El roadmap pone como dependencia el «07»; los permisos efectivos y `@Permiso` se implementaron dentro del spec 06, por eso la cabecera cita el 06.

Lo que hay en el código hoy (revisado al redactar):

- `notificaciones` (spec 42): `ntf.plantilla` con `tenant_id` nulo para la base, `version`, `activa`, `plantilla_base_id`, `variables jsonb [{nombre, tipo}]` y el índice único `(tenant, codigo, canal, idioma, version)`. Las políticas RLS ya dejan al tenant insertar y actualizar solo sus filas y leer las suyas y las base.
- `RepositorioPlantillas.vigente(codigo, canal, idioma)` elige primero la del tenant activa de mayor versión y después la base: una personalización activa ya rige los envíos siguientes sin tocar `EnviarNotificacion`.
- `domain/renderizador-plantilla.ts`: `renderizar(plantilla, variables)` valida las variables recibidas (`VariableNoPermitidaError`, TR-CA-185) y escapa los valores en el cuerpo. No valida los marcadores `{{...}}` del texto de la plantilla.
- Única plantilla base: `PRUEBA_CORREO` (variables `nombre` y `producto`). No hay API, ni permisos de plantillas, ni `sanitize-html` en `package.json`.
- Manifiesto PLAT en `1.26.0`; módulo de menú «Configuración» con parámetros, series, catálogos y feriados.
- Última letra de migración: `01p` (FE). El spec 50, en paralelo, usa `01r`.

## Alcance

**Entra:**

- Lista, detalle e historial de versiones de las plantillas que ve el tenant (base y personalizadas), solo canal CORREO e idioma `es`.
- Personalizar una plantilla base: `PUT` guarda una versión nueva del tenant con asunto y cuerpo; las variables se copian de la base y no se editan.
- Validación al guardar: solo marcadores `{{variable}}` declarados por la base («Variable no permitida: diagnostico», TR-CA-185), asunto de 1 a 150 caracteres, cuerpo de 1 a 100 000.
- Saneamiento del HTML del cuerpo en el servidor con `sanitize-html` y lista blanca de etiquetas y atributos (TR-RNF-012).
- Vista previa: renderiza el texto enviado (o el vigente) con los valores de ejemplo declarados; no envía ni guarda nada.
- Restaurar la base: desactiva las versiones del tenant de ese código; vuelve a regir la base.
- `ejemplo` en las variables declaradas de la base (semilla de `PRUEBA_CORREO`).
- Permisos `plat.plantilla_notificacion.consultar` y `plat.plantilla_notificacion.gestionar` en el manifiesto `1.27.0`, los dos en `PLAT_PROPIETARIO`.
- Auditoría de personalizar y restaurar con `@Auditable`.
- Migración `db/01q_not_plantillas.sql` con inverso y prueba SQL.

**No entra (specs futuros):**

- UI de plantillas y opción de menú «Plantillas» (spec 47). El permiso existe desde ya; la opción de menú llega con su ruta.
- Editar o crear plantillas base desde la consola de plataforma: las base se siembran por migración, como hasta ahora.
- Crear códigos nuevos desde el tenant: solo se personalizan códigos que ya tienen base (precondición de TR-RF-074).
- Plantillas de los eventos de plataforma (spec 44) y de productos.
- Canales SMS, WhatsApp y PUSH, el contador de segmentos (TR-CA-186) y la aprobación de Meta (TR-RN-026, spec 104).
- Plantillas en otros idiomas.
- Editor WYSIWYG, layout de marca del tenant e imágenes adjuntas.

## Base de código reutilizada

| Pieza | Qué se hace |
| --- | --- |
| `ntf.plantilla`, `PlantillaEntidad`, `RepositorioPlantillasTypeOrm` (spec 42) | Se amplía el repositorio con lectura de la base, lista, historial, inserción de versión y desactivación. `vigente` no cambia. |
| `renderizador-plantilla.ts` | La vista previa usa `renderizar` tal cual; se agrega aparte la validación de marcadores del texto. |
| `seguridad` (`@Permiso`), `auditoria` (`@Auditable`) | Autorización y auditoría del `PUT` y del `DELETE`. |
| `kernel` / `kernel-infra` (`UnitOfWork`, `TenantContext`, `Clock`, `uuidV7`) | Transacción e ids. |
| `catalogos` (spec 19e, ítems propios con bloqueo optimista) | Patrón del `PUT` con `version` y del 409 `VERSION_OBSOLETA`. |
| Manifiesto y su CLI (specs 06, 49) | Permisos nuevos y versión `1.27.0`. |

## Modelo de datos

### Migración `db/01q_not_plantillas.sql` (+ `db/rollback/01q_not_plantillas.sql`, `db/tests/01q_not_plantillas.test.sql`)

```sql
ALTER TABLE ntf.plantilla
  ADD COLUMN creado_por uuid;                                  -- NULL en las base (semilla)

-- Una sola versión activa por tenant, código, canal e idioma.
CREATE UNIQUE INDEX uq_plantilla_activa_tenant
  ON ntf.plantilla (tenant_id, codigo, canal, idioma)
  WHERE tenant_id IS NOT NULL AND activa;

-- Ejemplos para la vista previa en la base existente.
UPDATE ntf.plantilla
   SET variables = '[{"nombre":"nombre","tipo":"texto","ejemplo":"María Quispe"},
                     {"nombre":"producto","tipo":"texto","ejemplo":"SazónPOS"}]'
 WHERE tenant_id IS NULL AND codigo = 'PRUEBA_CORREO';
```

- Las políticas RLS del 42 no cambian: el tenant inserta y desactiva solo filas suyas; las base solo cambian por migración.
- Inverso: quita el índice y la columna y deja las variables de `PRUEBA_CORREO` sin `ejemplo`. Se niega si hay filas con `tenant_id` no nulo: quitar `creado_por` perdería el autor de cada versión personalizada.
- Prueba SQL: dos versiones activas del mismo tenant y código fallan; dos tenants con su versión activa conviven; un tenant no ve ni modifica la personalización de otro; el tenant no puede actualizar una fila base.

### Dominio (`libs/plataforma/notificaciones/src/domain/`)

- `plantilla.ts`: `VariableDeclarada` suma `ejemplo?: string`. `OrigenPlantilla = 'BASE' | 'PERSONALIZADA'`.
- `marcadores-plantilla.ts`: `marcadoresUsados(texto)` (misma expresión `MARCADOR` del renderizador, extraída a una constante compartida) y `exigirMarcadoresDeclarados(textos, declaradas)` → `VariableNoPermitidaError` con los nombres no declarados.
- `personalizacion-plantilla.ts`: `nuevaVersionPersonalizada(base, vigenteDelTenant, contenido, contexto)`: copia código, canal, idioma y variables de la base; `version` = mayor versión del tenant para ese código + 1 (o 1); `plantillaBaseId` = id de la base; valida asunto (1 a 150, una línea) y cuerpo (1 a 100 000) y los marcadores. Recibe el cuerpo ya saneado.
- `valores-ejemplo.ts`: `valoresDeEjemplo(variables)`: `ejemplo` declarado o, si falta, `[nombre]`.
- `errores.ts` suma `PlantillaBaseNoEncontradaError` (`NotFoundError`, `PLANTILLA_NO_ENCONTRADA`), `ContenidoPlantillaInvalidoError` (`CONTENIDO_PLANTILLA_INVALIDO`), `VersionObsoletaPlantillaError` (`VERSION_OBSOLETA`), `SinPersonalizacionError` (`SIN_PERSONALIZACION`). `VariableNoPermitidaError` responde 400 `VARIABLE_NO_PERMITIDA` con `variables: string[]` en el cuerpo del error, para que la UI marque el campo.
- `permisos-not.ts`: `PERMISOS_PLANTILLAS = { consultar: 'plat.plantilla_notificacion.consultar', gestionar: 'plat.plantilla_notificacion.gestionar' }`.

### Puertos (`application/ports/`)

```ts
export interface SaneadorHtml {
  /** Quita etiquetas y atributos fuera de la lista blanca; conserva `{{variable}}` en texto y en href. */
  sanear(html: string): string;
}

export interface RepositorioPlantillas {
  vigente(codigo: string, canal: CanalNotificacion, idioma: string): Promise<Plantilla | null>;          // del 42, sin cambios
  base(codigo: string, canal: CanalNotificacion, idioma: string): Promise<Plantilla | null>;             // la base activa de mayor versión
  vigenteDelTenant(codigo: string, canal: CanalNotificacion, idioma: string): Promise<Plantilla | null>;
  mayorVersionDelTenant(codigo: string, canal: CanalNotificacion, idioma: string): Promise<number>;      // 0 si no hay, activas o no
  listar(filtro: { canal?: CanalNotificacion; texto?: string; pagina: number; tamano: number }): Promise<Pagina<ResumenPlantilla>>;
  versiones(codigo: string, canal: CanalNotificacion, idioma: string): Promise<Plantilla[]>;             // del tenant, de mayor a menor
  /** Desactiva la vigente del tenant e inserta la nueva; conflicto del índice → VersionObsoletaPlantillaError. */
  guardarVersion(nueva: Plantilla, versionEsperada: number | null): Promise<void>;
  /** Pone activa = false en todas las del tenant; devuelve cuántas desactivó. */
  desactivarPersonalizacion(codigo: string, canal: CanalNotificacion, idioma: string): Promise<number>;
}
```

`ResumenPlantilla`: `{ codigo, canal, idioma, origen, version, asunto, actualizadoEn }`, una fila por código: la personalizada vigente si existe, si no la base.

### Casos de uso (`application/`)

- `ListarPlantillas({ canal?, q?, pagina, tamano })`: resúmenes paginados (q busca en código y asunto, sin distinguir mayúsculas).
- `ConsultarPlantilla(codigo, canal)`: vigente para el tenant con `origen`, asunto, cuerpo, variables (nombre, tipo, ejemplo), `version` (de la personalizada, `null` si rige la base) y además asunto y cuerpo de la base, para que la UI muestre o compare la original. Sin base → `PlantillaBaseNoEncontradaError`.
- `ListarVersionesPlantilla(codigo, canal)`: historial del tenant (versión, activa, creado por, creado en), sin cuerpo.
- `PersonalizarPlantilla(codigo, canal, { asunto, cuerpo, version })`, en una transacción: base existente; `version` debe ser la de la personalizada vigente (o `null` si no hay); si no → `VersionObsoletaPlantillaError`. Sanea el cuerpo, valida con `nuevaVersionPersonalizada` y guarda. Responde la vista de la nueva versión con el cuerpo saneado (la UI ve qué quitó el saneador). Audita (`antes`: versión anterior o base; `despues`: versión nueva; sin cuerpos completos, solo versión y largo).
- `VistaPreviaPlantilla(codigo, canal, { asunto?, cuerpo? })`: sin transacción de escritura. Usa el texto recibido (saneado y validado como en el `PUT`) o el vigente, y `renderizar` con `valoresDeEjemplo`. Devuelve `{ asunto, cuerpoHtml }`. No inserta mensaje ni llama al proveedor.
- `RestaurarPlantillaBase(codigo, canal)`, en una transacción: `desactivarPersonalizacion`; 0 filas → `SinPersonalizacionError`. Audita.

### HTTP (`interface/plantillas.controller.ts`, DTO y OpenAPI, bajo `/v1/notificaciones/plantillas`)

| Método y ruta | Permiso | Respuestas |
| --- | --- | --- |
| `GET /?canal=&q=&pagina=&tamano=` | `consultar` | 200 página de resúmenes. |
| `GET /{codigo}/{canal}` | `consultar` | 200 detalle; 404 `PLANTILLA_NO_ENCONTRADA`. |
| `GET /{codigo}/{canal}/versiones` | `consultar` | 200 historial. |
| `POST /{codigo}/{canal}/vista-previa` | `consultar` | 200 `{ asunto, cuerpoHtml }`; 400 `VARIABLE_NO_PERMITIDA`, `CONTENIDO_PLANTILLA_INVALIDO`. |
| `PUT /{codigo}/{canal}` | `gestionar` | 200 nueva versión; 400 `VARIABLE_NO_PERMITIDA`, `CONTENIDO_PLANTILLA_INVALIDO`; 404; 409 `VERSION_OBSOLETA`. |
| `DELETE /{codigo}/{canal}/personalizacion` | `gestionar` | 204; 404 `SIN_PERSONALIZACION`. |

- `canal` en la ruta: solo `CORREO`; otro → 400 `CANAL_NO_HABILITADO` (error del 42).
- Ningún permiso es sensible (sin aal2): no hay secretos ni datos personales en las plantillas.

### Infraestructura

- `sanitize-html/saneador-html.sanitize.ts`: adaptador de `SaneadorHtml` (versión y opciones por ctx7 al implementar). Lista blanca: `p br strong b em i u a ul ol li h1 h2 h3 table thead tbody tr td th span div hr`; atributos `href` (esquemas `https`, `mailto`), `style` en celdas y bloques solo con propiedades de texto y color; sin `script`, `iframe`, `img`, eventos `on*` ni `javascript:`. Constantes con nombre. Si el saneador codifica `{{...}}` dentro de `href`, se protege el marcador antes y se restaura después; lo cubre una prueba.
- `typeorm/plantillas.repositorio.ts`: métodos nuevos con `QueryBuilder` sobre el `EntityManager` activo; `guardarVersion` desactiva y luego inserta en la misma transacción y traduce la violación de `uq_plantilla_activa_tenant` o `uq_plantilla_version` a `VersionObsoletaPlantillaError`. La lista por código (personalizada o base) se arma con dos consultas y unión en memoria si el `QueryBuilder` no lo expresa limpio; sin SQL crudo.
- `PlantillaEntidad` y mapeo: `creadoPor`, `ejemplo` en variables.

### Composición

- `NotificacionesModule.register()` suma `PlantillasController`, los casos de uso y `SaneadorHtml`. El worker no cambia.
- `plat.manifiesto.json` `1.26.0` → `1.27.0`: permisos `plat.plantilla_notificacion.consultar` («Ver plantillas de notificación», `TENANT`, no sensible) y `plat.plantilla_notificacion.gestionar` («Personalizar plantillas de notificación», `TENANT`, no sensible); los dos en `PLAT_PROPIETARIO`. Se aplica con el CLI del manifiesto.
- `package.json`: `sanitize-html` y `@types/sanitize-html`.
- `src/index.ts`: `PERMISOS_PLANTILLAS` y los errores nuevos, por ruta explícita.

## Plan de implementación

1. **Migración.** `01q_not_plantillas.sql`, inverso y prueba SQL (índice de activa única, aislamiento, base inmutable para el tenant, inverso que se niega con personalizaciones).
2. **Dominio.** `marcadores-plantilla`, `personalizacion-plantilla`, `valores-ejemplo` y errores, con pruebas: `{{diagnostico}}` no declarada, `{{ nombre }}` con espacios aceptada, asunto con salto de línea, versión 1 y n+1 tras restaurar.
3. **Saneador.** Adaptador `sanitize-html` (ctx7 antes de escribir) con pruebas: `<script>`, `onclick`, `javascript:` en `href`, `{{enlace}}` en `href` conservado, tabla con estilos simples conservada.
4. **Persistencia.** Métodos del repositorio y mapeo. Integración: dos `PUT` concurrentes con la misma `version` dejan una sola versión nueva y el otro recibe 409; restaurar y volver a personalizar numera bien; aislamiento.
5. **Casos de uso y HTTP.** Los seis casos de uso, controlador, DTO, OpenAPI, `@Permiso`, `@Auditable`; manifiesto `1.27.0`.
6. **Cierre.** `code-simplifier` sobre los archivos tocados; `pnpm db:up:remoto` y el CLI del manifiesto en Supabase dev; humo con la API local: personalizar `PRUEBA_CORREO` en un tenant de dev, vista previa, `notificaciones:probar:remoto` que llega con el texto personalizado, restaurar y probar otra vez con la base; `npx nx run-many -t lint test -p notificaciones api migrar seguridad`.

## Criterios de aceptación

- [ ] TR-CA-184 (adaptado a `PRUEBA_CORREO`): el tenant personaliza el cuerpo con un texto propio; el siguiente `enviar` de ese tenant usa la versión personalizada y otro tenant sigue recibiendo la base.
- [ ] TR-CA-185: `PUT` o vista previa con `{{diagnostico}}` (no declarada) → 400 `VARIABLE_NO_PERMITIDA` con «Variable no permitida: diagnostico» y `variables: ["diagnostico"]`; no se guarda versión.
- [ ] Cada `PUT` crea una fila nueva con `version` + 1 y desactiva la anterior; el historial lista todas; nunca hay dos activas del mismo tenant y código (índice y prueba SQL).
- [ ] `PUT` con `version` que no es la vigente (también dos `PUT` concurrentes) → 409 `VERSION_OBSOLETA` para el perdedor.
- [ ] Restaurar desactiva las versiones del tenant: `GET` muestra `origen: BASE`, el siguiente envío usa la base y la base no cambió. Restaurar sin personalización → 404 `SIN_PERSONALIZACION`.
- [ ] TR-RNF-012: un cuerpo con `<script>`, `onclick` o `href="javascript:..."` se guarda sin ellos y la respuesta devuelve el cuerpo saneado; `{{nombre}}` en texto y en `href` sobrevive al saneo.
- [ ] La vista previa devuelve asunto y cuerpo con los valores de ejemplo, no inserta en `ntf.mensaje` ni llama al proveedor.
- [ ] Asunto vacío, de más de 150 caracteres o con salto de línea, o cuerpo vacío → 400 `CONTENIDO_PLANTILLA_INVALIDO`. Código sin base → 404. Canal distinto de CORREO → 400 `CANAL_NO_HABILITADO`.
- [ ] Sin `plat.plantilla_notificacion.consultar` → 403 en las lecturas; sin `gestionar` → 403 en `PUT` y `DELETE`.
- [ ] Aislamiento (TR-RNF-010): un tenant no ve ni restaura la personalización de otro; la prueba SQL con dos `app.tenant_id` lo cubre; el tenant no puede modificar filas base.
- [ ] `PUT` y `DELETE` dejan fila en `aud` con versión antes y después (TR-RNF-013), sin el cuerpo completo.
- [ ] Manifiesto `1.27.0` aplicado en dev: `PLAT_PROPIETARIO` tiene los dos permisos.
- [ ] OpenAPI documenta las seis rutas con sus códigos de error.
- [ ] Migración `01q_not_plantillas` reversible y probada en CI contra PostgreSQL 16.
- [ ] Cobertura de dominio de `notificaciones` ≥ 70 %.
- [ ] El código nuevo sigue la sección «Código limpio» de `CLAUDE.md`; persistencia con TypeORM, sin SQL crudo nuevo.
- [ ] `npx nx run-many -t lint test -p notificaciones api migrar seguridad` verde; `nx affected` verde en el CI del PR.

## Decisiones

- **Sí:** cuerpo en HTML saneado en el servidor con `sanitize-html`. Decisión del usuario. No cambia el renderizador ni la base sembrada; la UI del 47 decide el editor.
- **No:** Markdown con layout fijo ni texto plano. Obligaban a migrar la base y a cambiar el renderizador.
- **Sí:** permisos `plat.plantilla_notificacion.consultar` y `.gestionar`, no sensibles. Decisión del usuario. El `plat.notificacion.plantilla` del SRS no sigue `producto.recurso.accion`; se cita su ID en la descripción del manifiesto.
- **Sí:** cada `PUT` inserta una versión y restaurar desactiva. Decisión del usuario. Nunca se borra: `ntf.mensaje.plantilla_id` apunta a la versión usada y el asunto y cuerpo enviados ya están en el mensaje.
- **Sí:** historial de versiones por API, sin cuerpo. Decisión del usuario.
- **Sí:** el bloqueo optimista usa el número de versión de la personalizada vigente, no una columna `version` aparte. La fila es inmutable salvo `activa`; el índice parcial de activa única resuelve la carrera.
- **Sí:** las variables se copian de la base y el tenant no las edita. Quien declara las variables es el producto o la plataforma (precondición de TR-RF-074); así TR-CA-185 se cumple al guardar y al enviar.
- **Sí:** `ejemplo` dentro de `variables` jsonb, sin columna nueva. Es metadato de la variable y no cambia el DDL.
- **Sí:** solo CORREO e idioma `es`. Son los únicos habilitados en R2.
- **No:** opción de menú en el manifiesto. Apuntaría a una ruta que no existe hasta el spec 47.
- **No:** permisos sensibles con aal2. Las plantillas no tienen secretos ni datos personales.
- **Sí:** `07` del roadmap se cita como spec 06 (el 07 se implementó dentro del 06).
- **Sí:** migración `01q` (el spec 50, en paralelo, usa `01r`).

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| `sanitize-html` codifica las llaves de `{{enlace}}` dentro de `href` | Proteger y restaurar el marcador alrededor del saneo, con prueba dedicada en el paso 3. |
| El saneo quita estilos que el cliente de correo necesita y el correo se ve pobre | Lista blanca de `style` con propiedades de texto y color; la respuesta del `PUT` y la vista previa muestran lo que quedó. Ajustes de la lista sin cambio de API. |
| Las ramas paralelas 43 y 50 chocan en `package.json`, la letra de migración o el manifiesto | Solo el 43 cambia el manifiesto; las letras son `01q` (43) y `01r` (50); `package.json` son líneas distintas. El segundo PR se rebasa sobre el primero. |
| La personalización deja de funcionar si una base cambia de variables en una migración futura | Las variables de la versión del tenant son una copia; una migración que cambie variables de una base debe revisar las personalizaciones (se anota en el spec 44, que agrega bases). |

## Lo que **no** entra en este spec

- UI de plantillas y menú (spec 47).
- Edición de bases desde la consola y códigos nuevos por tenant.
- Plantillas de eventos de plataforma (spec 44).
- SMS, WhatsApp, PUSH, segmentos y aprobación de Meta (spec 104).
- Otros idiomas, WYSIWYG, layout de marca e imágenes.

Cada uno, si llega, va en su propio spec.
