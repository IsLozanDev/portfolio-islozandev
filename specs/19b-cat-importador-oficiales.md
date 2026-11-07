# SPEC 19b — Catálogos: importador de tablas oficiales con previsualización, aplicación en el worker y avance por SSE

> **Status:** Aprobado
> **Depends on:** SPEC 19a, SPEC 11, SPEC 12
> **Date:** 2026-11-07
> **Objective:** Importar las 7 tablas oficiales (UBIGEO, CIE10, TIPO_COMPROBANTE, UNIDAD_MEDIDA, TIPO_DOC_IDENTIDAD, AFECTACION_IGV, MONEDA) desde CSV o XLSX con una previsualización que valida el archivo completo, una aplicación todo o nada en el worker y el avance empujado al front por SSE.

## Por qué existe este spec

Es la fila 19b de `docs/roadmap-specs.md` (D-04, la parte de TR-RF-028). Contexto de apoyo: `docs/spec-context/19-cat-catalogos.md`.

El 19b del roadmap tenía 4 áreas y unas 14 h. Se parte en tres specs:

- **19b** (este): el importador, back.
- **19c** `cat-feriados-calendario`: feriados, `CalendarioPort`, `plat.calendario.sabado_habil` (TR-RF-029) y la lista de administración de ítems que el 19a dejó pendiente.
- **19d** `cat-consola-admin-ui`: la UI de consola (catálogos, ítems e importación) y la de admin cliente (propios, ajustes y feriados). Es D-06 más la parte de D-05 que no tenía dueño.

El roadmap debe actualizarse con esa partición. El spec 25 pasa a depender de 19a y 19b.

Dependencias:

- **19a**: esquema `cat`, rol `cat_editor`, lib `catalogos`, `VerificadorOperador`, `catalogo.actualizado`. Deja el manifiesto PLAT en `1.9.0`.
- **11**: worker con BullMQ y patrón de colas.
- **12**: patrón de tarea en `apps/worker` (`tarea-vencimientos.ts`, conexión Redis con `maxRetriesPerRequest: null`).

RF cubierto: **TR-RF-028** (importar tablas maestras oficiales). Criterios del SRS: **TR-CA-072, 073 y 074**. Los de todo o nada, avance, SSE y obsolescencia son propios de este spec.

Reglas:

- **TR-RN-012**: las tablas oficiales son GLOBAL y no editables por el tenant.
- **TR-RN-013**: una baja nunca borra; cierra vigencia.
- **TR-RN-027**: MIME y tamaño. El antivirus no aplica en R1 (ver Decisiones).
- **TR-RN-009**: es un cambio global sensible.

RNF propios:

- **TR-RNF-017**: conformidad con los catálogos SUNAT 01, 02, 03, 06 y 07.
- **TR-RNF-012**: validación del archivo en el servidor.
- **TR-RNF-013**: traza de cada importación hasta el spec 20.

RNF heredados: 002, 008, 010, 024, 025, 026, 101, 106, 119.

Historia del backlog: **D-04**, la parte de RF-028. Estimado: 10 h. El plan da 4 h a D-04 completa; la aplicación en el worker, el SSE, el reporte de errores y la carga de datos oficiales suman.

## Alcance

**In:**

- **Migración** `db/01f_cat_importacion.sql`, su inverso `db/rollback/01f_cat_importacion.sql` y la prueba `db/tests/01f_cat_importacion.test.sql`. Corre después de `01f_cat.sql`.
- **Semilla** en la misma migración: definiciones GLOBAL vacías de UBIGEO, CIE10, UNIDAD_MEDIDA, AFECTACION_IGV y MONEDA.
- **Dominio** en `libs/plataforma/catalogos/src/domain/importacion/`: diseños de tabla, validación de filas, cálculo de diferencias y el agregado `Importacion` con sus estados.
- **Lectores** CSV y XLSX en streaming detrás del puerto `LectorTabla`.
- **Casos de uso**:
  - `PrevisualizarImportacion`
  - `AplicarImportacion`, que encola
  - `ProcesarImportacion`, que corre en el worker
  - `ConsultarImportacion`
  - `ListarImportaciones`
  - `SeguirImportacion`, el stream SSE
- **Cola** BullMQ `cat-importaciones` y su procesador registrado en `apps/worker`.
- **Canal de avance** con Redis pub/sub del worker a la API, y la clave de avance con TTL.
- **HTTP**: 7 rutas nuevas bajo `/v1/catalogos`: una es SSE y otra descarga el reporte de errores en CSV.
- **Reporte de errores**: una previsualización con filas inválidas queda `RECHAZADA` con todos sus errores (tope 10 000), y el reporte se descarga después en CSV.
- **Manifiesto PLAT `1.10.0`**: permiso `plat.catalogo.importar`, sensible, en `PLAT_PROPIETARIO`.
- **Datos oficiales**: descarga desde las fuentes oficiales y conversión al diseño de cada tabla. Los archivos quedan en `docs/datos-oficiales/` con `FUENTES.md` (URL y fecha de descarga) y se cargan en dev con el propio importador.
- **Pruebas**: dominio (Jest); SQL (PGlite en local, PostgreSQL 16 en CI); integración con PostgreSQL 16 y Redis 7 (CI); HTTP con supertest, SSE incluido.

**Out of scope (para otros specs):**

- **Feriados, `CalendarioPort`, `sabado_habil` y la lista paginada de administración de ítems**: spec 19c.
- **UI de importación y de catálogos**: spec 19d. Contrato que el 19d debe cumplir con lo que deja este spec:
  - Un servicio a nivel de app (no de página) abre el SSE de cada importación activa del usuario. El usuario sigue navegando mientras tanto.
  - Al iniciar sesión o recargar, recupera las activas con `GET /v1/catalogos/importaciones?activas=true`.
  - Muestra el porcentaje en un indicador del shell o en un panel flotante.
  - Al recibir `fin`, avisa con un toast de `AvisosService`: resumen si quedó `APLICADA`, motivo si quedó `FALLIDA` u `OBSOLETA`.
  - Abre el stream con `fetch` en streaming y el Bearer. Si se corta, hace un solo `GET` del estado y reconecta. Sin polling periódico.
- **Opciones de menú de catálogos e importación**: 19d.
- **TR-ARC** (guardar el archivo original) y el antivirus: R2. El archivo se procesa en memoria y se descarta; queda su sha256.
- **Auditoría persistente TR-AUD**: spec 20. Este spec deja `cat.importacion` y el evento `catalogo.importacion_aplicada`.
- **Importar catálogos que no sean los 7 oficiales, o ítems propios de un tenant.**
- **Sincronización automática con SUNAT, INEI o MINSA.** No hay API oficial: los archivos se descargan y se importan a mano.
- **Cancelar una importación en curso.**
- **Proyecto prod**: plan de migración a producción.

