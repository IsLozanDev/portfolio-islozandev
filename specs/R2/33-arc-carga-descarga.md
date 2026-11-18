# SPEC 33 — Archivos: carga con URL firmada, análisis en el worker y descarga con URL firmada

> **Status:** Aprobado
> **Depends on:** SPEC 06, SPEC 11, SPEC 20a, SPEC 21
> **Date:** 2026-11-18
> **Objective:** Crear `libs/plataforma/archivos` (TR-ARC) para que un archivo se suba directo a un bucket privado de Supabase Storage con una URL firmada emitida por la API, quede DISPONIBLE solo después de que el worker verifique hash, tipo real y antivirus, y se descargue con una URL firmada de 15 minutos como máximo, auditada si la categoría es sensible.

## Por qué existe este spec

Fila 33 de `docs/roadmap-specs.md` (R2-03, TR-RF-080 y 082). Contexto: `docs/spec-context/tr-arc/arc-subida-versiones-url-firmada.md`, partición A. Sus ambigüedades (sec. 9) quedan resueltas en las Decisiones.

El plan da 6 h a R2-03 para tres RF. Este spec cubre 080 y 082 con su capa HTTP y el análisis en el worker: 9-10 h. El antivirus real es el 34, las versiones (RF-081) el 35 y `<ui-archivo-carga>` el 36.

Rompe dos textos de la constitución, y por eso los cambia:

- Regla 8: el navegador sube y baja directo a Storage. Es una excepción declarada: la URL la emite la API, vale para un solo objeto, tiene vigencia corta y el bucket es privado sin políticas.
- Regla 9: la secret key de Supabase pasa a vivir también en `apps/worker`, que lee y borra los objetos.

Lo que hay en el código hoy (revisado al redactar):

- No existe `libs/plataforma/archivos`, ni el esquema `arc`, ni uso de Supabase Storage. El `codigo/` del plan no trae nada de archivos.
- `@supabase/supabase-js` 2.118.0 ya está instalado. `apps/api/src/config/env.ts` tiene `SUPABASE_URL` y `SUPABASE_SECRET_KEY`; `apps/worker/src/config/env.ts` no («Sin SUPABASE_SECRET_KEY»).
- Patrón de cola: `libs/plataforma/catalogos/src/infrastructure/bullmq/cola-importaciones.bullmq.ts` (`abrirColaImportaciones`) y `apps/worker/src/importaciones/` (`TareaImportaciones`). Patrón de tarea diaria con cron: `apps/worker/src/auditoria/`. Tenants activos: `apps/worker/src/cuotas/tenants-activos.org.ts`.
- `AuditoriaPort.registrar(EntradaAuditoria)` exige `UnitOfWork.run` activo. `registrarAccesoSensible` exige `personaTitularId` y un `TipoRecursoSensible` sin «ARCHIVO».
- `@Permiso` acepta un solo código por endpoint.
- Última migración de plataforma: `db/01l_per.sql`. Única de Supabase: `supabase/migrations/20261102000000_seg_supabase_auth.sql`. Manifiesto `plat.manifiesto.json` en 1.20.0. `eslint.config.mjs` sin `comp:arc`.
- Verificado en la documentación de Supabase (context7): la URL de `createSignedUploadUrl` vale 2 horas y no es configurable; el bucket admite `file_size_limit` y `allowed_mime_types`. `file-type` detecta formatos binarios, no texto (`.txt`, XML).

## Alcance

**Entra:**

- TR-RF-080: pedir una URL firmada de carga (categoría, nombre, tamaño, MIME, entidad), subir directo al bucket, confirmar, y análisis en el worker (SHA-256, tipo real, antivirus) que deja el archivo DISPONIBLE, RECHAZADO o en CUARENTENA.
- TR-RF-082: URL firmada de descarga de un archivo DISPONIBLE, con vigencia de 60 a 900 s y disposición `inline` o `attachment`; auditoría de la descarga si la categoría es sensible.
- Consulta del estado de un archivo.
- `ArchivoPort` (`solicitarCarga`, `confirmarCarga`, `urlDescarga`, `estado`) para consumidores en proceso.
- Puertos `AlmacenArchivos` (adaptador Supabase Storage y doble en memoria), `DetectorTipo`, `AnalizadorAntivirus` (adaptador de firma EICAR) y `AutorizadorEntidad` por `entidad_tipo`.
- Eventos `archivo.disponible` y `archivo.en_cuarentena` por outbox, con esquema y auditados.
- Tarea diaria del worker que borra las cargas `PENDIENTE_CARGA` de más de 24 h.
- Migraciones `db/01m_arc.sql` (esquema `arc`) y `supabase/migrations/20261118000000_arc_storage.sql` (bucket privado), con sus inversos y prueba SQL.
- Permisos `plat.archivo.subir` y `plat.archivo.descargar` en el manifiesto.
- Cambio de las reglas 8 y 9 en `CLAUDE.md`.

**No entra (specs futuros):**

