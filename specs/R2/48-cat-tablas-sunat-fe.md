# SPEC 48 — Catálogos: tablas SUNAT de facturación electrónica (05, 09, 10, 16, 51, 52) y regeneración de 01, 06 y 07 con el Anexo 8 vigente

> **Status:** Implementado
> **Depends on:** SPEC 19a, SPEC 19b
> **Date:** 2026-11-18
> **Objective:** Agregar al importador de tablas oficiales los catálogos SUNAT 05, 09, 10, 16, 51 y 52 como catálogos GLOBAL de solo importación, y cargar esas seis tablas y la regeneración de 01, 06 y 07 desde el Anexo 8 vigente, reconstruido con su texto completo de 2017 más las resoluciones que lo modifican, para que TR-FE valide sus códigos con `CatalogoPort`.

## Por qué existe este spec

Fila 48 de `docs/roadmap-specs.md` (3-4 h). Contexto: `docs/spec-context/tr-fe/fe-boleta-factura-cdr.md`, parte 0 de la partición de R2-05 (sec. 7 «Faltan para FE» y pregunta 3 de la sec. 9). No tiene historia propia en el plan: es una extensión de TR-RF-028 para cumplir TR-RNF-017 (catálogos oficiales en el UBL).

Lo consumen el spec 51 (emisión: tributos, tipo de precio, tipo de operación, leyendas y los regenerados 01, 06 y 07) y el 54 (motivos de nota de crédito y de débito). Sin estas tablas, el 51 no puede validar ni armar el comprobante.

Lo que hay en el código hoy (revisado al redactar):

- `libs/plataforma/catalogos/src/domain/importacion/tipos.ts`: `TABLAS_IMPORTABLES` cerrado en 7 tablas (`UBIGEO`, `CIE10`, `TIPO_COMPROBANTE`, `UNIDAD_MEDIDA`, `TIPO_DOC_IDENTIDAD`, `AFECTACION_IGV`, `MONEDA`). `disenos-tablas.ts`: `DISENOS_TABLAS` con una entrada por tabla; las columnas de `atributos` van también en `obligatorias` (como `departamento` y `provincia` de `UBIGEO`).
- `esTablaImportable(codigo)` decide tres cosas: el importador acepta la tabla (`TablaNoImportableError` si no), la edición manual de globales se rechaza (`Catalogo.admiteEdicionManualDeGlobales`, `TablaSoloImportacionError`) y la API responde `importable: true`. La consola (`consola-catalogos`) muestra la pestaña «Importaciones» y bloquea la edición solo con ese campo.
- Definiciones sembradas: `db/01f_cat.sql` (ids `…0001` a `…0004`) y `db/01f_cat_importacion.sql` (`…0005` a `…0009`). No existe ningún catálogo `TRIBUTO`, `TIPO_NOTA_CREDITO`, `TIPO_NOTA_DEBITO`, `TIPO_PRECIO`, `TIPO_OPERACION` ni `LEYENDA`.
- `docs/datos-oficiales/`: 7 CSV y `FUENTES.md`. Los de 01 (17 filas), 06 (9) y 07 (18) salen de `RS-245-2017`; `FUENTES.md` pide bajar a mano la versión vigente porque cpe.sunat.gob.pe responde HTTP 403 a la descarga automática. El PDF de 2017 no quedó en el repo.
- SUNAT no publica un Anexo 8 consolidado que se pueda bajar: las páginas de orientación enlazan versiones de 2014 a 2016. La legislación (`https://www.sunat.gob.pe/legislacion/superin/<año>/`) sí se descarga sin restricción. El rastreo del 2026-11-18 revisó los índices de 2017 a 2026 y los 184 documentos de las resoluciones sobre emisión electrónica y comprobantes; el resultado está en «Cadena de resoluciones». `RS-245-2017` no es el último texto completo: lo reemplazó el anexo V de la RS 340-2017.
- Importación (funciones de `01f_cat_importacion.sql` y `calcular-diferencias.ts`): un código nuevo es alta con `vigente_desde = fecha_vigencia`; uno que difiere en `codigo_externo`, `nombre`, `abreviatura`, `orden` o atributos del diseño es cambio y conserva las demás claves de `atributos`; uno vigente que no viene en el archivo es baja y solo cierra vigencia (`vigente_hasta = fecha_vigencia - 1`), nunca se borra.
- `libs/plataforma/personas`: `per.persona.tipo_documento` guarda el código del ítem (`DNI`, `CE`, `RUC`, `PASAPORTE`, con CHECK) y `RegistrarPersona` exige que esté vigente en `TIPO_DOC_IDENTIDAD`. `VerificadorReferenciasPer` solo actúa en borrados manuales, que en una tabla importable no ocurren.
- `tools/migrar/migrar.mjs` aplica todo archivo de `db/` que no esté en `migraciones._migraciones`, sin mirar el orden: un `01f_*` nuevo se aplica aunque `01g` a `01m` ya estén aplicados.
- Pruebas que fijan la lista de tablas: `libs/plataforma/catalogos/test/importacion-dominio.spec.ts` y `tools/migrar/test/db-esquemas.test.mjs`. Ninguna prueba de front la fija: usan el campo `importable` de la respuesta.

