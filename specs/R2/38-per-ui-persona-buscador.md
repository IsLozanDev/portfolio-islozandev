# SPEC 38 — Personas: buscador con búsqueda por texto, fonética y documento, alta rápida y ficha en admin

> **Status:** Aprobado
> **Depends on:** SPEC 31, SPEC 32, SPEC 37, SPEC 13, SPEC 15, SPEC 15b, SPEC 15c, SPEC 15d, SPEC 17c, SPEC 19a, SPEC 19b
> **Date:** 2026-11-23
> **Objective:** Dar a TR-PER una búsqueda de personas del tenant por nombre (sin tildes, con tolerancia a errores y fonética del español), documento, celular o correo, con filtros por rol y producto, y sobre ella crear `libs/plataforma/personas-ui` con `vit-persona-buscador` (un campo inteligente que encuentra, prellena desde TR-IDN y da de alta en el panel lateral) y la lista y la ficha de personas en `admin-cliente` (datos básicos, contactos, direcciones con ubigeo, roles y consentimientos).

## Por qué existe este spec

Fila 38 de `docs/roadmap-specs.md` (UI de TR-RF-039 y 041, componente `<ui-persona-buscador>` de la hoja Componentes del SRS). Contexto: `docs/spec-context/tr-per/per-registro-roles-contactos.md`, partición C. Los specs 31 y 32 dejaron el back de registro, roles, contactos y direcciones; el 31 dejó aquí la búsqueda por nombre y el listado paginado, y el 37 la vista de decisiones de consentimiento en la ficha.

El roadmap da 8 h. El usuario pidió una búsqueda sofisticada (texto sin tildes y en cualquier orden, tolerancia a errores, fonética, documento, celular, correo, filtros por rol y producto), asignar rol y ver consentimientos desde la ficha, y diseño previo en el canvas. Estimado: 14 h. El usuario decidió no partirlo (ver Decisiones). Orden de recorte si se pasa: (1) vista de consentimientos, (2) asignar rol desde la ficha, (3) filtros por rol y producto en la lista; lo recortado pasa a un 38b.

Lo que hay en el código hoy (revisado al redactar):

- `libs/plataforma/personas` (31, 32, 37): `GET /v1/personas/busqueda?tipo=&numero=` (`plat.persona.leer`; `{ encontrada: true, persona }` o `{ encontrada: false, prellenado, aviso? }`, consulta IDN solo con `plat.persona.registrar`), `POST /v1/personas` (409 `PERSONA_DUPLICADA` con `persona_id`), `GET /v1/personas/{id}` (con `version`, `roles`, `contactos`, `direcciones`), `PATCH /v1/personas/{id}`, `POST /v1/personas/{id}/roles` (422 `PRODUCTO_NO_SUSCRITO`), contactos y direcciones (`POST`, `PATCH` con `version`, `DELETE ?version=` con 204), `GET /v1/personas/{id}/consentimientos` (`plat.persona.leer`). No hay listado ni búsqueda por texto.
- `SuscripcionesDelTenant` de PER solo tiene `estaVigente(producto)`. No hay ruta del tenant que liste sus productos suscritos (las de `org/tenants` son de la consola).
- Esquema `per`: `per.persona` (`nombres`, `apellido_paterno`, `apellido_materno`, `razon_social`, `numero_documento`, único `(tenant_id, tipo_documento, numero_documento)`), `per.persona_rol`, `per.contacto`, `per.direccion`, tablas de consentimiento. Ninguna migración del repo crea extensiones. Última migración de PER: `01l_per_contactos.sql` / `01l_per_consentimientos.sql`.
- `GET /v1/catalogos/{codigo}/items` (`plat.catalogo.leer`): todos los ítems vigentes visibles, con `ETag` y `304`. `UBIGEO` trae el distrito en `nombre` y `departamento` y `provincia` en atributos, en mayúsculas.
- `libs/shared/util`: `validarDocumento`, `validarCelular`, `validarCorreo`, `validarTelefonoFijo`, `validarWhatsapp` (`scope:shared`, `type:util`).
- `libs/plataforma/archivos-ui` (36): molde de lib `type:feature` con `models/`, `services/*.cliente.ts`, `components/`; usa `shared/auth` y `shared/ui`.
- `libs/plataforma/admin-cliente`: páginas `*-lista` y `*-detalle`, `utils/filtro-url-*.ts` (`paginaDesdeUrl`, `tamanoDesdeUrl`), `ADMIN_CLIENTE_ROUTES` con `permisoGuard`.
- Manifiesto `plat.manifiesto.json` 1.25.0, sin opción de menú de personas.

RF cubiertos (UI): **TR-RF-039**, **TR-RF-040** (asignación desde la ficha), **TR-RF-041**. Búsqueda: añadido de este spec, sin RF propio (la hoja Componentes pide `PersonaPort.buscar` y el componente buscador).

Criterios del SRS en pantalla: **TR-CA-100**, **101**, **102**, **103**, **104**, **105**, **106** y **TR-CA-121** («el formulario habilita el ingreso manual» cuando IDN no responde, dejado aquí por el 30).

Reglas: **TR-RN-001** (todo por tenant), **TR-RN-002** (formato de DNI y RUC antes de consultar), **TR-RN-006** (solo productos suscritos).

RNF propios:

- **TR-RNF-001**: búsqueda p95 < 800 ms; objetivo de este spec < 300 ms con 50 000 personas en el tenant.
- **TR-RNF-018**: 360, 600 y 1280 px.
- **TR-RNF-019**: axe-core sin `critical` ni `serious` en lista, ficha y buscador.
- **TR-RNF-026** y **111**: ni el texto buscado ni el documento en los logs.
- **TR-RNF-122**: solo tokens.

RNF heredados: 010, 012, 024/119, 101.

Historias del backlog: ninguna propia (el plan 6.1 no lista pantallas de personas; R2-01 es solo back).

## Alcance

**Entra:**

- Back (`libs/plataforma/personas`):
  - Migración `db/01l_per_busqueda.sql`: extensiones `unaccent` y `pg_trgm`, funciones `per.normalizar_busqueda` y `per.clave_fonetica`, columnas generadas de búsqueda en `per.persona` e índices.
  - `GET /v1/personas?q=&tipo_persona=&producto=&rol=&pagina=&tamano=` (`plat.persona.leer`): listado paginado del tenant con búsqueda por nombres, apellidos, razón social (sin tildes, palabras en cualquier orden, tolerancia a errores y fonética), número de documento (prefijo), celular (prefijo) y correo (prefijo), con filtros y orden por relevancia.
  - `GET /v1/personas/productos-suscritos` (`plat.persona.rol`): productos con suscripción vigente del tenant, para el formulario de asignar rol.
