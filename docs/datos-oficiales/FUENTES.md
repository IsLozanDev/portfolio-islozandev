# Datos oficiales de las tablas importables (specs 19b y 48)

Los CSV de esta carpeta están en UTF-8, con el diseño de cada tabla (`DISENOS_TABLAS`), y se cargan con el propio importador (`POST /v1/catalogos/{codigo}/importaciones`). Ninguno sale de una copia de terceros.

Fechas de descarga:
- **2026-11-07:** UBIGEO, las tres tablas de SUNAT y MONEDA, bajadas por el entorno de trabajo.
- **2026-11-08:** CIE10 y UNIDAD_MEDIDA. El usuario las bajó a mano porque los servidores rechazan la descarga automática.
- **2026-11-18:** las nueve tablas de SUNAT (spec 48), desde la legislación de SUNAT, bajadas por el entorno de trabajo. Reemplazan las tres del 2026-11-07.

Los scripts de conversión fueron de un solo uso y no están en el repo.

Verificación: cada archivo se previsualizó con `PrevisualizarImportacion` (lector, validación y diferencias reales; repositorios en memoria con la semilla del 19a). Todos dieron 0 filas inválidas y el resumen de la previsualización coincide con las filas de la tabla.

| Tabla | Archivo | Filas | Estado |
| --- | --- | --- | --- |
| `UBIGEO` | `ubigeo.csv` | 1 891 | Listo |
| `TIPO_COMPROBANTE` | `tipo_comprobante.csv` | 40 | Listo (`RS-206-2019`; se regenera el 2027-01-01, ver nota) |
| `TIPO_DOC_IDENTIDAD` | `tipo_doc_identidad.csv` | 12 | Listo (`RS-123-2022`) |
| `AFECTACION_IGV` | `afectacion_igv.csv` | 19 | Listo (`RS-013-2019`) |
| `TRIBUTO` | `tributo.csv` | 10 | Listo (`RS-244-2019`) |
| `TIPO_NOTA_CREDITO` | `tipo_nota_credito.csv` | 13 | Listo (`RS-165-2021`) |
| `TIPO_NOTA_DEBITO` | `tipo_nota_debito.csv` | 5 | Listo (`RS-013-2019`; se regenera el 2027-01-01, ver nota) |
| `TIPO_PRECIO` | `tipo_precio.csv` | 3 | Listo (`RS-013-2019`) |
| `TIPO_OPERACION` | `tipo_operacion.csv` | 30 | Listo (`RS-000005-2023`; se regenera el 2027-01-01, ver nota) |
| `LEYENDA` | `leyenda.csv` | 14 | Listo (`RS-013-2019`) |
| `MONEDA` | `moneda.csv` | 178 | Listo |
| `CIE10` | `cie10.csv` | 11 132 | Listo (CIE-10 OPS 2018, ver nota) |
| `UNIDAD_MEDIDA` | `unidad_medida.csv` | 1 827 | Listo |

## UBIGEO

- **Fuente:** INEI, «Ubigeos (Códigos de Ubicación Geográfica)», Plataforma Nacional de Datos Abiertos. Ficha: https://www.datosabiertos.gob.pe/dataset/ubigeos-c%C3%B3digos-de-ubicaci%C3%B3n-geogr%C3%A1fica-instituto-nacional-de-estad%C3%ADstica-e-inform%C3%A1tica-inei
- **Archivo descargado:** https://www.inei.gob.pe/media/DATOS_ABIERTOS/UBIGEOS/UBIGEOS_2022_1891_distritos.zip (`UBIGEOS_2022_1891_distritos.csv`). Licencia ODbL.
- **Versión oficial:** `INEI-2022` (1 891 distritos). La ficha se modificó el 2023-09-07.
- **Filas:** 1 891.
- **Transformaciones:**
  - de Windows-1252 a UTF-8;
  - `IDDIST` → `codigo`, `NOMBDIST` → `descripcion`, `NOMBDEP` → `departamento`, `NOMBPROV` → `provincia`;
  - se descartan la capital legal y la región natural;
  - los nombres quedan como los publica el INEI: en mayúsculas y sin tildes, salvo la Ñ.