## Alcance

**Sin requisito previo del usuario.** Los documentos de origen se bajan en el paso 1 desde la legislación de SUNAT, que admite la descarga automática.

**Entra:**

- Seis tablas importables nuevas: `TRIBUTO` (cat. 05), `TIPO_NOTA_CREDITO` (09), `TIPO_NOTA_DEBITO` (10), `TIPO_PRECIO` (16), `TIPO_OPERACION` (51) y `LEYENDA` (52), en `TABLAS_IMPORTABLES` y `DISENOS_TABLAS`.
- Migración `db/01f_cat_tablas_fe.sql` con las seis definiciones GLOBAL vacías, su inverso y prueba SQL.
- Seis CSV nuevos y la regeneración de `tipo_comprobante.csv`, `tipo_doc_identidad.csv` y `afectacion_igv.csv` desde el Anexo vigente, con `FUENTES.md` actualizado.
- `docs/datos-oficiales/origen/` en `.gitignore`.
- Importación de los nueve CSV en Supabase dev con el importador existente.
- Pruebas que fijaban 7 tablas, actualizadas.

**No entra (specs futuros):**

- Catálogo 19 (estado del ítem del resumen diario) → spec 55.
- Catálogo propio `TASA_IGV`, parámetros de IGV y umbral de boleta → spec 51.
- Adquirente «Clientes varios» / «documento 0» de TR-CA-139 → spec 51. Aquí no se inventa ningún ítem.
- Otros catálogos SUNAT (12, 15, 17, 18, 53, 54, 59…): con el spec que los pida. 02 y 03 ya están cubiertos por `MONEDA` y `UNIDAD_MEDIDA`.
- Validar comprobantes contra estas tablas → specs 51 y 54.
- Carga en staging y producción → plan de pase.
- Actualización automática cuando SUNAT publique otra versión.

## Base de código reutilizada

| Pieza | Qué se hace |
| --- | --- |
| `catalogos/src/domain/importacion/tipos.ts` (`TABLAS_IMPORTABLES`) | Se agregan las seis tablas. El comentario «Las 7 tablas» deja de citar un número. |
| `catalogos/src/domain/importacion/disenos-tablas.ts` (`DISENOS_TABLAS`) | Se agregan seis entradas. `validarCabecera` sin cambios. |
| `validar-fila.ts`, `calcular-diferencias.ts`, `importacion.ts`, lectores, casos de uso, cola, SSE | Sin cambios. |
| `db/01f_cat_importacion.sql` (funciones de aplicación) | Sin cambios. Su semilla es el patrón de la migración nueva. |
| `CatalogoPort.validarItem`, caché y ETag (19a) | Sin cambios. |
| `consola-catalogos`, `catalogos-ui` | Sin cambios: leen `importable` de la API. |
| `personas` (`RegistrarPersona`, `VerificadorReferenciasPer`) | Sin cambios. La regeneración de 06 conserva sus códigos. |
| `tools/migrar/test/db-esquemas.test.mjs` | Se agrega la migración nueva a la lista y al ida y vuelta de `cat`. |

## Modelo de datos

Sin tablas, permisos, eventos ni endpoints nuevos. Se reutilizan `plat.catalogo.importar`, las rutas `/v1/catalogos/{codigo}/importaciones` y los eventos `catalogo.actualizado` y `catalogo.importacion_aplicada` (19a y 19b). El manifiesto PLAT no cambia.