## Base de código reutilizada

**Se conserva (como patrón):**

- `db/01f_cat.sql`: rol `cat_editor`, funciones `SECURITY DEFINER` con `search_path = ''`, RLS `ENABLE + FORCE` con `NULLIF(current_setting('app.tenant_id', true), '')::uuid` y `REVOKE` a `anon` y `authenticated`.
- `libs/plataforma/catalogos`:
  - `CatalogosModule.register`
  - `VERIFICADOR_OPERADOR`
  - filtro de errores de `catalogos.http.ts`
  - `infrastructure/event-schemas.ts`
  - `mapeo.ts`
  - cliente Redis de `infrastructure/redis/`
- `apps/worker/src/vencimientos/tarea-vencimientos.ts`: `Queue` y `Worker` de BullMQ con conexión propia.
- `exceljs` 4.4.0, que ya está en `package.json`.

**Cambia:**

- `cat.subir_version_global()` (de `01f_cat.sql`): no sube la versión fila por fila cuando la transacción está importando. Se reemplaza con `CREATE OR REPLACE`, y el inverso restaura la versión del 19a.
- El tipo `cambio` del payload de `catalogo.actualizado` suma `IMPORTACION`.
- `plat.manifiesto.json` pasa a `1.10.0`.
- `apps/worker` registra el procesador de importaciones.
- `apps/api` pasa `colaImportaciones` a `CatalogosModule`.

**No existe** y se escribe desde cero: todo lo de importación.

## Modelo de datos

### Migración `db/01f_cat_importacion.sql`

```sql
CREATE TABLE cat.importacion (
  id                uuid         PRIMARY KEY,
  tenant_id         uuid         NOT NULL REFERENCES org.tenant (id),   -- tenant operador
  catalogo_id       uuid         NOT NULL REFERENCES cat.catalogo (id),
  version_oficial   varchar(40)  NOT NULL CHECK (char_length(version_oficial) BETWEEN 1 AND 40),
  fecha_vigencia    date         NOT NULL,
  archivo_nombre    varchar(200) NOT NULL,
  archivo_sha256    char(64)     NOT NULL,
  version_catalogo  bigint       NOT NULL,          -- cat.catalogo.version al previsualizar
  estado            varchar(14)  NOT NULL CHECK (estado IN
                      ('PREVISUALIZADA','RECHAZADA','EN_COLA','APLICADA','FALLIDA','OBSOLETA','VENCIDA')),
  altas             integer      NOT NULL,
  cambios           integer      NOT NULL,
  bajas             integer      NOT NULL,
  sin_cambios       integer      NOT NULL,
  operaciones       jsonb        NULL,              -- { altas: [...], cambios: [...], bajas: [item_id...] }; NULL al terminar
  total_errores     integer      NOT NULL DEFAULT 0, -- total real, aunque supere el tope
  errores           jsonb        NULL,              -- RECHAZADA: [{ fila, columna, valor, mensaje }], hasta 10 000; NULL al vencer
  motivo_fallo      varchar(300) NULL,
  lanzado_por       uuid         NOT NULL REFERENCES seg.usuario (id),
  creado_en         timestamptz  NOT NULL DEFAULT now(),
  encolado_en       timestamptz  NULL,                -- al encolar; NULL si vuelve a PREVISUALIZADA
  aplicado_por      uuid         NULL REFERENCES seg.usuario (id),
  terminado_en      timestamptz  NULL,
  version           bigint       NOT NULL DEFAULT 0
);
-- Una sola importación encolada por catálogo.
CREATE UNIQUE INDEX ux_importacion_activa ON cat.importacion (catalogo_id) WHERE estado = 'EN_COLA';
CREATE INDEX ix_importacion_catalogo ON cat.importacion (catalogo_id, creado_en DESC);
```

- `EN_PROCESO` no es un estado de la base. Mientras el worker aplica, la fila sigue en `EN_COLA` porque la transacción no ha terminado. El estado `EN_PROCESO` y el avance viven en Redis (ver Avance).
- `operaciones` guarda filas normalizadas, no el archivo, y se pone en NULL al llegar a un estado final. Con CIE-10 completo pesa del orden de 2 a 4 MB de jsonb.
- Una `RECHAZADA` tiene `operaciones` NULL y los contadores de altas, cambios y bajas en 0. Es un estado final; sus `errores` se borran cuando una previsualización nueva del mismo catálogo la vence.
- En `errores`, `valor` se recorta a 100 caracteres. Las tablas oficiales no traen datos personales.
- RLS `ENABLE + FORCE`:

  | Quién | Permiso | Condición |
  | --- | --- | --- |
  | App | `SELECT`, `INSERT`, `UPDATE` | `tenant_id = app.tenant_id` |
  | App | `DELETE` | No tiene |
  | `cat_editor` | `SELECT`, `UPDATE` | Para las funciones de aplicación |

- `REVOKE ALL` de la tabla y las funciones nuevas a `anon` y `authenticated` (regla 8).
- El inverso borra las funciones y la tabla, restaura `cat.subir_version_global()` y borra los 5 catálogos de la semilla solo si no tienen ítems.

### Funciones de aplicación (`SECURITY DEFINER`, dueño `cat_editor`, `search_path = ''`)

```sql
-- Bloquea el catálogo (FOR UPDATE) y la importación. Marca la transacción como importando:
-- set_config('cat.importando', p_importacion::text, true).
-- false si el estado no es EN_COLA o si cat.catalogo.version cambió desde la previsualización.
cat.iniciar_importacion(p_importacion uuid) RETURNS boolean

-- Aplica operaciones[p_desde..p_hasta) del arreglo de altas o de cambios. Exige cat.importando = p_importacion.
cat.aplicar_lote_importacion(p_importacion uuid, p_tipo varchar /* ALTA | CAMBIO */, p_desde int, p_hasta int)
  RETURNS integer                                                        -- filas escritas

-- Cierra la vigencia de todas las bajas.
cat.cerrar_bajas_importacion(p_importacion uuid) RETURNS integer

-- Sube cat.catalogo.version una sola vez, deja la importación APLICADA, operaciones = NULL
-- y quita la marca de importando. Devuelve la versión nueva.
cat.finalizar_importacion(p_importacion uuid, p_por uuid) RETURNS bigint
```