- **Nota:** el INEI publica también `UBIGEODISTRITOS.XLSX` en otra ficha, modificada el 2025-12-17 (https://www.datosabiertos.gob.pe/sites/default/files/UBIGEODISTRITOS.XLSX), pero el servidor rechazó la descarga automática (HTTP 418). Conviene bajarla a mano y comparar antes de la carga en producción.

## Tablas SUNAT del Anexo N.° 8 (spec 48)

`TIPO_COMPROBANTE` (catálogo 01), `TRIBUTO` (05), `TIPO_DOC_IDENTIDAD` (06), `AFECTACION_IGV` (07), `TIPO_NOTA_CREDITO` (09), `TIPO_NOTA_DEBITO` (10), `TIPO_PRECIO` (16), `TIPO_OPERACION` (51) y `LEYENDA` (52).

- **Fuente:** SUNAT, «Anexo N.° 8 - Catálogo de códigos» de la Resolución de Superintendencia N.° 097-2012/SUNAT. SUNAT no publica un texto consolidado que se pueda bajar: cada catálogo se arma con el último texto completo del anexo y las resoluciones posteriores que lo sustituyen o modifican, todas de `https://www.sunat.gob.pe/legislacion/superin/`.
- **Fecha de descarga y de generación:** 2026-11-18. Los CSV reflejan lo vigente ese día.
- **Documentos:** están en `docs/datos-oficiales/origen/`, carpeta ignorada en git; el sha256 identifica el archivo usado.

### Cadena aplicada por tabla

| Cat. | Tabla | Cadena, en orden | Versión oficial | Filas |
| --- | --- | --- | --- | --- |
| 01 | `TIPO_COMPROBANTE` | RS 340-2017 (anexo V, texto completo) → RS 013-2019 (anexo IV, texto completo) → RS 206-2019 (anexo III, sustituye) | `RS-206-2019` | 40 |
| 05 | `TRIBUTO` | RS 340-2017 → RS 013-2019 → RS 150-2019 (anexo VI, sustituye) → RS 244-2019 (anexo II, sustituye) | `RS-244-2019` | 10 |
| 06 | `TIPO_DOC_IDENTIDAD` | RS 340-2017 → RS 013-2019 → RS 026-2021 (anexo VI, sustituye) → RS 123-2022 (anexo II, sustituye) | `RS-123-2022` | 12 |
| 07 | `AFECTACION_IGV` | RS 340-2017 → RS 013-2019 | `RS-013-2019` | 19 |
| 09 | `TIPO_NOTA_CREDITO` | RS 340-2017 → RS 013-2019 → RS 193-2020 (anexo III, modifica los ítems 03 y 13) → RS 165-2021 (anexo IV, modifica los ítems 03 y 13 y muestra los 13) | `RS-165-2021` | 13 |
| 10 | `TIPO_NOTA_DEBITO` | RS 340-2017 → RS 013-2019 | `RS-013-2019` | 5 |
| 16 | `TIPO_PRECIO` | RS 340-2017 → RS 013-2019 | `RS-013-2019` | 3 |
| 51 | `TIPO_OPERACION` | RS 340-2017 → RS 013-2019 → RS 252-2019 (anexo VII, sustituye; rige desde el 2019-12-01) → RS 244-2019 (anexo II, sustituye; su artículo 4 rige desde el 2020-02-01) → RS 026-2021 (anexo VI, sustituye) → RS 000005-2023 (anexo II, modifica y muestra los 30) | `RS-000005-2023` | 30 |
| 52 | `LEYENDA` | RS 340-2017 → RS 013-2019 | `RS-013-2019` | 14 |

- **El anexo IV de la RS 013-2019 es un texto completo del Anexo 8** (catálogos 01 al 59, sin «(...)»), posterior al anexo V de la RS 340-2017, que también lo es. Los artículos de las dos dicen «Modifícase […] el anexo N.° 8», pero sus anexos reproducen todos los catálogos, así que cada uno se toma como texto completo. Por eso fija los nueve catálogos y es la versión oficial de 07, 10, 16 y 52. El spec 48 la daba como modificatoria solo de 05, 16 y 51, y tomaba `RS-340-2017` como versión de 07, 10 y 52. Lo que cambió respecto de 2017 en esos catálogos:
  - 07: el código `37` es nuevo y cambia la redacción de `17`, `21` y `40`;
  - 10: los códigos `10` y `11` pasaron a ser `11` y `12`;
  - 16: el código `03` es nuevo y el `02` agrega «(Gratuitas)»;
  - 52: los códigos `2007` a `2011` son nuevos y el `3000` («Código interno generado por el software de Facturación») ya no figura.
- La RS 026-2021 sustituye el catálogo 51: su artículo dice «Sustitúyase los catálogos N.os 6, 51 y 55». La RS 000005-2023 lo modifica mostrando el catálogo entero (agrega `2106`); su artículo 5.4 remite al «anexo IV», pero el catálogo está en su anexo II. La fe de erratas de la RS 000005-2023 solo corrige el anexo N.° 1.
- Un anexo con «(...)» modifica solo los ítems que muestra; uno que sustituye reemplaza el catálogo entero. Se leyó el artículo de cada resolución para saber cuál es el caso.
- La RS 114-2019 solo adelanta la vigencia de la RS 013-2019. Las RS 000240-2024 y 000108-2026 modifican el Anexo 8 solo en los catálogos 20, 55 y 61.
- **Índice de 2026 revisado el 2026-11-18** (`2026/indices/indcor.htm`, hasta la RS 000228-2026): ninguna resolución posterior a la RS 000048-2026 toca estos nueve catálogos. La RS 000143-2026 solo posterga su vigencia.

### RS 000048-2026: no incluida, regenerar el 2027-01-01

Los CSV de 01, 10 y 51 **no incluyen** la RS 000048-2026. Su vigencia se postergó al 2027-01-01 (RS 000143-2026) y cargar antes sus códigos haría válidos comprobantes que SUNAT rechazaría. A partir del 2027-01-01 hay que regenerar e importar de nuevo esos tres CSV con versión oficial `RS-000048-2026`. Su anexo IX cambia:

- catálogo 01: agrega `25` «Documento de atribución» y redacta `56` como «Comprobante de pago SEAE / DAE-SEAE»;
- catálogo 10: `03` pasa a «Otros conceptos» y agrega `13` «Penalidades»;
- catálogo 51: `0101` pasa a «Venta interna no sujeta a Detracción, Retención o Percepción».

### Transformaciones

- El texto se extrajo de cada PDF con `pdftotext -raw -enc UTF-8`, que da una fila por código. Las descripciones partidas en varias líneas se unieron con un espacio. Cada fila se comparó con la salida de `pdftotext -table` y `-layout`. Las páginas de los catálogos 05 (`anexo-244-2019.pdf`, pág. 9), 06 (`anexo-123-2022.pdf`, pág. 17) y 51 (`anexo-000005-2023.pdf`, págs. 2 y 3) se rasterizaron con pdf.js y se leyeron como imagen: coinciden con los CSV.
- Las descripciones quedan como las escribe SUNAT, con sus mayúsculas, comillas y guiones.
- **Dos descripciones del catálogo 01 se recortaron** porque superan los 200 caracteres de `cat.catalogo_item.nombre`. Se cortan en la última palabra entera que cabe y terminan en «…». Texto oficial completo:
  - `05` (201 caracteres): «Boletos de Transporte Aéreo que emiten las Compañías de Aviación Comercial por el servicio de transporte aéreo regular de pasajeros, emitido de manera manual, mecanizada o por medios electrónicos (BME)»;
  - `30` (225 caracteres): «Documentos emitidos por las empresas que desempeñan el rol adquirente en los sistemas de pago mediante tarjetas de crédito y débito, emitidas por bancos e instituciones financieras o crediticias, domiciliados o no en el país.».
- **TIPO_COMPROBANTE:** `codigo_externo` lleva el mismo código SUNAT.
- **TRIBUTO:** `nombre_tributo` es la columna «Nombre» y `codigo_internacional` la columna «Código internacional» del catálogo 05. `-layout` desalinea esas dos columnas; el emparejamiento se confirmó en la imagen de la página 9 del anexo de la RS 244-2019 (cada fila del CSV coincide con la tabla), sale igual con `-raw` y con `-table`, y coincide con los anexos de las RS 013-2019 y 150-2019 en los tributos que comparten.
- **TIPO_DOC_IDENTIDAD:** `DNI` = 1, `CE` = 4, `RUC` = 6, `PASAPORTE` = 7; los demás son `DOC_` más el código SUNAT (`DOC_0` y `DOC_A` a `DOC_G`); `codigo_externo` lleva el código SUNAT.
- **AFECTACION_IGV:** se descarta la columna «Código de tributo» del catálogo 07.
- **TIPO_OPERACION:** se descarta la columna «Tipo de comprobante asociado» del catálogo 51.

### Efecto previsto al importar en dev

Calculado con `calcularDiferencias` contra los CSV del spec 19b, que es lo que dev tiene importado. La previsualización real en dev manda.

| Tabla | Altas | Cambios | Bajas | Sin cambios |
| --- | --- | --- | --- | --- |
| `TIPO_COMPROBANTE` | 23 | 17 | 0 | 0 |
| `TIPO_DOC_IDENTIDAD` | 3 (`DOC_E`, `DOC_F`, `DOC_G`) | 9 | 0 | 0 |
| `AFECTACION_IGV` | 1 (`37`) | 3 (`17`, `21`, `40`) | 0 | 15 |
| `TRIBUTO` | 10 | 0 | 0 | 0 |
| `TIPO_NOTA_CREDITO` | 13 | 0 | 0 | 0 |
| `TIPO_NOTA_DEBITO` | 5 | 0 | 0 | 0 |
| `TIPO_PRECIO` | 3 | 0 | 0 | 0 |
| `TIPO_OPERACION` | 30 | 0 | 0 | 0 |
| `LEYENDA` | 14 | 0 | 0 | 0 |

- Ninguna baja: los códigos de la versión de 2017 siguen en la vigente.
- `DNI`, `CE`, `RUC` y `PASAPORTE` salen como cambio de redacción y conservan `id`, vigencia y los atributos `longitud` y `regex`.
- Los cambios de 01 y 06 son de redacción (SUNAT dejó las mayúsculas sostenidas) y, en 01, también de orden.

### Por confirmar

- **Código `2106` del catálogo 51** («Venta nacional a turistas – Tax Free»): la RS 000005-2023 «entra en vigencia conjuntamente con el Decreto Supremo N.° 226-2020-EF». No se comprobó la vigencia de ese decreto. Si aún no rige, el código no debe usarse.
- El rastreo cubre solo las resoluciones de superintendencia sobre emisión electrónica y comprobantes de pago de los índices de 2017 a 2026. Antes de la homologación conviene contrastar estos códigos con los que valida el PSE.

### Documentos de origen

Todos bajo `https://www.sunat.gob.pe/legislacion/superin/`, bajados el 2026-11-18.

| Archivo | Ruta | sha256 |
| --- | --- | --- |
| `anexos-340-2017.zip` | `2017/anexos-340-2017.zip` | `63e199e34f0283b21a8f307f2373f3d88b7ec41ee1346587e297289d93345b57` |
| `anexoV-340-2017.pdf` | dentro de `anexos-340-2017.zip` | `9838f42e37bcd85460c618e0222f9046ec3b43544ef7929fbb23db1705f9c149` |
| `340-2017.pdf` | `2017/340-2017.pdf` | `f91d1688c9a93f0ea3bd79de490d6be7679cccb595250a2a82b0587436e85905` |
| `anexos-013-2019.zip` | `2019/anexos-013-2019.zip` | `e481cb4a5418ef5b479b55b2d0fbe5c750df6f838021ffe08890525072ee9841` |
| `anexoIV-013-2019.pdf` | dentro de `anexos-013-2019.zip` | `b78fd91b1909538ba1768e4d52709adc2b459b940304dcb4d0446a3a01e0ef95` |
| `013-2019.pdf` | `2019/013-2019.pdf` | `e5263ca881e89b2e1c701d68e1c500f17d0939c6a9b86054bafb9dc6bf746670` |
| `anexos-150-2019.pdf` | `2019/anexos-150-2019.pdf` | `c82c5f342e8b21d660778d4b43843e0e82c6f25e023c6ae971c658fa25cf2f04` |
| `150-2019.pdf` | `2019/150-2019.pdf` | `af2cfc04cf506bdb3709cdd92cbeb02fd11fb36c6b01c14f22989ad12f036805` |
| `anexos-206-2019.zip` | `2019/anexos-206-2019.zip` | `e4e3281775e68613ed6b653247d50dab49bec3529319a425b3c74d2ee9043e73` |
| `anexo-III-206-2019.pdf` | dentro de `anexos-206-2019.zip` | `b9fea6f3ed7921d1fe48df82b6f281f66f339f7ab167a37a8dbab94961e0b72f` |
| `206-2019.pdf` | `2019/206-2019.pdf` | `149d89f175b6c1a67f8fc495deafb8e88fb6e6822f8353f26a8931627efd58d4` |
| `anexo-244-2019.pdf` | `2019/anexo-244-2019.pdf` | `71d159ee3ceb5def111b570d28185f2e04802a8d08f0e5fb734775673232c809` |
| `244-2019.pdf` | `2019/244-2019.pdf` | `231b868848ce20ff7a7acfac49fde4e60f5772a33569a206a4dfe3f65c446383` |
| `anexos-252-2019.zip` | `2019/anexos-252-2019.zip` | `53848915392ed54cfe35faf2aca0a9e4ef49f93f4a774b47b90d8f921813049c` |
| `anexoVII-252-2019.pdf` | dentro de `anexos-252-2019.zip`, donde se llama `ANEXO VII R.S. 2522019SUNAT  ANEXO VII.pdf` | `5e82592681af005b23cb428a33718dc95ad55a73f7ecd80a93521cfc05d415d8` |
| `252-2019.pdf` | `2019/252-2019.pdf` | `aef0dee4451dbc421cbada0306d717b585428a41321ee558da48dbfd02caf752` |
| `anexo3-193-2020.pdf` | `2020/anexo3-193-2020.pdf` | `3c7244b73764477773b8a7aae0e7ed6e271e1574cb0742189e4c74b1b631f869` |
| `193-2020.pdf` | `2020/193-2020.pdf` | `950cf120f7ef7a99a1583eec4e6973272fecafcadb4a17bb7e77af732f9f8944` |
| `anexo-026-2021.pdf` | `2021/anexo-026-2021.pdf` | `8096a201e3f0bab0c2ee441c6c09cdeb8483ccb3569d162be50afff98ceda0c8` |
| `026-2021.pdf` | `2021/026-2021.pdf` | `5998e59fa0142e9f87650f193a35d88f7c24c7ba7fe57b985513f608bba9b6cb` |
| `anexo-165-2021.pdf` | `2021/anexo-165-2021.pdf` | `cbe50c786ca161891965414d384496aa897c18a06bcb81194ca9d8b5c9a46ec3` |
| `165-2021.pdf` | `2021/165-2021.pdf` | `39f148d9f0f8379f663183fb9191b5784662952f03859a8ae440b70f1d9c9cfb` |
| `anexo-123-2022.pdf` | `2022/anexo-123-2022.pdf` | `ea743fa203d413d13223556bb895093025fb5ccbbc7c7c37bb3cff078c4f06dd` |
| `123-2022.pdf` | `2022/123-2022.pdf` | `80ba7e64e32a21a25f823fbdf65a8885cc394f33966e502914cc069a1ed89185` |
| `anexo-000005-2023.pdf` | `2023/anexo-000005-2023.pdf` | `b7431888a1414515b8a36b1e3ff6db507a86e4d0ff99167024c95d6d04758cdb` |
| `feErratas-000005-2023.pdf` | `2023/feErratas-000005-2023.pdf` | `5818fe164f25db0ea33fde52a3d2f5df5a59647dd0667e1442a9dc492d2b2545` |
| `000005-2023.pdf` | `2023/000005-2023.pdf` | `f03c3629cb05e90b3d5255225c7000019794374df3ba9c90d25fda4c188c7476` |
| `anexo-000048-2026.pdf` | `2026/anexo-000048-2026.pdf` | `2a509a4e890c115c6704a92172c24c2908accec3d234b3f655ad780041a546be` |
| `000048-2026.pdf` | `2026/000048-2026.pdf` | `098212468fdadce35d23ce1fc909e8494f9d5ea079adc13b87fc07805aa48948` |
| `000143-2026.pdf` | `2026/000143-2026.pdf` | `a96a028fdc873cc5b8113854ae6dff1e70f3788331e06458f5548884b450a927` |

## MONEDA

- **Fuente:** el catálogo 02 de SUNAT no trae lista propia; remite a ISO 4217. Se usó la «List One» de SIX Group, agencia de mantenimiento de ISO 4217: https://www.six-group.com/dam/download/financial-information/data-center/iso-currrency/lists/list-one.xml
- **Versión oficial:** `ISO4217-2026-09-17`, la fecha de publicación que trae el archivo.
- **Filas:** 178, un código por moneda.
- **Transformaciones:**
  - `Ccy` → `codigo`, `CcyNbr` → `codigo_externo` (código numérico ISO), `CcyNm` → `descripcion` (en inglés, como lo publica ISO);
  - se descartan los países sin moneda universal y se deja una fila por código.

## CIE10

- **Fuente:** MINSA, REUNIS, «Catálogos y manuales» (https://www.minsa.gob.pe/reunis/?op=3&niv=1), enlace «CIE-10 (OPS)»: https://www.minsa.gob.pe/reunis/data/volumen1-2018.pdf. Es el volumen 1 («Lista de categorías») de la *Clasificación estadística internacional de enfermedades y problemas relacionados con la salud*, 10.ª revisión, edición de 2018, de la OPS (Publicación Científica 638, ISBN 978-92-75-32020-4). Se basa en la quinta edición de la OMS, de 2016.
- **Versión oficial:** `OPS-2018`.
- **Filas:** 11 132 (2 049 categorías de 3 caracteres y 9 083 subcategorías de 4).
- **Transformaciones:**
  - El texto se extrajo del PDF reconstruyendo las líneas por posición en la página (pdfjs). Se descartó el texto rotado, que es la marca de agua «Material de capacitación…» de cada página.
  - Las **categorías** salen de la «Lista de tres caracteres». Las **subcategorías**, de la lista tabular, solo si su categoría existe.
  - Una categoría con subcategorías que la lista de tres caracteres no traía tomó su título de la lista tabular.
  - Un título partido en dos líneas se unió:
    - siempre que la segunda empieza en minúscula;
    - cuando la primera termina en preposición o artículo, aunque la segunda empiece en mayúscula (nombres propios como «Pontiac» o «Falopio»).
  - Los términos de inclusión, «Incluye:» y «Excluye:» no forman parte del título.
  - Se conservan los símbolos de la clasificación (`†`, `*`) que aparecen dentro de los títulos y se quitan los caracteres gráficos de llave.
  - **J10.0, J10.1 y J10.8** se transcribieron a mano del mismo PDF: su página compone los títulos con llaves gráficas y la extracción automática los desordena.
- **Nota:** el MINSA también publica «CIE-10 (MINSA – Excel)» (https://files.minsa.gob.pe/s/szimSEZTwFrQR25), que puede traer las adaptaciones nacionales y las 5.ª posiciones que usa HIS. El servidor rechazó la descarga automática (HTTP 403). Si se consigue, conviene compararlo con este archivo antes de la carga en producción.

## UNIDAD_MEDIDA

- **Fuente:** el catálogo 03 de SUNAT remite a la Recomendación 20 de UN/CEFACT («Codes for Units of Measure Used in International Trade»), publicada en https://unece.org/trade/uncefact/cl-recommendations. Archivo usado: `rec20_Rev17e-2021.xlsx`, revisión 17 (2021).
- **Versión oficial:** `UNECE-REC20-REV17`.
- **Filas:** 1 827. La hoja «Annex II & Annex III» tiene 2 136.
- **Transformaciones:**
  - Columnas de la hoja: `Common Code` → `codigo`, `Name` → `descripcion`, `Symbol` → `abreviatura` cuando tiene hasta 30 caracteres; 1 565 filas la traen.
  - **`descripcion` está traducida al español latino; no es texto oficial.** UN/CEFACT publica los nombres solo en inglés. `codigo` y `abreviatura` se mantienen exactamente como en el archivo oficial.
  - Criterios de la traducción:
    - nombres del SI en su forma española (metro, litro, kilogramo, vatio, julio, amperio, voltio);
    - `ohm` y `hertz` sin cambio;
    - (UK) → (RU) y (US) → (EE. UU.);
    - «X per Y» → «X por Y» y «square / cubic X» → «X cuadrado / cúbico»;
    - las unidades con nombre propio, o sin traducción establecida, quedan como en el original (gauss, henry, poise, kilobyte, slug, gill, peck…); 140 filas coinciden con el inglés por eso.
  - Revisión hecha: mismas filas y en el mismo orden, códigos y abreviaturas idénticos al original, ninguna descripción de más de 200 caracteres.
  - Se excluyen las 309 entradas marcadas para borrar (`X`): son las unidades de embalaje antiguas, que la Rec. 20 reemplazó por los códigos de la Rec. 21 con prefijo X.
  - Se conservan las vigentes, las 71 en desuso (`D`) y la que tiene el valor cambiado (`¦`), para no romper comprobantes que aún las usen.
- **Nota:** los códigos de embalaje de la Rec. 21 con prefijo X (por ejemplo, XBX, caja) no están en este archivo: la Rec. 21 se mantiene aparte. Si los productos los necesitan, se agregan desde la Rec. 21.