- Adaptador real del antivirus (ClamAV) → spec 34. Hasta entonces TR-RNF-114 («100 % escaneados») no se cumple y ARC no se habilita en producción.
- Versiones: nueva versión, rechazo por hash idéntico, listar, marcar vigente, parámetro `version` de la descarga y permiso `plat.archivo.versionar` (TR-RF-081) → spec 35.
- `<ui-archivo-carga>` y lib `archivos-ui` → spec 36.
- Carga desde el servidor (`ArchivoPort.guardar(bytes)`) para XML, CDR y PDF de FE → spec 52.
- Retención, bloqueo legal y expiración de exportaciones (TR-RF-083) → spec 69.
- Borrar un archivo DISPONIBLE o liberar uno de CUARENTENA.
- OCR, extracción con IA, transformación de imágenes, CMS.
- Mover el importador de catálogos (spec 19b) a ARC.
- Autorizadores reales de productos: cada consumidor registra el suyo en su spec.
- Asignar `plat.archivo.*` a roles predefinidos.

## Base de código reutilizada

| Pieza | Qué se hace |
| --- | --- |
| `kernel` (`AggregateRoot`, errores, `UnitOfWork`, `TenantContext`, `IdGenerator`, `Clock`) | Sin cambios. |
| `kernel-infra` (`TypeOrmUnitOfWork`, `OutboxPublisher`, `uuidV7`, `REPORTADOR_ERRORES`) | Sin cambios. |
| `auditoria` (`AUDITORIA`, `EVENTOS_AUDITADOS`) | Se consume `registrar`; se agregan los dos eventos a `EVENTOS_AUDITADOS`. |
| `catalogos` (`cola-importaciones.bullmq.ts`) y `apps/worker/src/importaciones/` | Referencia del patrón de cola y procesador. No se importa. |
| `apps/worker/src/auditoria/` y `cuotas/tenants-activos.org.ts` | Referencia de la tarea con cron y del recorrido de tenants. `TenantsActivosOrg` se reutiliza. |
| `personas` / `identidad` | Referencia de estructura de lib, módulo dinámico, `event-schemas.ts`, jest y base temporal. |

## Modelo de datos

### Migración `db/01m_arc.sql` (+ `db/rollback/01m_arc.sql`, `db/tests/01m_arc.test.sql`)

```sql
CREATE SCHEMA arc;

CREATE TABLE arc.categoria (
  codigo            varchar(20) PRIMARY KEY,
  mimes_permitidos  text[]  NOT NULL,
  tamano_max_bytes  bigint  NOT NULL CHECK (tamano_max_bytes > 0),
  sensible          boolean NOT NULL
);

CREATE TABLE arc.archivo (
  id               uuid PRIMARY KEY,
  tenant_id        uuid NOT NULL,
  categoria        varchar(20)  NOT NULL REFERENCES arc.categoria(codigo),
  entidad_tipo     varchar(40)  NOT NULL CHECK (entidad_tipo ~ '^[A-Z][A-Z0-9_]{1,39}$'),
  entidad_id       varchar(80)  NOT NULL,
  nombre_original  varchar(255) NOT NULL CHECK (length(nombre_original) >= 1),
  estado           varchar(16)  NOT NULL CHECK (estado IN ('PENDIENTE_CARGA','EN_ANALISIS','DISPONIBLE','CUARENTENA','RECHAZADO')),
  motivo_rechazo   varchar(20)  CHECK (motivo_rechazo IN ('TIPO_NO_PERMITIDO','TAMANO_NO_COINCIDE')),
  version_vigente  integer,
  version          integer NOT NULL DEFAULT 1,
  creado_por       uuid NOT NULL,
  creado_en        timestamptz NOT NULL DEFAULT now(),
  actualizado_en   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_archivo_disponible CHECK ((estado = 'DISPONIBLE') = (version_vigente IS NOT NULL)),
  CONSTRAINT ck_archivo_rechazo CHECK ((estado = 'RECHAZADO') = (motivo_rechazo IS NOT NULL))
);
CREATE INDEX ix_archivo_entidad ON arc.archivo (tenant_id, entidad_tipo, entidad_id);
CREATE INDEX ix_archivo_pendiente ON arc.archivo (creado_en) WHERE estado = 'PENDIENTE_CARGA';

CREATE TABLE arc.version_archivo (
  archivo_id        uuid    NOT NULL REFERENCES arc.archivo(id) ON DELETE CASCADE,
  numero            integer NOT NULL CHECK (numero >= 1),
  tenant_id         uuid    NOT NULL,
  ruta_storage      varchar(120) NOT NULL UNIQUE,
  mime_declarado    varchar(100) NOT NULL,
  bytes_declarados  bigint  NOT NULL CHECK (bytes_declarados > 0),
  hash_sha256       char(64) CHECK (hash_sha256 ~ '^[0-9a-f]{64}$'),
  bytes             bigint,
  mime_real         varchar(100),
  subido_por        uuid NOT NULL,
  subido_en         timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (archivo_id, numero),
  CONSTRAINT uq_version_hash UNIQUE (archivo_id, hash_sha256)
);
```