- Diseño previo en el canvas «Vitrina · Diseño UI», página «38 · Personas».
- Lib nueva `libs/plataforma/personas-ui` (`scope:plataforma`, `type:feature`):
  - `vit-persona-buscador`: un campo que clasifica lo escrito (DNI, RUC, número, correo o texto), busca exacto por documento con prellenado de TR-IDN, sugiere mientras se escribe y ofrece el alta.
  - `vit-persona-alta`: formulario de registro en el panel lateral, prellenado o a mano.
  - Piezas de la ficha: datos básicos, contactos, direcciones (con `vit-ubigeo-autocompletar`), roles (lista y asignar) y consentimientos (solo lectura).
- `admin-cliente`: páginas `personas-lista` y `persona-detalle`, rutas `personas` y `personas/:personaId`.
- Manifiesto: opción de menú «Personas» en Organización (`/admin/personas`, `plat.persona.leer`).
- Verificación con Playwright en tema claro, oscuro, 600 px y 360 px.

**No entra (specs futuros):**

- `PersonaPort.buscar` para consumidores en proceso: con el primer producto que lo pida (SazónPOS lo integra en R2-12 por HTTP).
- Registrar o revocar consentimientos y gestionar textos por finalidad → `per-textos-finalidad-ui` (opcional).
- Subir archivos o evidencias desde la ficha.
- Duplicados y fusión (39 y 40). Personas sin documento.
- Cerrar o quitar roles.
- Búsqueda por dirección, ubigeo, fecha o rango de alta.
- Exportar la lista.
- Integrar el buscador en SazónPOS (R2-12) o en otros productos.
- Nombres de producto legibles (la UI muestra el código: `CLI`, `GYM`).

## Base de código reutilizada

| Pieza | Qué se hace |
| --- | --- |
| `personas` (controladores, `PersonasFiltro`, `validar`, `RepositorioPersonasTypeOrm`, `SuscripcionesDelTenant`, `vista-persona.ts`) | Se amplía: caso de uso `BuscarPersonas`, método de lectura `buscar` en un adaptador de consulta, `listarVigentes` en `SuscripcionesDelTenant`, dos rutas. Los contratos existentes no cambian. |
| `db/01l_per*.sql` | No se tocan. Lo nuevo va en `01l_per_busqueda.sql`. |
| `catalogos` (`GET /v1/catalogos/UBIGEO/items` con `ETag`) | Se consume desde el autocompletar. Sin cambios. |
| `shared/util` (`validarDocumento`, `validarCelular`, `validarCorreo`, `validarTelefonoFijo`, `validarWhatsapp`) | Sin cambios. `personas-ui` usa copias comentadas en `utils/` (ver Decisiones); el servidor valida con los originales. |
| `shared/ui` (`vit-tabla`, `vit-filtros`, `vit-chip-estado`, `vit-estado-vacio`, `vit-cargando`, `vit-acciones-formulario`, `PanelLateralService`, `AvisosService`, `MensajeValidacionPipe`, `vit-destructivo`) | Lista, tablas de la ficha, paneles y confirmaciones. |
| `shared/auth` (`SesionService`, `CONFIG_AUTH`, `SiPermisoDirective`, `permisoGuard`) | URL de la API y acciones ocultas sin permiso. |
| `archivos-ui` | Molde de estructura de lib `type:feature`. |
| `admin-cliente` (`filtro-url-organizacion.ts`, páginas `*-lista`/`*-detalle`, `provide-fecha-peru.ts`) | Molde de lista con estado en URL y de detalle; fechas en hora de Lima. |

## Modelo de datos

### Migración `db/01l_per_busqueda.sql` (+ `db/rollback/01l_per_busqueda.sql`, `db/tests/01l_per_busqueda.test.sql`)

```sql
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_trgm  WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS btree_gin WITH SCHEMA extensions;

-- minúsculas, sin tildes ni diéresis (ñ → n), solo letras, dígitos y un espacio entre palabras
CREATE FUNCTION per.normalizar_busqueda(texto text) RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE SECURITY DEFINER SET search_path = ''
  AS $$ SELECT btrim(regexp_replace(lower(extensions.unaccent('extensions.unaccent'::regdictionary, coalesce(texto, ''))), '[^a-z0-9]+', ' ', 'g')) $$;

-- clave fonética del español de Perú, palabra por palabra, sobre texto ya normalizado
CREATE FUNCTION per.clave_fonetica(texto_normalizado text) RETURNS text
  LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE AS $$ ... $$;

ALTER TABLE per.persona
  ADD COLUMN busqueda_texto text GENERATED ALWAYS AS (per.normalizar_busqueda(
    coalesce(nombres, '') || ' ' || coalesce(apellido_paterno, '') || ' ' || coalesce(apellido_materno, '') || ' ' ||
    coalesce(razon_social, ''))) STORED,
  ADD COLUMN busqueda_fonetica text GENERATED ALWAYS AS (per.clave_fonetica(per.normalizar_busqueda(...mismo texto...))) STORED;

CREATE INDEX ix_persona_busqueda_texto    ON per.persona USING gin (tenant_id, busqueda_texto extensions.gin_trgm_ops);
CREATE INDEX ix_persona_busqueda_fonetica ON per.persona USING gin (tenant_id, busqueda_fonetica extensions.gin_trgm_ops);
CREATE INDEX ix_persona_documento_prefijo ON per.persona (tenant_id, numero_documento text_pattern_ops);
CREATE INDEX ix_contacto_valor_prefijo    ON per.contacto (tenant_id, lower(valor) text_pattern_ops);
```

Reglas de `per.clave_fonetica` (se aplican en este orden a cada palabra; las palabras se unen con un espacio):