### Migración `db/01f_cat_tablas_fe.sql` (+ `db/rollback/01f_cat_tablas_fe.sql`, `db/tests/01f_cat_tablas_fe.test.sql`)

Solo siembra definiciones, con `ON CONFLICT (codigo) DO NOTHING`, alcance `GLOBAL` y `editable_por_tenant = false`:

| id | `codigo` | `nombre` | `fuente` |
| --- | --- | --- | --- |
| `ca700000-0000-0000-0000-000000000010` | `TRIBUTO` | Tipos de tributo | SUNAT catálogo 05 |
| `ca700000-0000-0000-0000-000000000011` | `TIPO_NOTA_CREDITO` | Tipos de nota de crédito | SUNAT catálogo 09 |
| `ca700000-0000-0000-0000-000000000012` | `TIPO_NOTA_DEBITO` | Tipos de nota de débito | SUNAT catálogo 10 |
| `ca700000-0000-0000-0000-000000000013` | `TIPO_PRECIO` | Tipos de precio de venta unitario | SUNAT catálogo 16 |
| `ca700000-0000-0000-0000-000000000014` | `TIPO_OPERACION` | Tipos de operación | SUNAT catálogo 51 |
| `ca700000-0000-0000-0000-000000000015` | `LEYENDA` | Leyendas del comprobante | SUNAT catálogo 52 |

- Quedan sin ítems y en versión 1. Los ítems llegan con el importador.
- El orden alfabético del runner la deja después de `01f_cat_items_busqueda.sql`; solo necesita `cat.catalogo`.
- Inverso: borra las seis definiciones que no tengan ítems ni filas en `cat.importacion`. Las que tengan datos se quedan, como en el inverso de `01f_cat_importacion.sql`.

### Diseños de tabla (`DISENOS_TABLAS`)

| Tabla | Obligatorias | Opcionales | `formatoCodigo` | `atributos` |
| --- | --- | --- | --- | --- |
| `TRIBUTO` | `codigo`, `descripcion`, `nombre_tributo`, `codigo_internacional` | `orden` | `^[0-9]{4}$` | `nombre_tributo`, `codigo_internacional` |
| `TIPO_NOTA_CREDITO` | `codigo`, `descripcion` | `orden` | `^[0-9]{2}$` | — |
| `TIPO_NOTA_DEBITO` | `codigo`, `descripcion` | `orden` | `^[0-9]{2}$` | — |
| `TIPO_PRECIO` | `codigo`, `descripcion` | `orden` | `^[0-9]{2}$` | — |
| `TIPO_OPERACION` | `codigo`, `descripcion` | `orden` | `^[0-9]{4}$` | — |
| `LEYENDA` | `codigo`, `descripcion` | `orden` | `^[0-9]{4}$` | — |

- `codigo` es el código SUNAT tal cual, con sus ceros a la izquierda. Sin columna `codigo_externo`, como `AFECTACION_IGV`.
- `TRIBUTO`: `nombre_tributo` es el nombre que va en `cac:TaxScheme/cbc:Name` (`IGV`, `ISC`…) y `codigo_internacional` el código UN/ECE 5153 (`VAT`, `EXC`…). El catálogo 05 vigente (RS 244-2019) trae las dos columnas, «Código internacional» y «Nombre». Ya no trae la categoría UN/ECE 5305 que tenía en 2017, así que `categoria_impuesto` no se agrega.
- Los atributos se guardan como texto, igual que los de `UBIGEO`.
- Si un código vigente no cumple el formato propuesto, se corrige el formato del diseño, no el código.

### Datos oficiales (`docs/datos-oficiales/`)

- Origen: los PDF y ZIP de la «Cadena de resoluciones», bajados a `docs/datos-oficiales/origen/`. La carpeta se ignora en git; `FUENTES.md` guarda por cada documento nombre, sha256, URL y fecha de descarga, y por cada tabla la cadena aplicada.
- CSV nuevos, en UTF-8 y con el diseño de su tabla: `tributo.csv`, `tipo_nota_credito.csv`, `tipo_nota_debito.csv`, `tipo_precio.csv`, `tipo_operacion.csv`, `leyenda.csv`.
- CSV regenerados: `tipo_comprobante.csv` (con `codigo_externo` igual al código), `tipo_doc_identidad.csv` y `afectacion_igv.csv`. Si la versión vigente no cambia una tabla, su CSV queda igual y `FUENTES.md` solo actualiza versión oficial y fecha.
- `tipo_doc_identidad.csv` conserva la regla del 19b: `DNI` = 1, `CE` = 4, `RUC` = 6, `PASAPORTE` = 7; los demás, `DOC_` más el código SUNAT; `codigo_externo` lleva el código SUNAT.
- Las descripciones quedan como las escribe SUNAT. El script de conversión es de un solo uso y no entra al repo.
- `version_oficial` de cada importación: la última resolución que fijó ese catálogo, con la forma `RS-244-2019` (columna «Versión oficial» de la cadena). Se anota en `FUENTES.md`.