- **Altas**: `INSERT` en `cat.catalogo_item` con `tenant_id` NULL, `vigente_desde = fecha_vigencia` y `activo = true`.
- **Cambios**: `UPDATE` de `codigo_externo`, `nombre`, `abreviatura`, `orden` y de las claves de `atributos` que define el diseño. Las demás claves se conservan; por ejemplo, `longitud` y `regex` del DNI que puso el operador. Un ítem que había cerrado una importación anterior y vuelve en el archivo se reabre con `vigente_hasta` NULL y `activo` true. `vigente_desde` no cambia.
- **Bajas**: `vigente_hasta = GREATEST(fecha_vigencia - 1, vigente_desde)`. Nunca se borra, aunque el ítem no tenga referencias (TR-CA-074).
- `cat.subir_version_global()` no hace nada si `current_setting('cat.importando', true)` no es vacío. `finalizar` sube la versión una vez.
- SQL crudo justificado por la regla 11: escritura por lotes desde `jsonb_to_recordset` con `SECURITY DEFINER` y bloqueo del catálogo. TypeORM no lo expresa sin traer 14 000 entidades a memoria.

### Semilla

| Catálogo | Fuente |
| --- | --- |
| `UBIGEO` | INEI, ubigeo de distritos |
| `CIE10` | OMS / MINSA, CIE-10 |
| `UNIDAD_MEDIDA` | SUNAT catálogo 03 |
| `AFECTACION_IGV` | SUNAT catálogo 07 |
| `MONEDA` | SUNAT catálogo 02 (ISO 4217) |

Los 5 son GLOBAL, quedan sin ítems y en versión 1. `TIPO_COMPROBANTE` y `TIPO_DOC_IDENTIDAD` ya existen desde el 19a.

### Diseños de tabla (`domain/importacion/disenos-tablas.ts`)

Constante `DISENOS_TABLAS`, una entrada por tabla. La cabecera del archivo debe traer las columnas obligatorias con el nombre exacto. Las mayúsculas, los espacios al borde y el orden no importan. Una columna desconocida es un error.

| Tabla | Obligatorias | Opcionales | `codigo` válido | A `atributos` |
| --- | --- | --- | --- | --- |
| `UBIGEO` | `codigo`, `descripcion`, `departamento`, `provincia` | `orden` | `^[0-9]{6}$` | `departamento`, `provincia` |
| `CIE10` | `codigo`, `descripcion` | `orden` | `^[A-Z][0-9][0-9A-Z](\.?[0-9A-Z]{1,2})?$` | — |
| `TIPO_COMPROBANTE` | `codigo`, `descripcion` | `codigo_externo`, `abreviatura`, `orden` | `^[0-9]{2}$` | — |
| `UNIDAD_MEDIDA` | `codigo`, `descripcion` | `abreviatura`, `orden` | `^[A-Z0-9]{1,3}$` | — |
| `TIPO_DOC_IDENTIDAD` | `codigo`, `codigo_externo`, `descripcion` | `abreviatura`, `orden` | `^[A-Z0-9_]{1,40}$` | — |
| `AFECTACION_IGV` | `codigo`, `descripcion` | `orden` | `^[0-9]{2}$` | — |
| `MONEDA` | `codigo`, `descripcion` | `codigo_externo`, `abreviatura`, `orden` | `^[A-Z]{3}$` | — |

- `descripcion` va a `nombre` (1-200 caracteres). Sin `orden`, el orden es el número de fila.
- En `TIPO_DOC_IDENTIDAD` la clave es `codigo`. El archivo convertido conserva los códigos de la semilla del 19a (`DNI`, `RUC`, `CE`, `PASAPORTE`) y para los demás usa `DOC_` más el código SUNAT. `codigo_externo` lleva el código SUNAT.
- En `TIPO_COMPROBANTE`, `codigo_externo` lleva el código SUNAT, como la semilla del 19a. Sin la columna, una importación dejaría `codigo_externo` en NULL.
- Un código repetido dentro del archivo es un error de fila.

### Archivo

| Regla | Valor | Error |
| --- | --- | --- |
| Tamaño | ≤ 20 MB (`TAMANO_MAXIMO_ARCHIVO`) | 413 `ARCHIVO_DEMASIADO_GRANDE` |
| Tipo | `.csv` (`text/csv`) o `.xlsx` con firma ZIP (`PK\x03\x04`) | 400 `ARCHIVO_INVALIDO` «Solo se aceptan archivos CSV o XLSX» |
| CSV | UTF-8 estricto (`TextDecoder` con `fatal`), BOM permitido, separador `,` o `;` detectado en la cabecera | 400 `ARCHIVO_INVALIDO` «El archivo no está en UTF-8» |
| XLSX | Primera hoja; primera fila como cabecera; celdas leídas como texto | 400 `ARCHIVO_INVALIDO` |
| Filas | 1 a 50 000 (`FILAS_MAXIMAS`) | 400 `ARCHIVO_INVALIDO` |
| Cabecera | Columnas del diseño | 400 `COLUMNAS_INVALIDAS` «Falta la columna descripcion» (TR-CA-073), o «Columna desconocida: x» |
| Filas inválidas | Ninguna | 422 `FILAS_INVALIDAS` con `{ importacion_id, total_errores, errores: [{ fila, columna, valor, mensaje }] }`. La respuesta trae los primeros 100 (`ERRORES_EN_RESPUESTA`); el reporte completo se descarga en CSV |

### Dominio