| # | Regla | Ejemplo |
| --- | --- | --- |
| 1 | `qu` + e/i → `k`; `gu` + e/i → `g` (esa g no pasa a `j` en la regla 6) | Quispe → kispe; Guillén → giyen |
| 2 | `hu`, `gu` o `wu` + vocal → `w`; `w` → `w` | Huamán, Guamán, Wamán, Wuamán → waman |
| 3 | `ch` → `x` (marca interna) | Chávez → xabes |
| 4 | `ll` → `y`; `y` final o antes de consonante → `i` | Llerena → yerena; Montoya → montoya; Rey → rei |
| 5 | `c` + e/i → `s`; `z` → `s`; `c`, `q`, `k` restantes → `k` | Cruz → krus; Cecilia → sesilia |
| 6 | `g` + e/i → `j` | Gimena → jimena |
| 7 | `v` → `b` | Valdivieso → baldibieso |
| 8 | `h` restante se elimina | Hernández → ernandes |
| 9 | `n` antes de `b` o `p` → `m` | Canpos → kampos |
| 10 | letras dobles seguidas → una (`rr`, `ss`, `cc` ya resuelta, `nn`, `ll` ya resuelta) | Carrasco → karasko |

Valdivieso y Baldiviezo dan `baldibieso`; Jiménez y Gimenes dan `jimenes`; Quispe y Kispe dan `kispe`. Los dígitos se conservan. La función tiene su prueba SQL con estos pares.

- Sin `concat_ws`: es `STABLE` y la expresión de una columna generada debe ser `IMMUTABLE` (hallazgo al implementar).
- `normalizar_busqueda` es `SECURITY DEFINER`: sin eso, todo rol que escribe en `per.persona` necesitaría `USAGE` sobre `extensions` (las pruebas SQL de 01l_per y 01l_per_contactos fallaban con su rol de prueba). Es pura y con `search_path` vacío.
- Las columnas generadas no se mapean en `PersonaEntidad`: el repositorio de escritura no las conoce y la base las mantiene.
- `extensions` es el esquema de extensiones de Supabase; en el PostgreSQL 16 de CI se crea si no existe. El rol de la API recibe `USAGE` sobre `extensions` si no lo tiene.
- GIN con `tenant_id` (por `btree_gin`): con índices solo de trigramas, en un tenant de 50 000 personas el planificador usaba el índice por tenant y filtraba fila por fila (430 ms en PGlite); con el compuesto combina los tres índices y baja a 52 ms (hallazgo al implementar).
- Inverso: borra los cuatro índices, las dos columnas y las dos funciones. **No** borra las extensiones (pueden tener otros usos; ver Decisiones).
- RLS y privilegios de `per` no cambian.

### Back: búsqueda (`application/buscar-personas.ts`, `application/ports/consulta-personas.ts`)

```ts
export const TAMANO_PAGINA_PERSONAS = { porDefecto: 20, maximo: 50 } as const;
export const LONGITUD_MINIMA_TEXTO = 3;
export const LONGITUD_MINIMA_NUMERO = 4;
export const UMBRAL_SIMILITUD = 0.35;

export type ClaseConsulta = 'NUMERO' | 'CORREO' | 'TEXTO';

export interface CriteriosBusquedaPersonas {
  q?: string;
  tipoPersona?: TipoPersona;
  producto?: ProductoCodigo;
  rol?: RolPersona;
  pagina: number;
  tamano: number;
}

export interface PersonaListada {
  id: string;
  tipoPersona: TipoPersona;
  tipoDocumento: TipoDocumentoPersona;
  numeroDocumento: string;
  denominacion: string;                 // «Quispe Mamani, Juana» o la razón social
  celularPrincipal: string | null;
  correoPrincipal: string | null;
  roles: { productoCodigo: ProductoCodigo; rol: RolPersona }[];
  coincidencia: 'DOCUMENTO' | 'CONTACTO' | 'NOMBRE' | null;   // null sin q
}

export interface ConsultaPersonas {        // adaptador de lectura, fuera del agregado
  buscar(criterios: CriteriosBusquedaPersonas & { clase: ClaseConsulta | null; normalizado: string | null }):
    Promise<{ items: PersonaListada[]; total: number }>;
}
```

`BuscarPersonas.ejecutar(criterios)`:

1. Recorta `q`. Vacío → sin filtro de texto, orden por `denominacion`.
2. Clasifica: solo dígitos (con espacios o guiones quitados) → `NUMERO` (mínimo 4); contiene `@` → `CORREO`; el resto → `TEXTO` (mínimo 3 caracteres tras normalizar). Más corto → 422 `CONSULTA_MUY_CORTA`.
3. `producto` sin `rol` o `rol` sin `producto` se admiten por separado; ambos filtran por un rol vigente (`hasta IS NULL`).
4. `tamano` fuera de 1..50 → 400 `SOLICITUD_INVALIDA`.

`ConsultaPersonasTypeOrm.buscar` (QueryBuilder sobre el `EntityManager` de una transacción de lectura, filtro por `tenant_id` del contexto además de la RLS):

- `NUMERO`: `numero_documento LIKE :q%` **o** existe un `per.contacto` CELULAR, FIJO o WHATSAPP con `lower(valor) LIKE :q%` (WhatsApp también sin el `+`). Orden: documento exacto, documento por prefijo, contacto, luego `denominacion`.
- `CORREO`: existe un `per.contacto` CORREO con `lower(valor) LIKE :q%`.
- `TEXTO`: cada palabra de la consulta normalizada debe coincidir con la persona por al menos una vía: `busqueda_texto LIKE %palabra%`, `word_similarity(palabra, busqueda_texto) >= UMBRAL_SIMILITUD` o `clave_fonetica(palabra)` contenida como palabra en `busqueda_fonetica`. Orden: suma por palabra de la mejor puntuación (contiene = 1; fonética = 0,9; similitud = su valor), luego `denominacion`.
- El total se cuenta con la misma condición; la página se lee con `LIMIT/OFFSET`.
- Las expresiones de `pg_trgm` y de las funciones `per.*` van como fragmentos de `QueryBuilder` con parámetros (nunca concatenando `q`). Es SQL crudo permitido por la regla 11 (funciones de base de datos) y queda encapsulado en este adaptador.
- Celular y correo principales y roles vigentes se leen en una segunda consulta por los ids de la página (sin N+1).

### Back: productos suscritos

`SuscripcionesDelTenant.listarVigentes(): Promise<ProductoCodigo[]>` (PRUEBA o ACTIVA, TR-RN-006) en el adaptador sobre ORG. Caso de uso `ListarProductosSuscritos`.

### HTTP (`interface/personas.controller.ts`, `personas.dto.ts`)

| Método y ruta | Permiso | Respuesta |
| --- | --- | --- |
| `GET /v1/personas?q=&tipo_persona=&producto=&rol=&pagina=&tamano=` | `plat.persona.leer` | 200 `{ items, total, pagina, tamano }` |
| `GET /v1/personas/productos-suscritos` | `plat.persona.rol` | 200 `[{ producto_codigo }]` |