### Cadena de resoluciones (rastreo del 2026-11-18)

Base: anexo V de la RS 340-2017 (`2017/anexos-340-2017.zip`, archivo `anexoV-340-2017.pdf`), último texto completo del Anexo 8. Encima se aplican, en orden, las resoluciones que sustituyen o modifican cada catálogo:

| Cat. | Tabla | Modificatorias posteriores a la base | Versión oficial |
| --- | --- | --- | --- |
| 01 | `TIPO_COMPROBANTE` | RS 206-2019 (sustituye). RS 000048-2026 lo vuelve a tocar desde el 2027-01-01 | `RS-206-2019` |
| 05 | `TRIBUTO` | RS 013-2019, RS 150-2019 (sustituye), RS 244-2019 (sustituye) | `RS-244-2019` |
| 06 | `TIPO_DOC_IDENTIDAD` | RS 026-2021 (sustituye), RS 123-2022 (sustituye) | `RS-123-2022` |
| 07 | `AFECTACION_IGV` | Ninguna encontrada | `RS-340-2017` |
| 09 | `TIPO_NOTA_CREDITO` | RS 193-2020 y RS 165-2021 (modifican ítems; el resto queda como en la base) | `RS-165-2021` |
| 10 | `TIPO_NOTA_DEBITO` | Ninguna vigente. RS 000048-2026 lo toca desde el 2027-01-01 | `RS-340-2017` |
| 16 | `TIPO_PRECIO` | RS 013-2019 | `RS-013-2019` |
| 51 | `TIPO_OPERACION` | RS 013-2019, RS 244-2019 (sustituye), RS 252-2019 (sustituye), RS 026-2021, RS 000005-2023. RS 000048-2026 lo toca desde el 2027-01-01 | `RS-000005-2023` |
| 52 | `LEYENDA` | Ninguna encontrada | `RS-340-2017` |

- Archivos, todos bajo `https://www.sunat.gob.pe/legislacion/superin/`: `2017/anexos-340-2017.zip`, `2019/anexos-013-2019.zip` (anexo IV), `2019/anexos-150-2019.pdf` (anexo VI), `2019/anexos-206-2019.zip` (anexo III), `2019/anexo-244-2019.pdf`, `2019/anexos-252-2019.zip` (anexo VII), `2020/anexo3-193-2020.pdf`, `2021/anexo-026-2021.pdf` (anexo VI), `2021/anexo-165-2021.pdf` (anexo IV), `2022/anexo-123-2022.pdf`, `2023/anexo-000005-2023.pdf` con su fe de erratas, `2026/anexo-000048-2026.pdf`.
- Un anexo con «(...)» modifica solo los ítems que muestra: se fusiona con la versión anterior del catálogo. Uno que «sustituye» reemplaza el catálogo entero.
- La RS 000048-2026 entra en vigor el 2027-01-01 (postergada por la RS 000143-2026). Los CSV reflejan lo vigente el día en que se generan: antes de esa fecha, 01, 10 y 51 no la incluyen y `FUENTES.md` anota que hay que regenerarlos e importarlos de nuevo; desde esa fecha, la incluyen y su versión oficial es `RS-000048-2026`.
- Las RS 000240-2024 y 000108-2026 también modifican el Anexo 8, pero solo los catálogos 20, 55 y 61, que no entran aquí. La RS 114-2019 solo adelanta la vigencia de la 013-2019.
- Límite del rastreo: cubre las resoluciones de superintendencia de los índices de 2017 a 2026 cuyo título trata de emisión electrónica o comprobantes de pago. Una modificación hecha por otra vía no aparecería.

### Efecto de regenerar 01, 06 y 07 en dev