- Siembra de `arc.categoria`:

  | Código | MIME permitidos | Máximo | Sensible |
  | --- | --- | --- | --- |
  | `IMAGEN` | `image/jpeg`, `image/png`, `image/webp` | 10 MB | no |
  | `DOCUMENTO` | `application/pdf`, `application/vnd.openxmlformats-officedocument.wordprocessingml.document`, `image/jpeg` | 25 MB | sí |
  | `CPE_XML` | `application/xml`, `application/zip` | 25 MB | no |
  | `EVIDENCIA` | `application/pdf`, `image/jpeg`, `image/png` | 25 MB | sí |
  | `ADJUNTO_SOPORTE` | `application/pdf`, `image/jpeg`, `image/png`, `text/plain` | 25 MB | no |

- `arc.archivo` y `arc.version_archivo`: RLS con `tenant_id = current_setting('app.tenant_id')::uuid` (patrón de `01a_org.sql`). `SELECT, INSERT, UPDATE, DELETE` al rol de la API y del worker: el `DELETE` lo usa solo la limpieza de huérfanos. `arc.categoria`: solo `SELECT`, sin RLS.
- Función `arc.cargas_pendientes_vencidas(p_antes timestamptz, p_limite integer)` `SECURITY DEFINER` con `search_path` fijo: devuelve `(tenant_id, archivo_id)` de los `PENDIENTE_CARGA` anteriores a `p_antes`, de todos los tenants. Solo ejecutable por el rol del worker.
- `REVOKE ALL ON SCHEMA arc FROM anon, authenticated` (regla 8).
- `ruta_storage` = `{tenant_id}/{archivo_id}/{numero}`, sin el nombre original.
- `uq_version_hash` nace aquí para que el 35 (TR-CA-203) no migre datos; con una sola versión no se dispara.
- Inverso: `DROP SCHEMA arc CASCADE`.

### Migración `supabase/migrations/20261118000000_arc_storage.sql` (+ `rollback/`)

- Inserta en `storage.buckets` el bucket `archivos`: `public = false`, `file_size_limit = 26214400` (25 MB), `allowed_mime_types` = unión de los MIME de la siembra.
- Sin políticas en `storage.objects` para `anon` ni `authenticated`: solo la secret key y las URL firmadas llegan al bucket.
- Inverso: borra el bucket si está vacío; si tiene objetos, falla con mensaje claro.

### Dominio (`libs/plataforma/archivos/src/domain/`)

- `categoria.ts`: `CategoriaArchivo { codigo, mimesPermitidos, tamanoMaxBytes, sensible }` con `admiteMime(mime)` y `admiteTamano(bytes)`. `CODIGOS_CATEGORIA` con los cinco códigos.
- `archivo.ts`: agregado `Archivo` con su `VersionArchivo` número 1. Transiciones:
  - `solicitar(datos, categoria)` → `PENDIENTE_CARGA`. Valida nombre (1-255 tras recortar), MIME declarado dentro de la categoría, tamaño entre 1 y el máximo de la categoría, `entidad_tipo` con su formato y `entidad_id` (1-80).
  - `confirmarCarga()` → `EN_ANALISIS` desde `PENDIENTE_CARGA`; en otro estado no cambia nada y devuelve `false`.
  - `aprobar({ hash, bytes, mimeReal })` → `DISPONIBLE`, `versionVigente = 1`, evento `archivo.disponible`.
  - `rechazar(motivo)` → `RECHAZADO`.
  - `ponerEnCuarentena({ hash, bytes, mimeReal })` → `CUARENTENA`, evento `archivo.en_cuarentena`.
  - `devolverAPendiente()` → `PENDIENTE_CARGA` (el objeto aún no está en Storage).
  - `aprobar`, `rechazar`, `ponerEnCuarentena` y `devolverAPendiente` solo valen desde `EN_ANALISIS`.
- `resultado-analisis.ts`: función pura `evaluarAnalisis(categoria, version, { bytes, mimeReal, limpio })` → `APROBADO | TIPO_NO_PERMITIDO | TAMANO_NO_COINCIDE | INFECTADO`. Orden: tamaño, tipo, antivirus.
- `vigencia-descarga.ts`: `VIGENCIA_MAXIMA_SEGUNDOS = 900`, `VIGENCIA_MINIMA_SEGUNDOS = 60`; por defecto 900.
- `errores.ts`: `CategoriaDesconocidaError`, `MimeNoPermitidoError`, `TamanoExcedidoError`, `DatosArchivoInvalidosError`, `VigenciaInvalidaError` (ValidationError); `ArchivoNoEncontradoError` (NotFoundError); `ArchivoNoDisponibleError` (ConflictError, lleva `estado`); `AccesoEntidadDenegadoError` (ForbiddenError); `AlmacenNoDisponibleError`.
- `permisos-arc.ts`: `PERMISOS_ARC`.

### Puertos (`application/ports/`)