```ts
// domain/importacion/tipos.ts
export const TABLAS_IMPORTABLES = ['UBIGEO','CIE10','TIPO_COMPROBANTE','UNIDAD_MEDIDA',
                                   'TIPO_DOC_IDENTIDAD','AFECTACION_IGV','MONEDA'] as const;
export type EstadoImportacion = 'PREVISUALIZADA' | 'RECHAZADA' | 'EN_COLA' | 'APLICADA' | 'FALLIDA' | 'OBSOLETA' | 'VENCIDA';
export type EstadoSeguimiento = EstadoImportacion | 'EN_PROCESO';   // EN_PROCESO solo en Redis
export const HORAS_VIGENCIA_PREVISUALIZACION = 24;
export const TAMANO_LOTE = 1_000;
export const ERRORES_EN_RESPUESTA = 100;
export const ERRORES_MAXIMOS_GUARDADOS = 10_000;   // se sigue contando total_errores más allá del tope

// domain/importacion/fila-importada.ts: fila normalizada y validada contra el diseño.
export interface FilaImportada { numero: number; codigo: string; codigoExterno: string | null; nombre: string;
                                 abreviatura: string | null; orden: number; atributos: Record<string, string> }

// domain/importacion/calcular-diferencias.ts (función pura)
export function calcularDiferencias(filas: FilaImportada[], actuales: ItemGlobalActual[], fechaVigencia: string):
  { altas: FilaImportada[]; cambios: CambioItem[]; bajas: ItemGlobalActual[]; sinCambios: number };

// domain/importacion/importacion.ts (AggregateRoot con version)
export class Importacion extends AggregateRoot {
  static previsualizar(datos: {...}): Importacion;          // estado PREVISUALIZADA
  static rechazar(datos: {...; errores; totalErrores }): Importacion;   // estado RECHAZADA, final
  encolar(por: string, ahora: Date): void;                  // PREVISUALIZADA -> EN_COLA; VENCIDA si pasaron 24 h
  marcarFallida(motivo: string, ahora: Date): void;         // EN_COLA -> FALLIDA
  revisarPerdida(ahora: Date): boolean;                     // EN_COLA desde encolado_en por más de HORAS_MAXIMAS_EN_COLA (1) -> FALLIDA
  marcarObsoleta(ahora: Date): void;                        // EN_COLA -> OBSOLETA
  vencer(ahora: Date): void;                                // PREVISUALIZADA -> VENCIDA
}
```

- **Baja**: un ítem global que sigue vigente en `fecha_vigencia` (`vigente_hasta` NULL o mayor o igual) y no está en el archivo. Los ítems ya cerrados no cuentan como baja.
- **Cambio**: alguno de `codigo_externo`, `nombre`, `abreviatura`, `orden` o de los atributos del diseño es distinto, o el ítem estaba cerrado o inactivo.
- **Transición inválida**: `ImportacionNoAplicableError`.

Errores nuevos:

| Clase | `code` | HTTP | Mensaje |
| --- | --- | --- | --- |
| `TablaNoImportableError` | `TABLA_NO_IMPORTABLE` | 400 | El catálogo no es una tabla oficial importable |
| `ArchivoInvalidoError(mensaje)` | `ARCHIVO_INVALIDO` | 400 | Tabla Archivo |
| `ArchivoDemasiadoGrandeError` | `ARCHIVO_DEMASIADO_GRANDE` | 413 | El archivo supera los 20 MB |
| `ColumnasInvalidasError(mensaje)` | `COLUMNAS_INVALIDAS` | 400 | Tabla Archivo |
| `FilasInvalidasError(errores, total)` | `FILAS_INVALIDAS` | 422 | El archivo tiene filas inválidas; no se importó nada |
| `ImportacionNoEncontradaError` | `IMPORTACION_NO_ENCONTRADA` | 404 | La importación no existe |
| `ImportacionNoAplicableError(estado)` | `IMPORTACION_NO_APLICABLE` | 409 | La importación está en estado {estado} y no se puede aplicar |
| `ImportacionEnCursoError` | `IMPORTACION_EN_CURSO` | 409 | Ya hay una importación en curso para este catálogo |
| `ColaNoDisponibleError` | `COLA_NO_DISPONIBLE` | 503 | No se pudo encolar la importación; intente de nuevo |

### Puertos (`application/ports/importacion.ts`)

```ts
LectorTabla            { leer(archivo: Buffer, tipo: 'CSV' | 'XLSX'): AsyncIterable<{ numero: number; celdas: Record<string, string> }>;
                         cabecera(...): string[] }   // CSV con csv-parse; XLSX con el lector en streaming de exceljs
RepositorioImportaciones { buscar(id): Importacion | null; guardar(importacion, versionAnterior | null): boolean;
                           listarPorCatalogo(catalogoId, pagina): Pagina<Importacion>;
                           activasDe(usuarioId): Importacion[]; vencerPrevias(catalogoId, ahora): void }
LecturaItemsGlobales   { de(catalogoId): ItemGlobalActual[] }                 // TypeORM; RLS deja leer globales
EscrituraImportacion   { iniciar(id): boolean; aplicarLote(id, tipo, desde, hasta): number;
                         cerrarBajas(id): number; finalizar(id, por): bigint } // funciones DEFINER
export const COLA_IMPORTACIONES = Symbol('ColaImportaciones');
ColaImportaciones      { encolar(trabajo: { importacionId; tenantId; usuarioId }): void }   // jobId = importacionId
CanalAvance            { publicar(id, aviso: AvisoImportacion): void; ultimo(id): AvisoImportacion | null;
                         suscribir(id): AsyncIterable<AvisoImportacion> }
```

- `CanalAvance` tiene una implementación Redis (`infrastructure/redis/canal-avance.redis.ts`) y otra en memoria para pruebas.
- `ColaImportaciones` vive en `infrastructure/bullmq/cola-importaciones.bullmq.ts`.

### Avance (Redis)

```ts
type AvisoImportacion =
  | { tipo: 'avance'; estado: 'EN_COLA' | 'EN_PROCESO'; avance: number }        // 0-100
  | { tipo: 'fin'; estado: 'APLICADA' | 'FALLIDA' | 'OBSOLETA';
      resumen: { altas; cambios; bajas; sin_cambios } | null; motivo: string | null };
canal = `cat:importacion:${id}`;            // pub/sub
clave = `cat:importacion:${id}:avance`;     // último aviso, TTL 3 600 s
```

- `avance = round(operaciones hechas / (altas + cambios + bajas) × 99)`. Se publica después de cada lote y de las bajas. El 100 llega solo con el `fin`, después del commit.
- Si Redis falla al publicar, se registra el aviso `cat.importacion.avance_error` y el job sigue. El avance es informativo; el estado verdadero está en la base.

### Casos de uso: puntos no obvios

**`PrevisualizarImportacion`** (síncrono en la API):

1. Llama a `VerificadorOperador.exigir`. El catálogo debe estar en `TABLAS_IMPORTABLES`; si no, `TablaNoImportableError`.
2. Valida el tamaño y el tipo. Lee en streaming y valida **todas** las filas antes de escribir ítems; no se detiene en el primer error.
3. Errores de archivo o de cabecera (400, 413) no guardan nada: no hay filas que reportar.
4. Con una o más filas inválidas, guarda una importación `RECHAZADA` con hasta 10 000 errores y el total real, y responde 422 con su `id` y los primeros 100. Ningún ítem se toca.
5. Sin errores, calcula las diferencias contra los ítems globales actuales y el sha256.
6. En una transacción vence las previsualizaciones anteriores del catálogo (`PREVISUALIZADA` o `RECHAZADA` pasan a `VENCIDA`, con `operaciones` y `errores` en NULL) y guarda la nueva.
7. Responde con el resumen y una muestra de hasta 20 de cada tipo. Los cambios llevan antes y después.