- Descripción u orden distintos → cambio. El ítem conserva `id`, `vigente_desde` y las claves de `atributos` ajenas al diseño (`longitud` y `regex` del DNI, `longitud` del RUC).
- Código nuevo → alta con `vigente_desde = fecha_vigencia`.
- Código que ya no figura → baja: cierra vigencia el día anterior y no se borra. `validarItem` lo da por no válido desde `fecha_vigencia`.
- `TIPO_DOC_IDENTIDAD`: `DNI`, `CE`, `RUC` y `PASAPORTE` siguen en el archivo con el mismo código, así que nunca salen como baja y las personas registradas y `RegistrarPersona` no cambian.

### Valores de referencia

Verificados contra `RS-245-2017` (`anexoE-245-2017.pdf`); se confirman con la cadena de resoluciones en el paso 2:

| Tabla | Código | Descripción en 2017 |
| --- | --- | --- |
| `TRIBUTO` | `1000` | IGV IMPUESTO GENERAL A LAS VENTAS, código internacional `VAT`, categoría `S` |
| `TIPO_NOTA_CREDITO` | `01` | Anulación de la operación |
| `TIPO_NOTA_DEBITO` | `01` | Intereses por mora |
| `TIPO_PRECIO` | `01` | Precio unitario (incluye el IGV) |
| `TIPO_OPERACION` | `0101` | Venta interna |
| `LEYENDA` | `1000` | Monto en Letras |

Resuelto con el rastreo: el catálogo 05 de la RS 244-2019 trae diez tributos (`1000`, `1016`, `2000`, `3000`, `7152`, `9995` a `9999`) con «Código internacional» y «Nombre» en columnas propias, sin categoría UN/ECE 5305; y el catálogo 51 se llama «Código de tipo de operación» desde la RS 013-2019 (en 2017 era «Código de tipo de factura»).

**A confirmar al generar los CSV** (único lugar): el emparejamiento de cada tributo con su nombre y su código internacional. El texto extraído del PDF desalinea esas dos columnas; se lee del PDF, no del texto extraído.

## Plan de implementación

1. **Origen.** Bajar a `docs/datos-oficiales/origen/` los documentos de la «Cadena de resoluciones». Volver a mirar los índices `https://www.sunat.gob.pe/legislacion/superin/<año>/indices/indcor.htm` del año en curso por si hay una resolución posterior al 2026-11-18 que toque estos nueve catálogos. Agregar la carpeta a `.gitignore`. Anotar en `FUENTES.md` nombre, sha256, URL y fecha de descarga de cada documento.
2. **Diseños.** Armar la versión vigente de los catálogos 05, 09, 10, 16, 51 y 52 aplicando la cadena y confirmar los formatos de código. Agregar las seis tablas a `TABLAS_IMPORTABLES` y `DISENOS_TABLAS`. Actualizar `importacion-dominio.spec.ts`: la prueba de la lista, las filas de cabecera y las de código válido e inválido por tabla. Verificar: `npx nx test catalogos`.
3. **Migración.** `db/01f_cat_tablas_fe.sql`, inverso y prueba SQL: seis definiciones GLOBAL, no editables por tenant, sin ítems y en versión 1; reaplicar no duplica; el inverso las borra vacías y deja las que tienen ítems. Agregarla a `db-esquemas.test.mjs`. Verificar: `npx nx test migrar` (PGlite en local, PostgreSQL 16 en CI).
4. **CSV.** Generar los seis CSV y regenerar los tres. Previsualizar cada uno con `PrevisualizarImportacion`, como en el 19b: 0 filas inválidas. Anotar en `FUENTES.md` filas por tabla y transformaciones; quitar la nota «versión 2017» de las tres tablas.
5. **Cierre.** `code-simplifier` sobre los archivos de código tocados. `npx nx run-many -t lint test -p catalogos migrar`. `pnpm db:up:remoto` en Supabase dev. Con la API y el worker locales contra dev, importar los nueve CSV por la consola o por `POST /v1/catalogos/{codigo}/importaciones` y `…/aplicar`; antes de aplicar 06, revisar que la previsualización no trae bajas de `DNI`, `CE`, `RUC` ni `PASAPORTE`. Dejar la evidencia (altas, cambios y bajas por tabla) en `docs/ops/supabase-ambientes.md`.

## Criterios de aceptación