```ts
export const ARCHIVO_PORT = Symbol('ArchivoPort');

export interface ArchivoPort {
  solicitarCarga(comando: SolicitarCargaComando): Promise<CargaSolicitada>;   // { archivoId, carga: { url, token, expiraEn } }
  confirmarCarga(archivoId: string): Promise<EstadoArchivo>;                   // idempotente
  urlDescarga(consulta: UrlDescargaConsulta): Promise<{ url: string; expiraEn: Date }>;
  estado(archivoId: string): Promise<EstadoArchivo>;                           // { archivoId, estado, motivoRechazo?, categoria, nombreOriginal, bytes?, hashSha256? }
}

interface AlmacenArchivos {                      // Supabase Storage; doble en memoria para pruebas
  firmarCarga(ruta: string): Promise<{ url: string; token: string; expiraEn: Date }>;
  firmarDescarga(ruta: string, vigenciaSegundos: number, descargarComo?: string): Promise<string>;
  leer(ruta: string): Promise<Uint8Array | null>;   // null si el objeto no existe
  borrar(ruta: string): Promise<void>;              // no falla si no existe
}
interface DetectorTipo { detectar(contenido: Uint8Array): Promise<string | null> }            // MIME real
interface AnalizadorAntivirus { analizar(contenido: Uint8Array): Promise<{ limpio: boolean; firma?: string }> }
interface AutorizadorEntidad {                    // lo registra cada producto
  readonly entidadTipo: string;
  puedeLeer(entidadId: string): Promise<boolean>;
  puedeEditar(entidadId: string): Promise<boolean>;
}
interface ColaAnalisis { encolar(trabajo: { tenantId: string; archivoId: string }): Promise<void> }
interface RepositorioArchivos {                   // TypeORM, sobre el EntityManager de la transacción
  obtener(archivoId: string): Promise<Archivo | null>;
  guardar(archivo: Archivo): Promise<void>;       // bloqueo optimista por version
  eliminar(archivoId: string): Promise<void>;
  buscarCategoria(codigo: string): Promise<CategoriaArchivo | null>;
}
```

`AUTORIZADORES_ENTIDAD` es un token multi (`AutorizadorEntidad[]`) que compone `apps/api`; nace vacío. Toda consulta filtra por el `tenant_id` del `TenantContext` además de la RLS.

### Casos de uso (`application/`)

- `SolicitarCarga` (`solicitar-carga.ts`):
  1. Carga la categoría; desconocida → `CategoriaDesconocidaError`.
  2. Si hay autorizador para `entidad_tipo`, exige `puedeEditar`; si no lo hay, basta el permiso y el tenant.
  3. Crea el agregado y lo guarda (transacción).
  4. Fuera de la transacción firma la carga. Si Storage falla → `AlmacenNoDisponibleError`; la fila queda `PENDIENTE_CARGA` y la limpia la tarea diaria.
- `ConfirmarCarga` (`confirmar-carga.ts`): carga el archivo del tenant, `confirmarCarga()`, guarda y, tras confirmar la transacción, encola `{ tenantId, archivoId }` con `jobId = archivoId`. Si ya estaba `EN_ANALISIS` vuelve a encolar con el mismo `jobId` (BullMQ lo descarta si el trabajo sigue vivo). En cualquier otro estado devuelve el estado actual sin encolar. Si la cola falla responde `AlmacenNoDisponibleError` y el cliente reintenta.
- `AnalizarArchivo` (`analizar-archivo.ts`, lo ejecuta el worker):
  1. Carga el archivo con el tenant del trabajo; si no está `EN_ANALISIS`, termina (idempotente).
  2. Lee los bytes fuera de la transacción. Sin objeto → `devolverAPendiente()`.
  3. Calcula SHA-256, detecta el tipo real y pasa el antivirus.
  4. Aplica `evaluarAnalisis` y, en una transacción, guarda el estado y publica el evento que corresponda.
  5. `RECHAZADO`: borra el objeto después de confirmar. `CUARENTENA`: el objeto se conserva.
  - Un fallo de Storage o del antivirus relanza: BullMQ reintenta (`attempts: 3`, backoff exponencial). Agotados los intentos el archivo sigue `EN_ANALISIS` y el error llega a `REPORTADOR_ERRORES`.
- `EmitirUrlDescarga` (`emitir-url-descarga.ts`):
  1. Archivo de otro tenant o inexistente → `ArchivoNoEncontradoError` (TR-CA-205).
  2. Autorizador de la entidad, si existe, con `puedeLeer`; falso → `AccesoEntidadDenegadoError`.
  3. Estado distinto de `DISPONIBLE` → `ArchivoNoDisponibleError` con el estado.
  4. Valida la vigencia (60-900) y firma; `attachment` pasa `nombre_original` como nombre de descarga.
  5. Si la categoría es sensible, `AuditoriaPort.registrar({ accion: 'plat.archivo.descargar', entidadTipo: 'ARCHIVO', entidadId: archivoId, despues: { categoria, entidad_tipo, entidad_id, disposicion } })` en una transacción. Si la auditoría falla, no se entrega la URL (TR-RNF-013).
- `ConsultarEstadoArchivo` (`consultar-estado.ts`).
- `LimpiarCargasPendientes` (`limpiar-cargas-pendientes.ts`): toma lotes de `arc.cargas_pendientes_vencidas(ahora − 24 h, 200)`; por cada uno borra el objeto y luego la fila con el contexto de su tenant. No toca archivos en otro estado.

