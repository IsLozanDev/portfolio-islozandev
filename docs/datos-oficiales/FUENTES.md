# Datos oficiales de las tablas importables (spec 19b)

Los CSV de esta carpeta están en UTF-8, con el diseño de cada tabla (`DISENOS_TABLAS`), y se cargan con el propio importador (`POST /v1/catalogos/{codigo}/importaciones`). Ninguno sale de una copia de terceros.

Fechas de descarga:
- **2026-11-07:** UBIGEO, las tres tablas de SUNAT y MONEDA, bajadas por el entorno de trabajo.
- **2026-11-08:** CIE10 y UNIDAD_MEDIDA. El usuario las bajó a mano porque los servidores rechazan la descarga automática.

Los scripts de conversión fueron de un solo uso y no están en el repo.

Verificación: cada archivo se previsualizó con `PrevisualizarImportacion` (lector, validación y diferencias reales; repositorios en memoria con la semilla del 19a). Todos dieron 0 filas inválidas.

| Tabla | Archivo | Filas | Estado |
| --- | --- | --- | --- |
| `UBIGEO` | `ubigeo.csv` | 1 891 | Listo |
| `TIPO_COMPROBANTE` | `tipo_comprobante.csv` | 17 | Listo (versión 2017, ver nota) |
| `TIPO_DOC_IDENTIDAD` | `tipo_doc_identidad.csv` | 9 | Listo (versión 2017, ver nota) |
| `AFECTACION_IGV` | `afectacion_igv.csv` | 18 | Listo (versión 2017, ver nota) |
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

## TIPO_COMPROBANTE, TIPO_DOC_IDENTIDAD y AFECTACION_IGV

- **Fuente:** SUNAT, «Anexo N.° 8 - Catálogo de códigos», anexo E de la Resolución de Superintendencia N.° 245-2017/SUNAT: https://www.sunat.gob.pe/legislacion/superin/2017/anexoE-245-2017.pdf
- **Versión oficial:** `RS-245-2017`.
- **Filas:** catálogo 01, 17 filas; catálogo 06, 9; catálogo 07, 18.
- **Transformaciones:**
  - el texto se extrajo del PDF con `pdftotext -layout`, y las descripciones partidas en dos líneas se unieron;
  - las descripciones quedan como las escribe SUNAT;
  - **TIPO_COMPROBANTE:** `codigo_externo` lleva el mismo código SUNAT, como la semilla del 19a;
  - **TIPO_DOC_IDENTIDAD:** se conservan los códigos de la semilla del 19a (`DNI` = 1, `RUC` = 6, `CE` = 4, `PASAPORTE` = 7); los demás son `DOC_` más el código SUNAT, y `codigo_externo` lleva el código SUNAT.
- **Efecto al importar en dev:** los 4 ítems de la semilla del 19a en cada tabla salen como cambios, porque la redacción oficial y el orden difieren. Los atributos `longitud` y `regex` del DNI se conservan.
- **Nota:** es una versión de 2017. La versión vigente del Anexo 8 se publica en https://cpe.sunat.gob.pe (sección de anexos), pero ese sitio rechaza la descarga automática (HTTP 403). Hay que bajarla a mano y regenerar estos tres CSV si cambió.

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