- [ ] Los documentos de la cadena están en `docs/datos-oficiales/origen/`, la carpeta está en `.gitignore` y `FUENTES.md` registra por documento archivo, sha256, URL y fecha de descarga, y por tabla la cadena aplicada y su versión oficial.
- [ ] `FUENTES.md` dice si los CSV de 01, 10 y 51 incluyen la RS 000048-2026 y, si no, que se regeneran a partir del 2027-01-01.
- [ ] `GET /v1/catalogos` lista `TRIBUTO`, `TIPO_NOTA_CREDITO`, `TIPO_NOTA_DEBITO`, `TIPO_PRECIO`, `TIPO_OPERACION` y `LEYENDA` con `alcance: GLOBAL`, `editable_por_tenant: false` e `importable: true`.
- [ ] Crear, actualizar o borrar a mano un ítem global de una tabla nueva (p. ej. `TRIBUTO`) responde 409 `TABLA_SOLO_IMPORTACION`.
- [ ] Cada uno de los nueve CSV se previsualiza con 0 filas inválidas y `FUENTES.md` anota sus filas; el resumen de la previsualización coincide con ese número.
- [ ] Los nueve CSV quedan importados en dev, cada uno en una importación `APLICADA` (todo o nada) que sube la versión de su catálogo en 1.
- [ ] `CatalogoPort.validarItem('TRIBUTO', '1000')` responde `valido: true` con `nombre_tributo` y `codigo_internacional` (`VAT`) en `atributos`.
- [ ] `validarItem` responde `valido: true` para `TIPO_NOTA_CREDITO` `01`, `TIPO_NOTA_DEBITO` `01`, `TIPO_PRECIO` `01`, `TIPO_OPERACION` `0101` y `LEYENDA` `1000`.
- [ ] Un código inexistente (p. ej. `TRIBUTO` `1234`) responde `valido: false`.
- [ ] Un CSV de `TRIBUTO` con una columna desconocida responde 400 `COLUMNAS_INVALIDAS` «Columna desconocida: …»; sin `codigo_internacional`, «Falta la columna codigo_internacional».
- [ ] Un CSV de `TIPO_OPERACION` con el código `01` responde 422 `FILAS_INVALIDAS` «El código no tiene el formato de la tabla» y no escribe ningún ítem.
- [ ] Tras regenerar 06, `DNI`, `CE`, `RUC` y `PASAPORTE` conservan código, `id` y vigencia; el DNI conserva `longitud` y `regex`; registrar una persona con DNI sigue funcionando en dev.
- [ ] Un ítem de 01, 06 o 07 ausente del Anexo vigente queda con `vigente_hasta` y no se borra.
- [ ] `01f_cat_tablas_fe.sql` es reversible y su prueba SQL pasa en CI contra PostgreSQL 16; `pnpm db:up:remoto` la aplica en dev aunque `01g` a `01m` ya estén aplicadas.
- [ ] `importacion-dominio.spec.ts` y `db-esquemas.test.mjs` cubren las 13 tablas; ninguna prueba ni comentario dice «7 tablas».
- [ ] `src/domain` de `catalogos` sigue sin importar NestJS, TypeORM ni Supabase; cobertura de dominio ≥ 70 %.
- [ ] El código nuevo sigue la sección «Código limpio» de `CLAUDE.md` y pasó por `code-simplifier`.
- [ ] `npx nx run-many -t lint test -p catalogos migrar` verde en local y `nx affected` verde en el CI del PR.

## Decisiones