### Eventos (`infrastructure/event-schemas.ts`, `registrarEsquemasArc`)

| Evento | Payload |
| --- | --- |
| `archivo.disponible` | `{ archivo_id, categoria, entidad_tipo, entidad_id, version, hash_sha256, bytes, mime_real }` |
| `archivo.en_cuarentena` | `{ archivo_id, categoria, entidad_tipo, entidad_id, firma }` |

Sin `nombre_original` (puede llevar datos personales). `archivo.en_cuarentena` no está en el SRS: se documenta como añadido. Ambos se agregan a `EVENTOS_AUDITADOS`.

### Infraestructura

- `typeorm/`: `ArchivoEntidad`, `VersionArchivoEntidad`, `CategoriaEntidad` y `RepositorioArchivosTypeOrm`. `@VersionColumn` en `version`. SQL crudo solo para llamar a `arc.cargas_pendientes_vencidas` (función de base de datos), encapsulado en `CargasPendientesSql`.
- `supabase/almacen-archivos.supabase.ts`: `createSignedUploadUrl`, `createSignedUrl(ruta, vigencia, { download })`, `download`, `remove` sobre el bucket `archivos`. Recibe `{ url, secretKey, bucket }`. Traduce errores a `AlmacenNoDisponibleError` con solo el código.
- `memoria/almacen-archivos.memoria.ts`: doble con reloj inyectable, exportado para pruebas de esta lib y de sus consumidores.
- `tipo/detector-tipo.file-type.ts`: `file-type` para binarios (PDF, DOCX, JPEG, PNG, WebP, ZIP, ejecutables). Si no detecta nada y el contenido es UTF-8 válido sin bytes NUL: `application/xml` si empieza con `<?xml` o `<` (tras BOM y espacios), si no `text/plain`. En otro caso `null`.
- `antivirus/analizador-firma-eicar.ts`: detecta la cadena EICAR estándar; cualquier otro contenido es limpio. Es el único adaptador hasta el 34.
- `bullmq/cola-analisis.bullmq.ts`: `NOMBRE_COLA_ANALISIS = 'arc-analisis'`, `abrirColaAnalisis(redisUrl, alFallar)`, `TrabajoAnalisis`.

### HTTP (`interface/archivos.controller.ts`, `archivos.dto.ts`)

| Método y ruta | Permiso | Respuesta |
| --- | --- | --- |
| `POST /v1/archivos/cargas` | `plat.archivo.subir` | 201 `{ archivo_id, carga: { url, token, expira_en } }` |
| `POST /v1/archivos/{id}/confirmar` | `plat.archivo.subir` | 200 estado del archivo |
| `GET /v1/archivos/{id}` | `plat.archivo.descargar` | 200 estado del archivo |
| `GET /v1/archivos/{id}/descarga?disposicion=&vigencia_segundos=` | `plat.archivo.descargar` | 200 `{ url, expira_en }` |

Cuerpo de `POST /v1/archivos/cargas`: `categoria`, `nombre_original`, `tamano`, `mime`, `entidad_tipo`, `entidad_id`. El cliente sube con `PUT` a `carga.url` y el `Content-Type` declarado. `disposicion` por defecto `attachment`.

Errores: 422 `CATEGORIA_DESCONOCIDA`, `MIME_NO_PERMITIDO`, `TAMANO_EXCEDIDO` (con el máximo), `DATOS_INVALIDOS`, `VIGENCIA_INVALIDA`; 403 `ACCESO_ENTIDAD_DENEGADO`; 404 `NO_ENCONTRADO` (también para otro tenant); 409 `ARCHIVO_NO_DISPONIBLE` con `estado`; 503 `ALMACEN_NO_DISPONIBLE`. OpenAPI completo.

### Composición