- Ítem: `id`, `tipo_persona`, `tipo_documento`, `numero_documento`, `denominacion`, `celular_principal`, `correo_principal`, `roles[{ producto_codigo, rol }]`, `coincidencia`.
- Errores: 422 `CONSULTA_MUY_CORTA`; 400 `SOLICITUD_INVALIDA` (tamaño, página, `tipo_persona`, `producto` o `rol` fuera de su lista). OpenAPI completo.
- `productos-suscritos` se declara antes de `:id` en el controlador para que no la capture.
- El registro de peticiones HTTP enmascara `q` igual que `numero` de `/busqueda` (TR-RNF-026 y 111). Si el enmascarado es por lista de parámetros, se agrega `q`.

### Diseño de referencia

Canvas «Vitrina · Diseño UI» (https://claude.ai/artifact/UGvcmiWUiBsMuWerqMiWxh), página nueva «38 · Personas». Se diseña **antes** de escribir código de UI (paso 1 del plan). Artboards:

| Artboard | Qué fija |
| --- | --- |
| `PER-Buscador` (base editable) | `vit-persona-buscador`: campo, selector de tipo, sugerencias, tarjetas de resultado, textos y avisos |
| `PER-Buscador-estados` y `-oscuro` | Los 16 estados: vacío, muy corto, sugerencias por nombre, fonética, por celular, buscando, DNI registrado, DNI con RENIEC, RUC con SUNAT, CE a mano, RENIEC caído, cuota agotada, RUC inválido, sin resultados, selector abierto, sin permiso para registrar |
| `PER-Lista` (base editable) | Lista con buscador en modo lista, filtros de tipo, producto y rol, chips de rol, vacío y paginación |
| `PER-Lista-fonetica`, `-buscar`, `-oscuro`, `-600`, `-360` | «baldiviezo» encuentra Valdivieso; panel «Nueva persona» con DNI registrado y con datos de RENIEC (oscuro); 600 y 360 px |
| `PER-Alta-prellenada`, `-error`, `-manual`, `-aviso`, `-juridica`, `-duplicado`, `-360` | Panel de alta: prellenada, celular inválido, CE a mano, RENIEC caído, jurídica, duplicado (oscuro), 360 px |
| `PER-Ficha` (base editable) | Ficha: encabezado, datos básicos, contactos, direcciones, roles y consentimientos |
| `PER-Ficha-contacto`, `-direccion`, `-rol`, `-eliminar`, `-sin-catalogo`, `-oscuro`, `-600`, `-360` | Paneles de contacto (error de celular), dirección con ubigeo «cayma» y «miraflores» ambiguo (oscuro), asignar rol, confirmación de borrado, sin `plat.catalogo.leer` con aviso de versión obsoleta, 600 y 360 px |

Lo que fijó el diseño y no estaba arriba:

- Tras registrar, la lista muestra un aviso «Persona registrada: …» con «Abrir ficha».
- El alta muestra el documento bloqueado con el chip «Datos de RENIEC/SUNAT» y avisa que el prellenado es una sugerencia editable.
- La estrella rellena marca el principal; «Marcar principal» es una estrella vacía en la fila.
- En celular, las filas de contactos y direcciones llevan «Más acciones» (menú) en vez de tres botones.

| Pantalla | Pantalla tipo | Cambia en |
| --- | --- | --- |
| Lista de personas | Lista | El campo de `vit-filtros` es `vit-persona-buscador` en modo lista; filtros de tipo de persona, producto y rol; chip de coincidencia («Documento», «Contacto») |
| Ficha de persona | Detalle | Secciones apiladas con su tabla y acciones; encabezado con denominación, documento y chips de rol |
| Alta, datos básicos, contacto, dirección, asignar rol | Formulario en panel lateral | Sin cambios de patrón |
| Buscador | Ninguna (nuevo) | Campo con panel de sugerencias y tarjeta de resultado |

### Front: `libs/plataforma/personas-ui`

```
src/lib/
  models/      persona.ts (DTO y mapeos), solicitudes-persona.ts (cuerpos), busqueda.ts, error-personas.ts,
               mensajes-personas.ts, etiquetas-personas.ts, permisos-personas.ts, tonos-personas.ts,
               consentimiento.ts, ubigeo.ts
  services/    personas.cliente.ts, contactos.cliente.ts, direcciones.cliente.ts,
               consentimientos.cliente.ts, ubigeos.service.ts
  utils/       clasificar-entrada.ts, denominacion.ts, formato-ubigeo.ts, filtrar-ubigeos.ts, formato-contacto.ts,
               normalizar-texto.ts, solicitar.ts, validar-documento.ts y validar-contacto.ts (copias de shared/util)
  components/  persona-buscador/, persona-alta/, persona-datos-basicos/, persona-contactos/,
               persona-direcciones/, ubigeo-autocompletar/, persona-roles/, persona-consentimientos/
src/testing/   http-de-prueba.ts, persona-de-prueba.ts y, desde el paso 6, dobles de los clientes
```

- `clasificar-entrada.ts`: `clasificarEntrada(texto, tipoElegido?)` → `VACIA`, `CORTA` (con mensaje), `INVALIDA` (tipo, motivo y mensaje), `DOCUMENTO` (tipo y número: búsqueda exacta con prellenado) o `NUMERO` / `CORREO` / `TEXTO` (valor: búsqueda en el listado). Con tipo elegido manda el tipo; con DNI o RUC elegido, mientras faltan dígitos es `CORTA`. Sin tipo: 8 dígitos → DNI; 11 dígitos → RUC; otros dígitos (≥ 4) → `NUMERO`; con `@` → `CORREO`; texto ≥ 3 → `TEXTO`; lo demás → `CORTA`. Los documentos se validan con `validarDocumento`; inválido → mensaje con el motivo y sin llamada.
- `ubigeos.service.ts`: pide `GET /v1/catalogos/UBIGEO/items` una vez por sesión (el navegador revalida con `ETag`) y lo guarda en un signal. `filtrar-ubigeos.ts` busca por distrito, provincia o departamento sin tildes, máximo 20 opciones.
- `formato-ubigeo.ts`: `formatoUbigeo({ departamento, provincia, distrito }) → 'AREQUIPA / AREQUIPA / CAYMA'`, con el texto como está en el catálogo. Se usa en el autocompletar, en la tabla de direcciones y en la respuesta de la API.
- `denominacion.ts`: natural «Quispe Mamani, Juana»; jurídica la razón social.
- `tonos-personas.ts`: tonos de chip de rol (`info`) y de decisión de consentimiento (`ACEPTA` → `exito` «Acepta», `RECHAZA` → `neutro` «Rechaza», revocada → `advertencia` «Revocado»).
- `mensajes-personas.ts`: textos de error por código de la API (`PERSONA_DUPLICADA`, `CONTACTO_INVALIDO` con el mensaje de la API, `CELULAR_PRINCIPAL_OBLIGATORIO`, `UBIGEO_NO_VIGENTE`, `PRODUCTO_NO_SUSCRITO`, `VERSION_OBSOLETA`, `CONSULTA_MUY_CORTA`...) y de los avisos de IDN.

`vit-persona-buscador`:

| Entrada | Tipo | Uso |
| --- | --- | --- |
| `modo` | `'seleccion' \| 'lista'` | `seleccion` (por defecto): muestra sugerencias y emite la persona elegida. `lista`: solo emite el texto para que la página filtre |
| `permitirAlta` | `boolean` | Ofrece «Registrar» cuando no existe. Además exige `plat.persona.registrar` |
| `etiqueta` | `string` | Por defecto «Buscar por nombre, DNI, RUC, celular o correo» |

| Salida | Carga útil |
| --- | --- |
| `seleccionada` | `PersonaElegida` (`id`, `denominacion`, tipo y número de documento) |
| `registrar` | `PedidoAlta` (documento, prellenado o nulo, aviso de TR-IDN o nulo): el buscador no registra |
| `consulta` | `string` (modo lista, con espera de 300 ms) |

- Campo con `mat-autocomplete` (combobox accesible, flechas y Enter) y un selector compacto de tipo: «Auto», DNI, RUC, CE, Pasaporte.
- `DNI`, `RUC`, `CE`, `PASAPORTE`: al pulsar Enter o al completar 8 u 11 dígitos, `GET /v1/personas/busqueda`. Encontrada → tarjeta con denominación, documento y roles, y «Usar» (emite `seleccionada`). No encontrada con prellenado → «Registrar a Juana Quispe Mamani» abre el alta prellenada. Sin prellenado (CE o pasaporte) → «Registrar» abre el alta a mano. Con `aviso` → el mensaje del aviso («No se pudo consultar RENIEC/SUNAT: complete los datos a mano» o «Se agotó la cuota de consultas del mes») y «Registrar» a mano (TR-CA-121).
- `NUMERO`, `CORREO`, `TEXTO`: tras 300 ms sin teclear, `GET /v1/personas?q=&tamano=8`; sugerencias con denominación, documento, celular y la coincidencia. Una petición nueva cancela la anterior.
- Sin resultados: «No hay personas que coincidan» y, si es un documento válido, «Registrar».
- Estados de carga con `mat-progress-bar` dentro del campo; `aria-live` anuncia la cantidad de resultados.

`vit-panel-nueva-persona` (contenido del panel lateral; `PanelLateralService.abrir`, datos `{ etiquetaUsar? }`): paso «Nueva persona» con `vit-persona-buscador` y pie «Cancelar»; al `registrar` pasa al paso `vit-persona-alta` en el mismo panel. Cierra con `{ personaId, registrada }`: la persona elegida, la registrada o la que ya tenía el documento. Sin resultado: se canceló.

`vit-persona-alta` (paso del panel, `vit-acciones-formulario` en el pie):

- Entrada: `pedido` (`PedidoAlta`); el documento se muestra bloqueado. Salidas: `registrada`, `existente` (id de la persona duplicada), `volver` y `cancelar`. «Volver a la búsqueda» es un botón al inicio del cuerpo (`vit-panel-lateral` no tiene flecha en la cabecera).
- `tipo_persona` se deduce: RUC que empieza por 20 → JURIDICA (razón social); el resto → NATURAL (nombres, apellido paterno, apellido materno opcional). El prellenado se puede editar.
- Celular obligatorio (`validarCelular`, «El celular debe tener 9 dígitos e iniciar con 9»), correo opcional (`validarCorreo`).
- 201 → emite `registrada`. 409 `PERSONA_DUPLICADA` → «Ya existe una persona con ese documento en tu organización» con «Abrir su ficha» (por `persona_id`). Otro error → su mensaje sobre el formulario; los de formato se validan antes en el campo.

Ficha (piezas de `personas-ui`, compuestas en `persona-detalle` de `admin-cliente`):

- `persona-datos-basicos`: muestra tipo, documento y denominación; «Editar» (`plat.persona.editar`) abre el panel con `PATCH`.
- `persona-contactos`: `vit-tabla` (tipo, valor, principal con ícono `star`); «Agregar contacto», «Editar», «Marcar principal» y «Eliminar» (`vit-destructivo`, confirmación con `AvisosService`). El celular principal no muestra «Eliminar».
- `persona-direcciones`: `vit-tabla` (dirección, referencia, `DEPARTAMENTO / PROVINCIA / DISTRITO`, principal); panel con `vit-ubigeo-autocompletar`. «Agregar dirección» exige `plat.persona.editar` y `plat.catalogo.leer`; con solo el primero se ve deshabilitado con el aviso «Necesita permiso para leer catálogos».
- `persona-roles`: `vit-tabla` (producto, rol, desde); «Asignar rol» (`plat.persona.rol`) abre un panel con producto (de `productos-suscritos`) y rol. 200 (ya vigente) → aviso «La persona ya tenía ese rol».
- `persona-consentimientos`: `vit-tabla` solo lectura (finalidad, decisión con chip, versión del texto, canal, fecha en hora de Lima). Vacío: «Sin decisiones registradas».
- Cada respuesta de edición trae la persona con su `version`; la ficha la reemplaza sin releer. Tras un `DELETE` (204) relee. 409 `VERSION_OBSOLETA` → aviso «La persona cambió; se recargaron sus datos» y relee.

### Front: `admin-cliente`

- `pages/personas-lista/`: `vit-persona-buscador` en modo lista dentro de `vit-filtros`, selects de tipo de persona, producto (los nueve de `PRODUCTOS`) y rol; `vit-tabla` con persona (denominación), documento, celular, roles (chips) y coincidencia; `ColumnaTabla.movil` con persona, documento y celular. Estado en la URL (`?q=&tipo=&producto=&rol=&pagina=&tamano=`) con `utils/filtro-url-personas.ts`. «Nueva persona» (`plat.persona.registrar`) abre `vit-panel-nueva-persona` con «Abrir ficha»; al cerrarse con una persona navega a su ficha. Clic en una fila abre la ficha.
- `pages/persona-detalle/`: compone las piezas de la ficha; 404 → `vit-estado-vacio` «La persona no existe o no es de su organización».
- Rutas en `ADMIN_CLIENTE_ROUTES`: `personas` y `personas/:personaId` con `permisoGuard(plat.persona.leer)`.

### Manifiesto

`plat.manifiesto.json` a la siguiente menor libre al implementar (1.26.0 si nadie la tomó): opción `plat.organizacion.personas` («Personas», `/admin/personas`, ícono `contacts`, orden 4, permiso `plat.persona.leer`). Sin permisos nuevos. Las pruebas de manifiesto que fijan la versión se actualizan.

## Plan de implementación

1. **Diseño en el canvas.** Página «38 · Personas» con los artboards de la tabla, en claro, oscuro, 600 y 360 px. El usuario lo revisa; sin su visto bueno no se escribe código de UI (los pasos 2 a 4 de back sí pueden avanzar).
2. **Migración.** `db/01l_per_busqueda.sql`, inverso y prueba SQL: `normalizar_busqueda` («Ñúñez  Pérez» → `nunez perez`), los pares de `clave_fonetica`, columnas generadas al insertar y al cambiar nombres, índices usados (`EXPLAIN` sin `Seq Scan` con 10 000 filas), ida y vuelta. Entrada en `db-esquemas.test.mjs`. Se prueba también en PGlite.
3. **Búsqueda.** `BuscarPersonas`, `ConsultaPersonasTypeOrm`, DTO y ruta `GET /v1/personas`. Integración contra base temporal con los casos de los criterios, aislamiento por tenant y la medición con 50 000 personas.
4. **Productos suscritos.** `listarVigentes`, caso de uso y ruta, con e2e. Enmascarado de `q` en el registro HTTP.
5. **Lib `personas-ui`: modelos, clientes y utilidades.** `nx g` con etiquetas, alias y `tsconfig`; clientes con `HttpTestingController`; `clasificarEntrada`, `formatoUbigeo`, `filtrarUbigeos`, `denominacion` con pruebas.
6. **`vit-persona-buscador` y `vit-persona-alta`.** Con pruebas de componente de cada estado del buscador y del alta.
7. **Piezas de la ficha.** Datos básicos, contactos, direcciones con `vit-ubigeo-autocompletar`, roles y consentimientos, con pruebas.
8. **Páginas en `admin-cliente` y manifiesto.** Lista, ficha, rutas, `filtro-url-personas.ts`, opción de menú y pruebas de manifiesto.
9. **Verificación.** Migración en Supabase dev (`pnpm db:up:remoto`), api local con `IDN_PROVEEDOR=falso`, `nx serve` de `plataforma-admin`; recorrido con Playwright de los criterios de UI en claro, oscuro, 600 y 360 px, consola sin errores, axe-core y capturas comparadas con el canvas.
10. **Cierre.** `code-simplifier` sobre los archivos tocados; `npx nx run-many -t lint test -p personas personas-ui admin-cliente plataforma-admin seguridad api migrar` y las demás libs con pruebas de manifiesto.

## Criterios de aceptación

**Back:**

- [ ] `GET /v1/personas?q=quispe juana` encuentra a «Juana Quispe Mamani»; también `q=QUISPE`, `q=Quíspe` y `q=mamani juana` (sin tildes, sin mayúsculas, cualquier orden).
- [ ] Tolerancia a errores: `q=Qispe` y `q=Juanna` la encuentran por similitud.
- [ ] Fonética: con «Valdivieso» registrado, `q=Baldiviezo` lo encuentra; «Jiménez» con `q=gimenes`; «Huamán» con `q=wuaman`; «Llerena» con `q=yerena`.
- [ ] `q=4578` encuentra el DNI 45781236 (prefijo) con `coincidencia: DOCUMENTO`; `q=45781236` la pone primera.
- [ ] `q=98765` encuentra a quien tiene el celular 987654321 con `coincidencia: CONTACTO`; `q=juana.q@` encuentra por el correo.
- [ ] `q=ju` → 422 `CONSULTA_MUY_CORTA`; `q=123` → 422; `tamano=51` → 400.
- [ ] `producto=CLI&rol=PACIENTE` devuelve solo personas con ese rol vigente; `tipo_persona=JURIDICA` solo jurídicas; los filtros se combinan con `q`.
- [ ] Sin `q`, la lista sale ordenada por denominación, paginada, con `total`.
- [ ] Una persona de otro tenant nunca aparece, aunque su nombre coincida; la prueba SQL con dos `app.tenant_id` no la ve.
- [ ] Con 50 000 personas sembradas en la base temporal, la búsqueda de texto y la de prefijo de documento responden en menos de 300 ms (medido en la prueba de integración local, no en CI) y `EXPLAIN` usa los índices nuevos.
- [ ] Las columnas `busqueda_texto` y `busqueda_fonetica` se actualizan solas tras `PATCH /v1/personas/{id}`.
- [ ] `q` llega a la consulta solo como parámetro; `q=' OR 1=1 --` no devuelve otra cosa que coincidencias de texto.
- [ ] `GET /v1/personas/productos-suscritos` devuelve solo productos en PRUEBA o ACTIVA; sin `plat.persona.rol` → 403.
- [ ] Sin `plat.persona.leer` → 403 en el listado. Ambas rutas en OpenAPI bajo `/v1`; `GET /v1/personas/{id}` sigue funcionando.
- [ ] Ningún log contiene `q`, el número de documento ni nombres (TR-RNF-026 y 111).
- [ ] Migración `01l_per_busqueda` reversible y probada en CI contra PostgreSQL 16; aplicada en Supabase dev.

**Front (pruebas unitarias y de componente):**

- [ ] `clasificarEntrada`: `45781236` → DNI; `20100070970` → RUC; `20100070971` → RUC inválido con motivo, sin llamada; `98765` → NUMERO; `ana@` → CORREO; `ju` → CORTA; con tipo CE elegido, `001234567` → CE.
- [ ] `formatoUbigeo` da `AREQUIPA / AREQUIPA / CAYMA` para el ubigeo `040103`; `filtrarUbigeos('cayma')` y `filtrarUbigeos('arequipa caym')` lo incluyen.
- [ ] Teclear rápido en el buscador hace una sola petición tras 300 ms y cancela la anterior.
- [ ] El alta deduce JURIDICA para RUC 20… y NATURAL para DNI, CE, pasaporte y RUC 10….

**UI (Playwright en `admin-cliente` de `plataforma-admin`, api local contra Supabase dev, `IDN_PROVEEDOR=falso`):**

- [ ] TR-CA-100: en «Nueva persona», escribir `45781236` muestra «Registrar a Juana Quispe Mamani»; el alta llega prellenada con nombres «Juana», paterno «Quispe», materno «Mamani»; con celular 987654321 se guarda y abre la ficha.
- [ ] TR-CA-101: el mismo DNI de nuevo muestra la tarjeta de la persona existente con «Usar», sin ofrecer registrar.
- [ ] TR-CA-102: con tipo CE y `001234567`, «Registrar» abre el alta vacía; con nombres a mano se crea.
- [ ] TR-CA-121: con IDN simulado caído, el buscador muestra el aviso y el alta a mano funciona.
- [ ] TR-CA-106: celular `51987654` en el alta o en «Agregar contacto» muestra «El celular debe tener 9 dígitos e iniciar con 9» y no guarda.
- [ ] TR-CA-105: «Agregar dirección» con «Av. Ejército 710», autocompletar «cayma» → opción `AREQUIPA / AREQUIPA / CAYMA`, marcada principal; la tabla la muestra así y con la estrella de principal.
- [ ] Marcar principal un segundo celular mueve la estrella; el anterior pasa a mostrar «Eliminar».
- [ ] TR-CA-103: desde la ficha de Juana con PACIENTE de CLI, «Asignar rol» SOCIO de GYM deja dos roles en la tabla y en la lista.
- [ ] TR-CA-104: el select de producto no ofrece ECO si el tenant no lo tiene suscrito.
- [ ] La ficha muestra las decisiones de consentimiento de la persona en solo lectura.
- [ ] La lista busca «baldiviezo» y encuentra «Valdivieso»; el filtro producto + rol y la página quedan en la URL y sobreviven a recargar.
- [ ] Editar en dos pestañas la misma persona: la segunda recibe «La persona cambió; se recargaron sus datos» y ve los datos nuevos.
- [ ] Sin `plat.persona.registrar` no se ve «Nueva persona» ni «Registrar»; sin `plat.persona.editar` no se ven las acciones de edición; sin `plat.persona.rol` no se ve «Asignar rol»; sin `plat.catalogo.leer`, «Agregar dirección» aparece deshabilitado con su aviso.
- [ ] La opción «Personas» aparece en el menú de Organización solo con `plat.persona.leer`.
- [ ] Tema claro y oscuro: buscador, lista, ficha y paneles solo con tokens; capturas de los dos.
- [ ] A 600 y 360 px: la tabla usa la vista de celular, el panel ocupa el ancho, las sugerencias caben y no hay scroll horizontal.
- [ ] Las capturas coinciden con los artboards de «38 · Personas» (textos, íconos, tonos, orden de columnas, ubicación de acciones). Una diferencia se corrige en el código o en el canvas antes de cerrar.
- [ ] axe-core sin `critical` ni `serious` en lista, ficha y buscador abierto.
- [ ] Consola del navegador sin errores en todo el recorrido.

**General:**

- [ ] El código nuevo sigue «Código limpio», «Estructura de libs Angular» y «Diseño UI» de `CLAUDE.md` (un artefacto por archivo, `templateUrl` y `styleUrl`, `.css` solo con estilos propios, `index.ts` con exportaciones explícitas).
- [ ] `personas-ui` solo importa de `shared/*`; `admin-cliente` importa `personas-ui` por su `index.ts`; `personas` no importa nada nuevo fuera de `kernel`, `seg`, `org`, `cat`, `idn`, `arc`, `aud` y `scope:shared`.
- [ ] Cobertura de dominio de `personas` ≥ 70 %.
- [ ] `npx nx run-many -t lint test -p personas personas-ui admin-cliente plataforma-admin seguridad api migrar` (más las libs con pruebas de manifiesto) verde; `nx affected` verde en el CI del PR.

## Decisiones

- **Sí:** lista y ficha de personas en `admin-cliente`, con opción de menú, además del componente. Decisión del usuario. Da un lugar real a la verificación y a la gestión de contactos y direcciones.
- **No:** solo componente con página de desarrollo (como el 36). Decisión del usuario.
- **Sí:** búsqueda por nombres, apellidos, razón social, documento, celular y correo, con filtros por tipo de persona, producto y rol. Decisión del usuario («muy sofisticada»).
- **Sí:** `pg_trgm` + `unaccent` con columnas generadas e índices GIN trigram. Decisión del usuario. Tolera errores, ordena por similitud y escala a decenas de miles de personas.
- **No:** `ILIKE` solo ni `tsvector`. Decisión del usuario. Sin tolerancia a errores ni prefijos de número.
- **Sí:** búsqueda fonética con una clave propia del español de Perú (`per.clave_fonetica`). Pedido y decisión del usuario.
- **No:** `fuzzystrmatch` (`dmetaphone`, `soundex`). Decisión del usuario. Está hecho para el inglés y falla con ll/y, c/z/s, h muda y apellidos quechuas.
- **Sí:** las reglas fonéticas fijadas en la tabla y probadas por pares. Cambiarlas obliga a una migración que recalcule la columna; se documenta.
- **Sí:** columnas generadas `STORED` en vez de calcular en cada consulta. Permiten índice y las mantiene la base sin tocar el repositorio de escritura.
- **Sí:** SQL crudo (fragmentos de `QueryBuilder` con parámetros) solo en `ConsultaPersonasTypeOrm`, por usar funciones de base de datos (`word_similarity`, `per.*`). Regla 11.
- **Sí:** adaptador de lectura `ConsultaPersonas` aparte del `RepositorioPersonas` del agregado. El listado no arma agregados ni necesita `version`.
- **Sí:** el inverso no borra `unaccent` ni `pg_trgm`. Son de la base, no de PER; otros esquemas pueden usarlos. El resto de la migración sí se revierte.
- **Sí:** mínimo de 3 caracteres de texto y 4 dígitos. Menos devuelve medio tenant y vuelve inútil el índice trigram.
- **Sí:** un campo inteligente que clasifica la entrada, con selector de tipo para CE y pasaporte. Decisión del usuario. 8 dígitos se toman como DNI y 11 como RUC; un CE de 9 dígitos sin tipo elegido se busca como número (prefijo), no como CE.
- **Sí:** el buscador usa `/busqueda` para documentos completos (encontrada o prellenado de IDN) y `GET /v1/personas` para todo lo demás. Reutiliza el prellenado del 31 sin duplicarlo.
- **Sí:** prefijo `vit-` (`vit-persona-buscador`). El SRS lo llama `<ui-persona-buscador>`; manda el prefijo del repo (mismo criterio del 36).
- **Sí (en la implementación):** copias comentadas de `validarDocumento` y de los validadores de contacto en `personas-ui/src/lib/utils/`. La lib se empaqueta con ng-packagr y no puede importar `shared/util`, que no es buildable: mismo criterio que la copia de `validarRuc` en `admin-cliente` (specs 17b y 17c). El servidor valida con los originales.
- **Sí:** `personas-ui` con `type:feature`. Llama a la API y usa `shared/auth` (`type:data-access`), que una lib `type:ui` no puede importar (mismo criterio del 36).
- **Sí (en la implementación):** el buscador no registra: emite `registrar` con el pedido de alta y `vit-panel-nueva-persona` aloja los dos pasos (buscar y registrar) en el mismo panel, como el canvas. Decisión del usuario. El spec pedía que el buscador emitiera `registrada` y a la vez que el alta tuviera su pie en el panel; las dos cosas no caben en un componente. Un producto reutiliza el flujo abriendo el mismo panel.
- **Sí (en la implementación):** `PersonasCliente.observarListado` y `observarBusquedaDocumento` devuelven Observable: con `switchMap`, una búsqueda nueva aborta la petición HTTP anterior (las versiones con Promise no se pueden abortar).
- **Sí:** piezas en `personas-ui` y páginas en `admin-cliente`. SazónPOS y otros productos reutilizan el buscador y las piezas sin las páginas de admin.
- **Sí:** autocompletar de ubigeo sobre `GET /v1/catalogos/UBIGEO/items` con `plat.catalogo.leer`, filtrado en el navegador. Decisión del usuario. Sin back nuevo; la lista se cachea con `ETag`.
- **No:** ruta propia de ubigeos en PER. Decisión del usuario.
- **Sí:** formato `DEPARTAMENTO / PROVINCIA / DISTRITO` (`AREQUIPA / AREQUIPA / CAYMA`), con el texto como está en el catálogo. Decisión del usuario. Reemplaza el «Cayma / Arequipa / Arequipa» de TR-CA-105 y el formato capitalizado que el 32 dejaba a la UI.
- **Sí:** ficha con roles (lista y asignar) y consentimientos en solo lectura. Decisión del usuario.
- **Sí:** `GET /v1/personas/productos-suscritos` con `plat.persona.rol`. No hay ruta del tenant que liste sus suscripciones y la UI no debe ofrecer productos que la API va a rechazar. Reusa `SuscripcionesDelTenant`.
- **Sí:** el filtro de producto de la lista ofrece los nueve de `PRODUCTOS`, no solo los suscritos. Una persona puede tener un rol de un producto cuya suscripción venció.
- **Sí:** diseño previo en el canvas, página «38 · Personas». Decisión del usuario. El buscador no encaja en ninguna pantalla tipo (regla de diseño de `CLAUDE.md`).
- **Sí:** un solo spec de unas 14 h, fuera de la regla de 10 h. Decisión del usuario. Orden de recorte fijado en «Por qué existe este spec».
- **No:** partir en 38a (back de búsqueda) y 38b (UI). Decisión del usuario.
- **No:** `PersonaPort.buscar`. Ningún consumidor en proceso lo pide todavía; SazónPOS va por HTTP.
- **Sí:** opción «Personas» dentro de Organización, sin módulo nuevo. Las personas son del tenant, como empresas y sucursales; un módulo nuevo cambiaría el menú de todos.
- **Sí:** la ficha reemplaza la persona con cada respuesta y relee solo tras `DELETE` o `VERSION_OBSOLETA`. Contrato del 32.

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| `unaccent` no es `IMMUTABLE` y la columna generada falla | `per.normalizar_busqueda` llama a la forma con diccionario explícito y se declara `IMMUTABLE`; prueba SQL de la columna. |
| El esquema `extensions` o los privilegios difieren entre Supabase y el PostgreSQL de CI | `CREATE SCHEMA IF NOT EXISTS extensions` y `USAGE` explícito; la migración se aplica en Supabase dev en el cierre. |
| PGlite no trae `pg_trgm` o `unaccent` para la verificación local | Se comprueba en el paso 2; si falta, la verificación local de la migración se salta y vale la de CI y Supabase dev. |
| Falsos positivos de la fonética («Rosa» y «Roza», «Casas» y «Cazas») | Solo suma al ranking; las coincidencias exactas salen primero. |
| Tras una carga masiva (importación de personas) los GIN acumulan su lista pendiente y el planificador recorre el tenant hasta que el autovacuum la vacía | La importación masiva, cuando exista, termina con `VACUUM ANALYZE per.persona`; la medición del spec lo hace igual. |
| `word_similarity` con umbral bajo trae ruido en tenants grandes | `UMBRAL_SIMILITUD` como constante; se ajusta con la medición de 50 000 personas. |
| El texto buscado (nombres, DNI) queda en logs de acceso | Enmascarado de `q` en el registro HTTP y criterio de aceptación. |
| La lista de ~1 890 ubigeos pesa en el primer uso | Una vez por sesión y revalidada con `ETag`; filtro en memoria. |
| El usuario que edita personas no tiene `plat.catalogo.leer` | «Agregar dirección» deshabilitado con aviso; se documenta que el rol debe incluirlo. |
| El spec se pasa de 14 h | Orden de recorte fijado; lo recortado pasa a un 38b. |
| La versión del manifiesto choca con otro spec en curso | Se toma la siguiente menor libre al implementar y se actualizan las pruebas que la fijan. |

## Lo que **no** entra en este spec

- `PersonaPort.buscar` y la integración del buscador en SazónPOS u otros productos.
- Registrar o revocar consentimientos, textos por finalidad, evidencias y archivos en la ficha.
- Duplicados y fusión, personas sin documento, cerrar roles.
- Búsqueda por dirección, ubigeo o fechas; exportar la lista; nombres legibles de producto.

Cada uno, si llega, va en su propio spec.