- **Sí:** el Anexo 8 vigente se reconstruye con el anexo V de la RS 340-2017 más las resoluciones modificatorias de cada catálogo, bajadas de la legislación de SUNAT. Decisión del usuario (2026-11-18). Reemplaza la decisión anterior de que el usuario bajara a mano un consolidado: no se encontró ninguno publicado, y cpe.sunat.gob.pe rechaza la descarga automática (HTTP 403).
- **No:** quedarse con `RS-245-2017`. Decisión del usuario. Seis de los nueve catálogos cambiaron después y una versión de 2017 no asegura TR-RNF-017 en la homologación.
- **Sí:** los CSV reflejan lo vigente el día en que se generan; la RS 000048-2026 se aplica solo desde el 2027-01-01. Cargar antes códigos que aún no rigen haría válidos comprobantes que SUNAT rechazaría.
- **Sí:** `version_oficial` por tabla con la última resolución que fijó ese catálogo. No existe una versión única del Anexo 8.
- **Sí:** solo los seis catálogos del roadmap más la regeneración de 01, 06 y 07. Decisión del usuario.
- **No:** catálogo 19 ni `TASA_IGV` aquí. Decisión del usuario. Llegan con los specs 55 y 51.
- **Sí:** el código SUNAT tal cual como `codigo` en las seis tablas, y en `TRIBUTO` los atributos que pide el XML. Decisión del usuario. Es lo que va en el UBL, igual que `TIPO_COMPROBANTE` y `AFECTACION_IGV`.
- **No:** códigos mnemónicos propios con `codigo_externo`. Decisión del usuario.
- **Sí:** catálogos GLOBAL importables y de solo lectura manual, agregados a `TABLAS_IMPORTABLES`. Es lo mismo que las siete del 19b y no pide código nuevo fuera de dos constantes.
- **Sí:** definiciones por migración y datos por el importador. Así quedan `version_oficial`, sha256 y traza en `cat.importacion`, como en el 19b.
- **Sí:** migración `01f_cat_tablas_fe.sql`, con la letra del esquema `cat`. El runner aplica lo que falte en `migraciones._migraciones` sin exigir orden.
- **Sí:** sin columna `codigo_externo` en las seis tablas. Repetiría el código; `AFECTACION_IGV` ya funciona así.
- **No:** atributo `categoria_impuesto` en `TRIBUTO`. El catálogo 05 vigente (RS 244-2019) no trae la categoría UN/ECE 5305; el diseño no declara columnas que la fuente no tiene.
- **Sí:** `docs/datos-oficiales/origen/` ignorada en git, con el sha256 en `FUENTES.md`. El 19b tampoco versionó sus fuentes y el repo no carga binarios; la suma identifica el archivo usado.
- **Sí:** la regeneración de 06 conserva `DNI`, `CE`, `RUC`, `PASAPORTE` y `DOC_<código>`. PER guarda esos códigos en `per.persona`.
- **No:** ítem «Clientes varios» o «documento 0». Se revisa qué trae el catálogo 06 vigente y el spec 51 decide cómo representar al adquirente de TR-CA-139.
- **No:** cambios de UI, permisos, eventos ni endpoints. La consola ya se guía por `importable`.
- **Sí:** importar solo en dev al cerrar. Staging y producción van en el plan de pase.

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| El rastreo omitió una resolución que modifica alguno de los nueve catálogos | El paso 1 vuelve a mirar los índices; `FUENTES.md` deja la cadena por tabla para auditarla; antes de la homologación con el PSE se contrastan los códigos con los que valida el PSE. |
| Nombre y código internacional de un tributo mal emparejados al leer el catálogo 05 | Se leen del PDF, no del texto extraído, y se comparan con los que usa el UBL de ejemplo del PSE. |
| Los CSV de 01, 10 y 51 quedan desactualizados el 2027-01-01 | `FUENTES.md` lo anota; se regeneran e importan al entrar en vigor la RS 000048-2026. |
| El catálogo 06 vigente trae un código no alfanumérico y `DOC_<código>` no cumple `^[A-Z0-9_]{1,40}$` | Ese ítem lleva un código interno `DOC_` más un nombre acordado con el usuario y el código SUNAT en `codigo_externo`. No se cambia el formato. |
| La regeneración da de baja un código que un tenant ya usa | Las bajas solo cierran vigencia. La previsualización en dev se revisa antes de aplicar y las bajas se anotan en `FUENTES.md`. |
| Extraer tablas de un PDF parte descripciones en dos líneas | Misma técnica del 19b; se compara el número de filas con el del Anexo y se previsualiza con 0 inválidas. |
| En dev ya existe un catálogo con alguno de los seis códigos | Se revisa con el MCP antes de `db:up:remoto`; `ON CONFLICT DO NOTHING` no lo pisaría y habría que resolverlo a mano. |

## Lo que **no** entra en este spec

- Catálogo 19 (spec 55), `TASA_IGV`, parámetros de IGV y umbral de boleta (spec 51).
- Representación de «Clientes varios» / «documento 0» (spec 51).
- Catálogos SUNAT no listados (12, 15, 17, 18, 53, 54, 59…).
- Validación de comprobantes y notas contra estas tablas (specs 51 y 54).
- Carga en staging y producción (plan de pase).
- Actualización automática ante una versión nueva de SUNAT.

Cada uno, si llega, va en su propio spec.