- `ArchivosModule.register({ redisUrl, supabase: { url, secretKey }, bucket })` exporta `ARCHIVO_PORT`; `apps/api` lo registra con `AUDITORIA` y `AUTORIZADORES_ENTIDAD = []`.
- `apps/worker/src/archivos/`: `archivos.module.ts`, `tarea-analisis.ts` (procesador de `arc-analisis`, concurrencia 2) y `tarea-limpieza.ts` (cron diario, zona `America/Lima`).
- `apps/worker/src/config/env.ts`: `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `ARC_LIMPIEZA_CRON` (por defecto `45 3 * * *`); se corrige el comentario «Sin SUPABASE_SECRET_KEY». `apps/api` y worker: `ARC_BUCKET` (por defecto `archivos`).
- `CLAUDE.md`: regla 9 → «La secret key de Supabase solo en `apps/api`, `apps/worker` y scripts de migración». Regla 8 → se agrega la excepción de las URL firmadas de TR-ARC.
- `eslint.config.mjs`: `comp('arc', 'kernel', 'seg', 'aud', 'evt')` y fixture `comp:arc` en `tools/boundaries-test`.
- `plat.manifiesto.json` 1.21.0: `plat.archivo.subir` («Subir archivos») y `plat.archivo.descargar` («Ver y descargar archivos»); alcance `TENANT`, no sensibles, sin rol predefinido ni opción de menú. Las pruebas que fijan la versión se actualizan.
- Dependencia nueva: `file-type` (versión estable vigente, fijada exacta como el resto).

## Plan de implementación

1. **Migraciones.** `db/01m_arc.sql`, inverso y prueba SQL: siembra de las cinco categorías, CHECK de estado y de `version_vigente`, único de hash, RLS entre dos tenants, `arc.cargas_pendientes_vencidas` ve todos los tenants y solo la ejecuta el worker, sin acceso de `anon`/`authenticated`, ida y vuelta. `supabase/migrations/20261118000000_arc_storage.sql` con su inverso.
2. **Lib y dominio.** `nx g` de `libs/plataforma/archivos` con tags `scope:plataforma`, `type:backend`, `comp:arc`; regla de eslint y fixture de límites. `CategoriaArchivo`, `Archivo`, `evaluarAnalisis`, vigencia y errores con pruebas.
3. **Persistencia.** Entidades, `RepositorioArchivosTypeOrm` y `CargasPendientesSql`. Integración contra base temporal: guardar y leer con su versión, aislamiento por tenant, conflicto de versión.
4. **Adaptadores.** `AlmacenArchivosMemoria`, `AlmacenArchivosSupabase` (prueba con cliente doblado), `DetectorTipoFileType` (PDF, DOCX, JPEG, PNG, WebP, ZIP, XML, texto y un `.exe` con extensión `.pdf`), `AnalizadorFirmaEicar`, cola `arc-analisis`.
5. **Casos de uso de carga.** `SolicitarCarga`, `ConfirmarCarga`, `ConsultarEstadoArchivo` y `AnalizarArchivo` con dobles; eventos en el outbox; esquemas y `EVENTOS_AUDITADOS`.
6. **Descarga.** `EmitirUrlDescarga` con autorizador de prueba, auditoría de categorías sensibles y vigencia.
7. **HTTP y composición en la API.** Controlador, DTO, OpenAPI, `ArchivosModule`, registro en `apps/api`, manifiesto 1.21.0. Prueba e2e de los cuatro endpoints con el almacén en memoria.
8. **Worker.** `apps/worker/src/archivos/` con el procesador de análisis y la tarea de limpieza; variables de entorno; `LimpiarCargasPendientes`. Cambio de las reglas 8 y 9 en `CLAUDE.md`.
9. **Cierre.** `code-simplifier` sobre los archivos tocados; migraciones aplicadas en Supabase dev; prueba en Supabase dev de TR-CA-199, 200, 201 y 206 contra Storage real.

## Criterios de aceptación

- [ ] TR-CA-199: PDF de 1,2 MB en `DOCUMENTO` asociado a una entidad → tras subir y confirmar, el worker lo deja `DISPONIBLE` con su `hash_sha256`, `bytes` y `mime_real`, y publica `archivo.disponible`.
- [ ] TR-CA-200: un `.exe` renombrado a `.pdf` y declarado `application/pdf` → `RECHAZADO` con motivo `TIPO_NO_PERMITIDO`, el objeto se borra de Storage y no hay evento.
- [ ] TR-CA-201: archivo con la firma EICAR → `CUARENTENA`, `archivo.en_cuarentena` publicado, el objeto sigue en Storage y la descarga responde 409 `ARCHIVO_NO_DISPONIBLE`.
- [ ] TR-CA-204: usuario con `plat.archivo.descargar` y autorizador que lo permite pide un `DOCUMENTO` de la entidad de prueba `PRUEBA_SENSIBLE` → URL con `expira_en` a 15 min y una fila en `aud` con acción `plat.archivo.descargar`.
- [ ] TR-CA-205: archivo del tenant B pedido desde A → 404 `NO_ENCONTRADO` en estado, confirmar y descarga; la prueba SQL con dos `app.tenant_id` no ve filas ajenas.
- [ ] TR-CA-206: la URL de descarga usada 16 min después → Storage responde acceso expirado (Supabase dev) y el doble en memoria la rechaza con su reloj adelantado.
- [ ] `POST /v1/archivos/cargas` con `IMAGEN` de 10 MB + 1 byte o `DOCUMENTO` de 25 MB + 1 byte → 422 `TAMANO_EXCEDIDO`; sin fila ni URL.
- [ ] MIME declarado fuera de la categoría → 422 `MIME_NO_PERMITIDO`; categoría inexistente → 422 `CATEGORIA_DESCONOCIDA`.
- [ ] El tamaño real distinto de `tamano` declarado → `RECHAZADO` con motivo `TAMANO_NO_COINCIDE` y objeto borrado.
- [ ] Confirmar sin haber subido el objeto → el archivo vuelve a `PENDIENTE_CARGA`; confirmar dos veces un archivo ya confirmado → 200 con el estado actual y un solo trabajo en la cola (mismo `jobId`).
- [ ] Una segunda subida a la misma URL de carga no reemplaza el objeto (Supabase dev).
- [ ] Descarga de un archivo `PENDIENTE_CARGA`, `EN_ANALISIS`, `RECHAZADO` o `CUARENTENA` → 409 con su `estado`.
- [ ] `vigencia_segundos` de 901 o de 59 → 422 `VIGENCIA_INVALIDA`; sin el parámetro la URL vale 900 s.
- [ ] `disposicion=attachment` → la URL descarga con `nombre_original`; `inline` → sin nombre de descarga.
- [ ] Descarga de una categoría no sensible (`IMAGEN`) → sin fila en `aud`. Si `AuditoriaPort.registrar` falla en una sensible → no se devuelve la URL.
- [ ] Autorizador registrado que niega `puedeLeer` → 403 `ACCESO_ENTIDAD_DENEGADO`; que niega `puedeEditar` → 403 al pedir la carga. `entidad_tipo` sin autorizador → pasa con permiso y tenant.
- [ ] Una carga `PENDIENTE_CARGA` de más de 24 h → la tarea de limpieza borra objeto y fila; una de 23 h o en otro estado no se toca.
- [ ] Reprocesar el mismo trabajo de análisis no cambia el estado ni duplica eventos.
- [ ] `ruta_storage` es `{tenant_id}/{archivo_id}/1` y no contiene el nombre original; el payload de los eventos tampoco.
- [ ] El bucket `archivos` es privado, limita a 25 MB y no tiene políticas para `anon` ni `authenticated`: una petición con la publishable key al objeto responde error.
- [ ] Ningún log de ARC contiene `nombre_original`, la URL firmada ni el token (TR-RNF-026).
- [ ] La secret key no aparece en `libs/plataforma/archivos` fuera de `infrastructure/supabase`; el dominio no importa NestJS, TypeORM ni Supabase.
- [ ] Sin el permiso de cada endpoint → 403; endpoints en OpenAPI bajo `/v1`.
- [ ] `anon` y `authenticated` no tienen acceso al esquema `arc`.
- [ ] Migraciones `01m_arc` y `20261118000000_arc_storage` reversibles; `01m_arc` probada en CI contra PostgreSQL 16.
- [ ] `comp:arc` solo importa `kernel`, `seg`, `aud`, `evt` y `scope:shared` (prueba de límites).
- [ ] Cobertura de dominio de `archivos` ≥ 70 %.
- [ ] El código nuevo sigue la sección «Código limpio» de `CLAUDE.md`; persistencia con TypeORM, con el único SQL crudo en `CargasPendientesSql`.
- [ ] `npx nx run-many -t lint test -p archivos api worker auditoria seguridad` verde; `nx affected` verde en el CI del PR.

## Decisiones

- **Sí:** número 33, el del roadmap, aunque el 32 aún no exista. Decisión del usuario. Los specs 34 a 70 ya lo referencian como 33.
- **Sí:** la secret key de Supabase también en `apps/worker`; se cambia la regla 9. Decisión del usuario. El worker lee, borra rechazados y limpia huérfanos con el mismo adaptador.
- **No:** URL firmada de descarga dentro del trabajo de BullMQ (la URL pasaría por Redis y el worker no podría borrar). **No:** análisis en el proceso de la API (25 MB y antivirus en el proceso HTTP).
- **Sí:** carga y descarga directas del navegador a Storage como excepción declarada de la regla 8. La URL la emite la API, es de un solo objeto, de vigencia corta, y el bucket es privado.
- **Sí:** `entidad_tipo` sin `AutorizadorEntidad` registrado pasa con el permiso `plat.archivo.*` y el tenant. Decisión del usuario. PER y FE pueden usar ARC sin escribir un autorizador.
- **No:** rechazar `entidad_tipo` sin autorizador. Obliga a cada consumidor a registrar uno antes de integrarse.
- **Sí:** auditar la descarga sensible con `AuditoriaPort.registrar` y acción `plat.archivo.descargar`. Decisión del usuario. ARC no conoce al titular; `registrarAccesoSensible` queda para los productos.
- **No:** ampliar `TIPOS_RECURSO_SENSIBLE` con `ARCHIVO`. Cambia AUD y su CHECK por un dato que ARC no tiene.
- **Sí:** categorías en `arc.categoria` sembrada con cinco códigos y la lista de MIME de la tabla; sensibles `DOCUMENTO` y `EVIDENCIA`. Decisión del usuario. El producto no crea categorías en R2.
- **No:** carga desde el servidor en este spec. Decisión del usuario. `ArchivoPort.guardar(bytes)` llega con el 52.
- **Sí:** tarea diaria que borra cargas `PENDIENTE_CARGA` de más de 24 h. Decisión del usuario.
- **Sí:** `RECHAZADO` borra el objeto y no publica evento; `CUARENTENA` conserva el objeto y publica `archivo.en_cuarentena`. Decisión del usuario. La muestra queda para revisar un falso positivo.
- **Sí:** el cliente avisa con `confirmar` (idempotente) y el worker verifica existencia y tamaño. Storage no notifica a la API.
- **No:** webhook o trigger sobre `storage.objects`. Acopla la plataforma al esquema interno de Supabase.
- **Sí:** confirmar sin objeto devuelve el archivo a `PENDIENTE_CARGA`, no lo rechaza. El cliente puede reintentar mientras la URL viva.
- **Sí:** la vigencia de la URL de carga es la de Supabase (2 h, no configurable, verificado en su documentación). El control efectivo es `confirmar` más la limpieza de 24 h.
- **Sí:** un solo bucket `archivos` por ambiente con límite de 25 MB y la unión de MIME. El límite por categoría lo aplican la API al pedir la URL y el worker al analizar.
- **No:** un bucket por categoría o por tenant. Más migraciones y ninguna barrera nueva: el aislamiento es la ruta `{tenant_id}/...` más la RLS de los metadatos.
- **Sí:** encolar el análisis en BullMQ después de confirmar la transacción, con `jobId = archivoId` (patrón del 19b). Si el encolado falla, el archivo queda `EN_ANALISIS` sin trabajo y el cliente recibe 503; por eso `ConfirmarCarga` reencola cuando el archivo ya está `EN_ANALISIS`.
- **No:** evento interno por outbox para disparar el análisis. Un salto más (relay, consumidor) para un trabajo que ya es idempotente.
- **Sí:** `arc.version_archivo` y `uq_version_hash` nacen aquí con la versión 1. El 35 agrega casos de uso, no migra datos.
- **Sí:** estado solo en `arc.archivo`. Con una versión, un estado por versión duplicaría el dato; el 35 decide si la versión necesita el suyo.
- **Sí:** `file-type` para binarios más una regla propia para XML y texto, detrás de `DetectorTipo`. `file-type` no detecta formatos de texto.
- **No:** tabla propia de bytes mágicos. Distinguir DOCX de ZIP exige abrir el contenedor; la librería ya lo hace.
- **Sí:** `AnalizadorFirmaEicar` como único antivirus hasta el 34. Permite cerrar TR-CA-201 sin infraestructura; producción espera al 34.
- **Sí:** `GET /v1/archivos/{id}` con `plat.archivo.descargar`. `@Permiso` admite un solo código; quien sube conoce el estado por la respuesta de `confirmar`, y el 36 decide si el sondeo necesita otro permiso.
- **Sí:** `plat.archivo.*` solo en el manifiesto, sin rol predefinido (mismo criterio que el 31). `plat.archivo.versionar` llega con el 35.
- **Sí:** `disposicion` por defecto `attachment` y vigencia por defecto 900 s. Lo seguro por defecto es descargar, no abrir en el navegador.
- **Sí:** función `SECURITY DEFINER` para listar pendientes vencidos de todos los tenants (patrón de `org.tenants_listar`). Evita recorrer tenant por tenant cada noche.
- **Sí:** SQL crudo solo para esa función (regla 11: función de base de datos).
- **Sí:** eventos sin `nombre_original`; los consumidores leen por `ArchivoPort`.
- **Sí:** migración `01m_arc` (`01l` es de PER).

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| Sin antivirus real hasta el 34, un archivo infectado queda `DISPONIBLE` | ARC no se habilita en producción antes del 34; se anota en el roadmap y en el cierre del spec. |
| El worker cae a mitad del análisis y el archivo queda `EN_ANALISIS` | Reintentos de BullMQ; `AnalizarArchivo` es idempotente; `confirmar` reencola. Agotados los intentos, error al reportador. |
| Archivos de 25 MB en memoria del worker | Concurrencia 2 en la cola: 50 MB como máximo. El análisis por flujo se evalúa con el antivirus real (34). |
| El `Content-Type` de la subida lo fija el navegador y puede no coincidir con el declarado | El bucket solo filtra por la unión de MIME; lo que decide es `mime_real` detectado en el worker. |
| La URL de carga vive 2 h y puede reutilizarse antes de confirmar | Es de un solo objeto y ruta; el análisis valida tamaño y tipo. La carga se firma sin `upsert`; al cerrar se comprueba en Supabase dev que una segunda subida a la misma ruta falla. |
| Storage real solo existe en Supabase Cloud (sin Docker local) | Pruebas locales y de CI con `AlmacenArchivosMemoria`; TR-CA-199, 200, 201 y 206 se repiten a mano contra Supabase dev al cerrar. |
| Falso positivo o negativo del detector con texto (un binario sin firma conocida que sea UTF-8 válido) | Solo `ADJUNTO_SOPORTE` y `CPE_XML` admiten texto; el antivirus real del 34 es la segunda barrera. |
| Auditar cada descarga sensible toma el bloqueo por tenant de AUD | Se registra al final del caso de uso, después de firmar, en una transacción corta. |

## Lo que **no** entra en este spec

- Antivirus real con ClamAV (spec 34).
- Versiones, hash idéntico, marcar vigente y `plat.archivo.versionar` (spec 35).
- `<ui-archivo-carga>` y `archivos-ui` (spec 36).
- Carga desde el servidor para FE (spec 52).
- Retención, bloqueo legal y exportaciones de 72 h (spec 69).
- Borrar archivos disponibles, liberar cuarentenas, OCR, transformación de imágenes, CMS.
- Autorizadores de productos y roles predefinidos con `plat.archivo.*`.

Cada uno, si llega, va en su propio spec.