**`DescargarErrores`** (reporte CSV generado en el back):

1. Solo para importaciones `RECHAZADA` del tenant; otro estado da 409 `IMPORTACION_NO_APLICABLE` y otro tenant, 404.
2. Escribe el CSV en streaming desde `errores`, sin librería:
   - BOM UTF-8 al inicio, para que Excel muestre tildes y ñ;
   - separador `;`, el que espera Excel en español;
   - comillas dobles en los valores con `;`, comillas o saltos de línea;
   - cabecera `fila;columna;valor;mensaje`, ordenado por fila.
3. Si `total_errores` supera 10 000, la última línea dice «Se muestran 10 000 de N errores».
4. Nombre del archivo: `errores-{codigo}-{fecha}.csv`.

**`AplicarImportacion`** (síncrono, solo encola):

1. Llama a `VerificadorOperador.exigir`. La importación debe ser del tenant (RLS); si no, 404.
2. Ejecuta `importacion.encolar`. Si pasaron 24 h queda `VENCIDA` y responde 409 `IMPORTACION_NO_APLICABLE`.
3. Guarda `EN_COLA`. Si se viola `ux_importacion_activa`, responde `ImportacionEnCursoError`.
4. Después del commit, `ColaImportaciones.encolar` con `jobId = importacionId`. Si falla, devuelve la importación a `PREVISUALIZADA` en otra transacción y responde 503 `COLA_NO_DISPONIBLE`.
5. Publica `{ avance: 0, estado: 'EN_COLA' }` y responde 202.

**`ProcesarImportacion`** (worker, `attempts: 2`):

1. Abre una transacción con `app.tenant_id` del trabajo y llama a `iniciar`. Si devuelve false:
   - con el estado ya final, termina sin hacer nada (idempotencia del reintento);
   - con la versión cambiada, cierra la transacción, marca `OBSOLETA` en otra y publica `fin`.
2. Publica `EN_PROCESO`. Aplica las altas y los cambios en lotes de `TAMANO_LOTE` y publica el avance después de cada lote. Cierra las bajas y llama a `finalizar`.
3. En la misma transacción escribe `catalogo.actualizado` y `catalogo.importacion_aplicada` en el outbox (regla 4).
4. Hace commit y publica `fin` `APLICADA`.
5. **Fallo a mitad**:
   - el rollback deshace todo y el catálogo queda como estaba;
   - en otra transacción se marca `FALLIDA` con un motivo sin datos personales (máximo 300) y se publica `fin`;
   - no se reintenta: el operador corrige y vuelve a previsualizar.
6. Si el worker muere a mitad, PostgreSQL deshace la transacción y la fila sigue en `EN_COLA`. BullMQ reintenta el trabajo estancado y el paso 1 lo hace seguro.

**`SeguirImportacion`** (SSE):

1. Solo para quien la lanzó; para cualquier otro, 404.
2. Lo primero que envía es el estado actual: `ultimo(id)` de Redis, o el estado de la base si no hay aviso. Si ya es final, envía `fin` y cierra.
3. Después reenvía cada aviso del canal hasta `fin`. Manda `: ping` cada 15 s y cierra a los 15 min (`MINUTOS_MAXIMOS_STREAM`); el front reconecta.

### Eventos (outbox, `schema_version = 1`)

| `event_type` | `aggregate_type` | Payload |
| --- | --- | --- |
| `catalogo.actualizado` | `catalogo` | El del 19a, con `cambio = 'IMPORTACION'`, `item_id` NULL y `tenant_id` NULL |
| `catalogo.importacion_aplicada` | `catalogo` | `importacion_id`, `catalogo_id`, `codigo`, `version_oficial`, `fecha_vigencia`, `archivo_sha256`, `altas`, `cambios`, `bajas`, `version_global`, `por` |

- Agregar `IMPORTACION` al enum de `cambio` no cambia `schema_version`: el campo ya era un texto con valores conocidos y los consumidores deben ignorar los desconocidos. Se anota en `event-schemas.ts`.

### Permiso (manifiesto PLAT `1.10.0`)

| Código | `alcance_minimo` | `sensible` | Roles |
| --- | --- | --- | --- |
| `plat.catalogo.importar` | `TENANT` | sí | `PLAT_PROPIETARIO` |

Solo sirve en el tenant operador, porque los casos de uso exigen `VerificadorOperador`. Sin opciones de menú.

### HTTP

Todas con `@ApiBearerAuth()`, `X-Sucursal-Id`, permiso `plat.catalogo.importar` (401 step-up con aal1), errores `{ codigo, mensaje }` y `snake_case`. Las rutas estáticas `importaciones` se declaran antes de las de `{codigo}`.

| Método y ruta | Entrada | Éxito |
| --- | --- | --- |
| `POST /v1/catalogos/{codigo}/importaciones` | `multipart/form-data`: `archivo`, `version_oficial`, `fecha_vigencia` (`YYYY-MM-DD`) | 201 `{ id, estado, version_oficial, fecha_vigencia, archivo_sha256, resumen: { altas, cambios, bajas, sin_cambios, total_filas }, muestra: { altas, cambios, bajas }, vence_en }` |
| `GET /v1/catalogos/{codigo}/importaciones` | `pagina`, `tamano` (≤ 50) | 200 historial, el más reciente primero, con las `RECHAZADA` y su `total_errores`; sin `operaciones` ni `errores` |
| `GET /v1/catalogos/importaciones/{id}/errores.csv` | — | 200 `text/csv; charset=utf-8` con `Content-Disposition: attachment` |
| `GET /v1/catalogos/importaciones?activas=true` | — | 200 importaciones `EN_COLA` lanzadas por el usuario, con `estado` y `avance` desde Redis |
| `GET /v1/catalogos/importaciones/{id}` | — | 200 `{ id, codigo, estado, avance, resumen, motivo_fallo, ... }`; `estado` es `EN_PROCESO` si Redis lo dice y la base sigue en `EN_COLA` |
| `POST /v1/catalogos/importaciones/{id}/aplicar` | `{ version }` | 202 `{ id, estado: 'EN_COLA' }` |
| `GET /v1/catalogos/importaciones/{id}/eventos` | — | 200 `text/event-stream` con eventos `avance` y `fin` (`data` = `AvisoImportacion` en JSON); cabeceras `Cache-Control: no-cache` y `X-Accel-Buffering: no` |

- El multipart usa `memoryStorage` con `limits.fileSize` de 20 MB. Nada toca el disco.
- Id que no es UUID, o importación de otro tenant: 404 `IMPORTACION_NO_ENCONTRADA`.

### Configuración

Sin variables nuevas. `CatalogosModule.register({ ..., colaImportaciones })` usa el mismo `redisUrl`. El worker registra `ImportacionesModule` (`apps/worker/src/importaciones/`) con la conexión Redis del patrón de vencimientos. Nombre de la cola: `cat-importaciones`.

### Datos oficiales (`docs/datos-oficiales/`)

- Un CSV por tabla en UTF-8 con el diseño de la tabla: `ubigeo.csv`, `cie10.csv`, `tipo_comprobante.csv`, `unidad_medida.csv`, `tipo_doc_identidad.csv`, `afectacion_igv.csv` y `moneda.csv`.
- `FUENTES.md` registra por tabla:
  - la URL oficial;
  - la fecha de descarga;
  - la versión oficial;
  - el número de filas;
  - las transformaciones aplicadas.
- Fuentes: SUNAT, Anexo 8 de UBL 2.1 (catálogos 01, 02, 03, 06 y 07); INEI o RENIEC para el ubigeo; MINSA para la CIE-10.
- El script de conversión es de un solo uso y queda en el scratchpad, no en el repo.
- Si una fuente no responde o no es oficial, se anota en `FUENTES.md` y esa tabla queda pendiente. Nunca se usa una copia de un tercero como si fuera oficial.

## Plan de implementación

1. **Migración y semilla.**
   - Crear `db/01f_cat_importacion.sql`, su inverso y `db/tests/01f_cat_importacion.test.sql`.
   - Casos de la prueba SQL:
     - las 4 funciones con un catálogo de prueba: altas, cambios que conservan atributos ajenos al diseño, reapertura de un ítem cerrado, y bajas con `vigente_hasta = fecha - 1` y con el tope `vigente_desde`;
     - la versión del catálogo sube exactamente 1 al finalizar;
     - `iniciar` da false con la versión cambiada y con el estado distinto de `EN_COLA`;
     - `aplicar_lote` sin `iniciar` falla;
     - `ux_importacion_activa`;
     - RLS entre dos tenants con `cat_test_app`;
     - los 5 catálogos de la semilla quedan en versión 1.
   - Verificar: `db:up`, `db:down`, `db:up` y la prueba SQL en PGlite y en CI.
2. **Dominio.**
   - Crear `tipos.ts`, `disenos-tablas.ts`, `validar-fila.ts`, `calcular-diferencias.ts`, `importacion.ts` y los errores.
   - Pruebas:
     - cada fila de las tablas de diseño y de archivo;
     - falta `descripcion` en CIE10 da «Falta la columna descripcion» (TR-CA-073);
     - UBIGEO de 1 874 a 1 892 filas da 18 altas (TR-CA-072);
     - el distrito 150199 ausente queda como baja con `vigente_hasta` (TR-CA-074);
     - código repetido en el archivo;
     - transiciones de estado y vencimiento a las 24 h.
   - Verificar: `pnpm nx test catalogos` y cobertura de `src/domain/**` ≥ 70 %.
3. **Lectores.**
   - Crear `LectorCsv` (csv-parse, UTF-8 estricto, BOM y separador) y `LectorXlsx` (lector en streaming de exceljs).
   - Pruebas:
     - los XLSX se generan en la prueba con exceljs y no se suben binarios al repo;
     - CSV con `;` y con BOM;
     - Latin-1 rechazado;
     - un `.xlsx` que no es ZIP rechazado;
     - 50 001 filas rechazado.
   - Verificar: `pnpm nx test catalogos`.
4. **Previsualizar y consultar.**
   - Crear `PrevisualizarImportacion`, `ConsultarImportacion`, `ListarImportaciones`, `RepositorioImportaciones` (TypeORM) y `LecturaItemsGlobales`.
   - Pruebas:
     - con una fila inválida entre 5 000 válidas responde 422, guarda la `RECHAZADA` y no toca ningún ítem;
     - 15 000 filas con 3 000 inválidas: la respuesta trae 100 errores y `total_errores = 3000`; el CSV trae las 3 000 líneas;
     - 12 000 filas inválidas: se guardan 10 000 y el CSV termina con «Se muestran 10 000 de 12 000 errores»;
     - el CSV empieza con BOM, usa `;` y escapa un valor con `;` y comillas;
     - una previsualización nueva vence la anterior;
     - un actor fuera del operador recibe 403;
     - `TIPO_COMPROBANTE` se acepta y `MEDIO_PAGO` da `TABLA_NO_IMPORTABLE`.
   - Verificar: `pnpm nx test catalogos` (integración en CI).
5. **Aplicar en el worker.**
   - Crear `AplicarImportacion`, `ProcesarImportacion`, `EscrituraImportacion`, `ColaImportacionesBullmq`, `CanalAvanceRedis` y el `ImportacionesModule` del worker.
   - Pruebas:
     - aplicar deja los ítems, sube la versión una vez y escribe los dos eventos en el outbox en la misma transacción;
     - un fallo forzado en el tercer lote no deja ningún ítem escrito, la importación queda `FALLIDA` y la versión no cambia;
     - un cambio global entre previsualizar y aplicar da `OBSOLETA`;
     - un segundo aplicar del mismo catálogo da 409 `IMPORTACION_EN_CURSO`;
     - reprocesar un trabajo ya `APLICADO` no escribe nada;
     - con la cola caída responde 503 y la importación vuelve a `PREVISUALIZADA`;
     - los avisos de avance son crecientes y terminan en `fin`.
   - Verificar: `pnpm nx test catalogos` y `pnpm nx test worker` (PostgreSQL 16 y Redis 7 en CI).
6. **HTTP, SSE y manifiesto.**
   - Agregar al controlador las 7 rutas, el multipart, `@Sse` con el puente de `CanalAvance` y el manifiesto PLAT `1.10.0`.
   - Pruebas supertest, una por cada fila de la tabla HTTP y además:
     - 413 con 20 MB + 1 byte;
     - el SSE entrega el estado actual, los avances y el `fin`, y cierra;
     - el SSE de otro usuario da 404;
     - con aal1 responde 401 step-up;
     - aplicar el manifiesto dos veces da 0 cambios.
   - Verificar: `pnpm nx run-many -t lint test build` con código 0 y las rutas en `/v1/docs`.
7. **Datos oficiales.**
   - Descargar de las fuentes oficiales y convertir a los 7 CSV. Dejarlos en `docs/datos-oficiales/` con `FUENTES.md`.
   - Previsualizar cada archivo con la API local contra PGlite: 0 filas inválidas.
   - Verificar: el resumen de cada previsualización coincide con el número de filas de `FUENTES.md`.
8. **Nube, dev (manual).**
   - Ejecutar `pnpm db:up:remoto` y `pnpm manifiesto:aplicar:remoto` con el PLAT `1.10.0`.
   - Revisar con el MCP que `cat.importacion` no está en la Data API y que `get_advisors` no trae alertas nuevas.
   - Con la API y el worker locales contra dev, importar las 7 tablas. Registrar el tiempo de aplicación de CIE-10 y la secuencia del SSE.
   - Dejar la evidencia en `docs/ops/supabase-ambientes.md`.

## Criterios de aceptación

**Importación (TR-RF-028):**

- [ ] UBIGEO con 1 874 distritos, al importar un archivo de 1 892, previsualiza 18 altas y después de aplicar tiene 1 892 ítems vigentes (TR-CA-072).
- [ ] Un CIE10 sin la columna `descripcion` responde 400 `COLUMNAS_INVALIDAS` «Falta la columna descripcion» (TR-CA-073).
- [ ] El distrito 150199, ausente del archivo, queda con `vigente_hasta = fecha_vigencia - 1` y no se borra (TR-CA-074).
- [ ] Un cambio conserva las claves de `atributos` que no son del diseño; por ejemplo, `longitud` y `regex` del DNI.
- [ ] Se aceptan CSV (con `,` o `;`, con o sin BOM) y XLSX; Latin-1, un archivo que no es CSV ni XLSX y más de 20 MB se rechazan con su código.

**Todo o nada:**

- [ ] Un archivo con una sola fila inválida responde 422 `FILAS_INVALIDAS` con el número de fila, deja la importación `RECHAZADA` y no toca ningún ítem.

**Reporte de errores:**

- [ ] Con 3 000 filas inválidas, la respuesta 422 trae 100 errores y `total_errores = 3000`.
- [ ] `GET .../importaciones/{id}/errores.csv` descarga las 3 000 líneas con `fila;columna;valor;mensaje`, BOM UTF-8 y separador `;`, y se abre en Excel con tildes correctas.
- [ ] Con más de 10 000 errores, el CSV trae 10 000 y la línea «Se muestran 10 000 de N errores».
- [ ] La importación `RECHAZADA` aparece en el historial y su CSV se puede descargar después, hasta que una previsualización nueva del catálogo la vence.
- [ ] Un fallo durante la aplicación no deja ningún ítem escrito; la importación queda `FALLIDA` con motivo y `cat.catalogo.version` no cambia.
- [ ] Si el catálogo cambió desde la previsualización, la aplicación termina `OBSOLETA` sin escribir.
- [ ] Una aplicación correcta sube `cat.catalogo.version` exactamente en 1 y cambia el ETag de `GET /v1/catalogos/{codigo}/items`.
- [ ] Reprocesar un trabajo ya aplicado no escribe nada.

**Worker, avance y SSE:**

- [ ] `POST .../aplicar` responde 202 sin esperar la escritura.
- [ ] El SSE de quien lanzó la importación entrega primero el estado actual, después avances crecientes y por último `fin`, y luego cierra.
- [ ] El SSE responde 404 a otro usuario. `?activas=true` solo lista las importaciones del usuario.
- [ ] Una segunda aplicación del mismo catálogo mientras otra está en cola responde 409 `IMPORTACION_EN_CURSO`.
- [ ] Con Redis caído al encolar responde 503 `COLA_NO_DISPONIBLE` y la importación sigue `PREVISUALIZADA`.
- [ ] Una previsualización de más de 24 h responde 409 `IMPORTACION_NO_APLICABLE` y queda `VENCIDA`.

**Seguridad, eventos y calidad:**

- [ ] Un actor fuera del tenant operador recibe 403 `OPERADOR_REQUERIDO`; sin el permiso, 403; con aal1, 401 step-up.
- [ ] La aplicación deja `catalogo.actualizado` (`cambio = IMPORTACION`) y `catalogo.importacion_aplicada` en el outbox en la misma transacción, sin nombres ni correos.
- [ ] `db:up && db:down && db:up` termina con 0 en CI, y `db:down` deja la base como la dejó el spec 19a.
- [ ] Desde el tenant A, con `cat_test_app`, no se lee ni se modifica una importación de B.
- [ ] `src/domain` no importa `@nestjs/*`, `typeorm`, `bullmq`, `exceljs` ni `csv-parse`.
- [ ] Cobertura de líneas de `src/domain/**` ≥ 70 %.
- [ ] Las 7 rutas figuran en `/v1/docs` con sus códigos de error.
- [ ] El código nuevo sigue la sección «Código limpio» de `CLAUDE.md` y pasó por `code-simplifier`.
- [ ] `pnpm nx run-many -t lint test build` termina con código 0 y `nx affected` está en verde en CI.

**Datos y nube (verificación manual, con evidencia en `docs/ops/supabase-ambientes.md`):**

- [ ] `docs/datos-oficiales/` tiene los 7 CSV y `FUENTES.md` con URL oficial, fecha y número de filas, o la tabla anotada como pendiente con el motivo.
- [ ] En dev están aplicados `01f_cat_importacion.sql` y el manifiesto PLAT `1.10.0`. `cat.importacion` no está expuesta y `get_advisors` no trae alertas nuevas.
- [ ] En dev, las tablas disponibles quedaron importadas y el tiempo de aplicación de CIE-10 está registrado.
- [ ] Las horas reales de D-04 (parte de RF-028) quedan registradas en el plan.

## Decisiones

- **Sí: partición en 19b (importador), 19c (feriados y lista de administración) y 19d (UI).** La decidió el usuario. El 19b del roadmap tenía 4 áreas y unas 14 h.
- **Sí: previsualización síncrona que valida el 100 % de las filas antes de escribir.** La decidió el usuario. Ante filas corruptas no se escribe nada y el operador recibe la lista de errores.
- **Sí: aplicación en el worker con BullMQ, en una sola transacción.** La decidió el usuario. La API no se bloquea y RF-028 pide una transacción. Un fallo deja el catálogo intacto.
- **Sí: reporte de errores generado en el back, guardado en una importación `RECHAZADA` y descargable en CSV.** Lo decidió el usuario. En pantalla van 100 y en la descarga, hasta 10 000, con el total real siempre.
- **Sí: CSV con BOM y `;`, no XLSX.** Lo decidió el usuario por ser lo más rápido: texto en streaming, sin librería, y Excel lo abre directo. XLSX con las filas originales marcadas iría en otro spec si se pide.
- **Sí: tope de 10 000 errores guardados.** Más que eso indica un archivo equivocado, y el tope evita jsonb de decenas de MB.
- **No: guardar nada ante errores de archivo o de cabecera.** No hay filas que reportar; el mensaje de la respuesta basta.
- **No: reenviar el archivo con hash al aplicar.** Se eligió al principio. Con el worker, la previsualización tiene que quedar guardada para que el job no dependa del archivo.
- **No: aplicar fila por fila en transacciones separadas.** Dejaría catálogos a medio importar.
- **Sí: `operaciones` en jsonb dentro de `cat.importacion`, y NULL al terminar.** Sin tabla de staging ni limpieza programada: una previsualización nueva vence la anterior.
- **Sí: `EN_PROCESO` y el avance solo en Redis.** Lo que se escribe dentro de la transacción no es visible hasta el commit; la base guarda el estado verdadero.
- **Sí: avance empujado por SSE con Redis pub/sub del worker a la API.** Lo decidió el usuario, que no quería polling periódico.
- **No: WebSocket.** El flujo va en un solo sentido, y WebSocket suma handshake de autenticación y adaptador para varias instancias. SignalR es de .NET y no aplica.
- **No: long polling.** Es una petición por cada cambio de avance.
- **Sí: el front abre el stream con `fetch` en streaming y el Bearer.** `EventSource` no manda `Authorization`, y el token no va en la URL.
- **Sí: el SSE y las importaciones activas son solo de quien la lanzó.** Lo decidió el usuario. El historial lo ve cualquier operador con el permiso.
- **Sí: CSV y XLSX, en streaming, con `exceljs` (ya instalado) y `csv-parse`.** Es lo que pide RF-028. El tope de 50 000 filas limita archivos bomba.
- **Sí: diseño de columnas fijo por tabla, en código.** Lo decidió el usuario. Sin mapeo en pantalla.
- **Sí: toda baja cierra vigencia y nunca borra.** Lo decidió el usuario (TR-RN-013, TR-CA-074). Se conserva la historia oficial.
- **Sí: un cambio solo pisa los atributos del diseño.** El operador puede haber agregado `longitud` o `regex` desde la consola.
- **Sí: la versión del catálogo sube una sola vez por importación.** El trigger por fila haría 14 000 `UPDATE` de la misma fila. `cat.importando` lo desactiva solo dentro de la transacción de importación.
- **Sí: bloqueo del catálogo durante la aplicación y estado `OBSOLETA` si cambió desde la previsualización.** El operador aprobó un diff concreto, y ese diff es el que se aplica.
- **Sí: tabla `cat.importacion` como traza.** La decidió el usuario. Cubre TR-RNF-013 hasta el spec 20.
- **Sí: evento nuevo `catalogo.importacion_aplicada`, además de `catalogo.actualizado`.** El primero lleva lo que el spec 20 audita; el segundo invalida cachés como cualquier cambio.
- **Sí: `plat.catalogo.importar` es sensible y solo para el operador.** Lo decidió el usuario. Cambia catálogos de todos los tenants (TR-RN-009).
- **Sí: definiciones vacías de los 5 catálogos en la migración, y datos oficiales descargados en `/spec-impl`.** Lo decidió el usuario. No hay API oficial: se usan archivos de SUNAT, INEI o RENIEC y MINSA, con URL y fecha registradas.
- **No: guardar el archivo original ni pasarlo por antivirus.** TR-ARC es de R2. El archivo se procesa en memoria, se valida en el servidor y se descarta; queda el sha256. Es una desviación documentada de TR-RN-027 y del paso 2 del flujo del SRS.
- **No: cancelar una importación en curso.** Dura segundos y el rollback ya protege ante fallos.
- **Sí: `attempts: 2` en BullMQ.** El segundo intento solo cubre un worker muerto. Un fallo de datos queda `FALLIDA` y no se reintenta.
- **Sí: estimado de 10 h**, por encima de las 4 h de D-04 completa en el plan. El reporte de errores suma ~1 h; el spec queda en el tope.

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| Transacción larga con CIE-10 bloquea el catálogo | Escritura por lotes en SQL; se mide en el paso 8. Las lecturas no se bloquean, porque MVCC y la caché siguen sirviendo la versión anterior hasta el commit. |
| `exceljs` consume mucha memoria con un XLSX grande | Lector en streaming, tope de 20 MB y de 50 000 filas. Si la medición del paso 7 supera ~300 MB en la API, la lectura del XLSX pasa al worker en un spec aparte. |
| `cat.importando` lo fija otra transacción para saltarse la versión | Solo lo fija `iniciar_importacion` (`SECURITY DEFINER`, `EXECUTE` revocado a `PUBLIC`), y `aplicar_lote` exige que coincida con el id. La app no escribe globales fuera de las funciones `DEFINER`. |
| El SSE queda abierto detrás de un proxy que corta por inactividad | `: ping` cada 15 s, `X-Accel-Buffering: no`, cierre a los 15 min y reconexión del front con un `GET`. |
| Una fuente oficial cambia de URL o de formato | `FUENTES.md` guarda la URL y la fecha; la tabla queda pendiente en vez de usar una copia no oficial. |
| Una importación queda en `EN_COLA` con el trabajo perdido en Redis | BullMQ persiste el trabajo; `jobId = importacionId` evita duplicados. Si Redis perdió datos, una importación en `EN_COLA` por más de 1 h (`HORAS_MAXIMAS_EN_COLA`) se marca `FALLIDA` «Trabajo perdido en la cola» al consultarla o al aplicar otra del mismo catálogo, y libera `ux_importacion_activa`. |

## Lo que **no** está en este spec

- Feriados, `CalendarioPort`, `sabado_habil` y la lista de administración de ítems (spec 19c).
- Toda la UI: consola, admin cliente, indicador de avance y toast (spec 19d, con el contrato de Alcance).
- Opciones de menú (spec 19d).
- TR-ARC, guardado del archivo y antivirus (R2).
- Auditoría TR-AUD (spec 20).
- Importar catálogos no oficiales o ítems propios.
- Sincronización automática con fuentes oficiales.
- Cancelar una importación en curso.
- Prod (plan de migración a producción).

Cada uno entra en su propio spec cuando su sprint lo pida.
