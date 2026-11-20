# SPEC 35 — Archivos: versiones con la misma validación, rechazo por contenido idéntico, lista y versión vigente

> **Status:** Aprobado
> **Depends on:** SPEC 33
> **Date:** 2026-11-18
> **Objective:** Ampliar `libs/plataforma/archivos` (TR-ARC) para que un archivo `DISPONIBLE` reciba versiones nuevas con la misma carga firmada y el mismo análisis del worker, rechace el contenido idéntico al de cualquier versión, conserve y deje descargar las anteriores, las liste y permita marcar una anterior como vigente, con cada cambio auditado.

## Por qué existe este spec

Fila 35 de `docs/roadmap-specs.md` (R2-03, TR-RF-081). Contexto: `docs/spec-context/tr-arc/arc-subida-versiones-url-firmada.md`, partición C. Cubre TR-CA-202 y 203 y el criterio propuesto en su sec. 3 («versión vigente marcada desde una anterior»).

El roadmap da 4 h. No alcanzan: la versión necesita estado propio (migración con relleno), el análisis compara el hash, la limpieza diaria se extiende y hay dos eventos nuevos. Estimado real: 9-10 h. Si se pasa de 10 h se recorta en este orden: primero la extensión del barrido de análisis atascados (solo aplica si el 34 ya está implementado); después «marcar vigente» (`PATCH /v1/archivos/{id}/version-vigente` y `archivo.version_vigente_cambiada`), que pasa a un 35b. No se recorta la limpieza de versiones pendientes: sin ella una versión que nunca se confirma bloquea el archivo con `VERSION_EN_CURSO`.

Lo que hay en el código hoy (revisado al redactar):

- `db/01m_arc.sql`: `arc.version_archivo` con PK `(archivo_id, numero)`, `ruta_storage` única y `uq_version_hash (archivo_id, hash_sha256)`. Sin columna de estado: «El estado vive solo en el archivo». `arc.archivo` tiene `version_vigente` (número de versión) y `version` (bloqueo optimista), con `ck_archivo_disponible` y `ck_archivo_rechazo`. `arc.cargas_pendientes_vencidas` solo mira `arc.archivo`; `org_lector` no lee `arc.version_archivo`.
- `domain/archivo.ts`: el agregado `Archivo` guarda una sola versión (`props.primeraVersion`, `NUMERO_PRIMERA_VERSION = 1`). `aprobar`, `rechazar`, `ponerEnCuarentena` y `devolverAPendiente` actúan sobre ella y sobre el estado del archivo. `armarRutaStorage(tenantId, archivoId, numeroVersion)` ya recibe el número.
- `RepositorioArchivosTypeOrm.obtener` lee solo la versión 1 (`findOneByOrFail({ numero: NUMERO_PRIMERA_VERSION })`); `actualizar` solo actualiza esa fila.
- `EmitirUrlDescarga`, `LimpiarCargasPendientes`, `AnalizarArchivo` y `estadoDe` usan `archivo.primeraVersion`.
- `TrabajoAnalisis` es `{ tenantId, archivoId }` y `ColaAnalisisBullmq` encola con `jobId = archivoId`, `removeOnComplete` y `removeOnFail`. `TareaAnalisisArchivos` registra `archivoId: trabajo?.id` (el `jobId`).
- `evaluarAnalisis(categoria, version, hallazgos)` ordena tamaño, tipo, antivirus; no conoce el hash.
- `PERMISOS_ARC` tiene `subir` y `descargar`. `@Permiso` acepta un solo código: `POST /v1/archivos/{id}/confirmar` exige `plat.archivo.subir`.
- `EVENTOS_ARC` tiene `disponible` y `enCuarentena`; el payload de `archivo.en_cuarentena` no lleva número de versión y su esquema cierra con `additionalProperties: false`. `EVENTOS_AUDITADOS` (`libs/plataforma/auditoria/src/interface/auditoria.consumidor.ts`) los incluye, con un método `@SuscribirEvento` por tipo.
- `plat.manifiesto.json` en 1.21.0 con `plat.archivo.subir` y `plat.archivo.descargar`. Fijan la versión las pruebas de manifiesto de `archivos`, `auditoria`, `catalogos`, `identidad`, `org`, `personas` y `seguridad`.
- `tools/migrar/migrar.mjs` ordena con `sort()` byte a byte: `01m_arc.sql` va antes que `01m_arc_versiones.sql` (`.` es menor que `_`), igual que `01f_cat.sql` y `01f_cat_feriado.sql`. Cada migración corre en su transacción. `tools/migrar/test/db-esquemas.test.mjs` hace la ida y vuelta y corre `db/tests/*.test.sql`.
- El spec 34 (`specs/R2/34-arc-antivirus.md`) está en Draft y sin implementar: el antivirus sigue siendo `AnalizadorFirmaEicar` y no hay barrido que reencole archivos `EN_ANALISIS`. El 34 define ese barrido con la función `arc.archivos_en_analisis_atascados` y el caso de uso `ReencolarAnalisisAtascados`.

## Alcance

**Entra:**

- TR-RF-081: pedir una versión nueva de un archivo `DISPONIBLE` (URL firmada de carga; misma validación de MIME y tamaño de la categoría), confirmarla, y análisis en el worker con las mismas reglas (tamaño, tipo real, antivirus) más la comparación del hash contra todas las versiones del archivo.
- Estado por versión en `arc.version_archivo` y motivo del último intento de versión rechazado en `arc.archivo`.
- Una sola versión en curso por archivo; el archivo sigue `DISPONIBLE` y descargable mientras tanto.
- Lista de versiones y marcar una anterior como vigente.
- Descarga con el parámetro `version` (por defecto la vigente).
- `ArchivoPort` ampliado: `nuevaVersion`, `confirmarVersion`, `versiones`, `marcarVigente`; `urlDescarga` con `version`; `estado` con versión vigente, versión en curso y último rechazo.
- Eventos `archivo.version_creada` y `archivo.version_vigente_cambiada` por outbox, con esquema y auditados. `archivo.en_cuarentena` gana el campo `version`.
- La limpieza diaria borra también las versiones `PENDIENTE_CARGA` de más de 24 h, sin tocar el archivo.
- Migración `db/01m_arc_versiones.sql` con inverso, prueba SQL e ida y vuelta con relleno.
- Permiso `plat.archivo.versionar` en el manifiesto.

**No entra (specs futuros):**

- `<ui-archivo-carga>` y la lista de versiones en pantalla → spec 36.
- Carga desde el servidor (`ArchivoPort.guardar(bytes)`) → spec 52.
- Retención y bloqueo legal (TR-RF-083) → spec 69.
- Antivirus real y barrido de análisis atascados → spec 34. Si el 34 ya está implementado cuando se implemente este, su barrido se extiende aquí a las versiones (ver «Casos de uso»); si no, el 34 lo cubre para archivos y versiones.
- Borrar versiones, liberar cuarentenas, comparar o mostrar diferencias entre versiones.
- Nombre de archivo por versión: todas las versiones se descargan con el `nombre_original` del archivo.
- Asignar `plat.archivo.versionar` a roles predefinidos.

## Base de código reutilizada

| Pieza | Qué se hace |
| --- | --- |
| `domain/archivo.ts` (`Archivo`, `VersionArchivo`, `armarRutaStorage`) | El agregado pasa de una versión a la lista de versiones, cada una con su estado. Las transiciones del 33 se conservan para la primera carga. |
| `domain/resultado-analisis.ts` (`evaluarAnalisis`) | Gana el resultado `IDENTICA`. Orden nuevo: tamaño, tipo, idéntica, antivirus. |
| `application/solicitar-carga.ts`, `confirmar-carga.ts` | Sin cambio de comportamiento. `ConfirmarCarga` encola con `numero = 1`. Son el modelo de `SolicitarVersion` y `ConfirmarVersion`. |
| `application/analizar-archivo.ts` | Analiza la versión que indica el trabajo; para la versión de la primera carga se comporta como hoy. |
| `application/emitir-url-descarga.ts` | Acepta `version`; audita con el número. |
| `application/limpiar-cargas-pendientes.ts`, `ports/cargas-pendientes.ts`, `typeorm/cargas-pendientes.sql.ts` | Se agrega el recorrido de versiones pendientes vencidas. |
| `infrastructure/typeorm/` (`entidades.ts`, `mapeo.ts`, `archivos.repositorio.ts`) | Columnas nuevas; `obtener` carga todas las versiones y `guardar` las sincroniza. |
| `infrastructure/bullmq/cola-analisis.bullmq.ts` | `TrabajoAnalisis` con `numero`; `jobId` por versión. |
| `interface/archivos.controller.ts`, `archivos.dto.ts`, `archivos.http.ts` | Cuatro rutas nuevas, `version` en la descarga, campos nuevos en el estado y en el error. |
| `auditoria` (`EVENTOS_AUDITADOS`, `AuditoriaConsumidor`) | Dos eventos y dos métodos nuevos. |
| `apps/worker/src/archivos/` (`tarea-analisis.ts`, `tarea-limpieza.ts`) | Log con `archivoId` y `numero` del trabajo; resultado de limpieza con versiones. |
| `AlmacenArchivos`, `DetectorTipo`, `AnalizadorAntivirus`, `AutorizadorEntidad`, `exigirAccesoEntidad` | Sin cambios. |

## Modelo de datos

### Migración `db/01m_arc_versiones.sql` (+ `db/rollback/01m_arc_versiones.sql`, `db/tests/01m_arc_versiones.test.sql`)

```sql
-- 1. Estado por versión, rellenado desde el estado del archivo (hasta hoy cada archivo tiene solo la versión 1).
ALTER TABLE arc.version_archivo ADD COLUMN estado varchar(16);

ALTER TABLE arc.version_archivo NO FORCE ROW LEVEL SECURITY;
UPDATE arc.version_archivo v SET estado = a.estado FROM arc.archivo a WHERE a.id = v.archivo_id;
ALTER TABLE arc.version_archivo FORCE ROW LEVEL SECURITY;

ALTER TABLE arc.version_archivo
  ALTER COLUMN estado SET NOT NULL,
  ADD CONSTRAINT ck_version_estado CHECK (estado IN ('PENDIENTE_CARGA','EN_ANALISIS','DISPONIBLE','CUARENTENA','RECHAZADO')),
  ADD CONSTRAINT ck_version_rechazada CHECK (estado <> 'RECHAZADO' OR numero = 1),
  ADD CONSTRAINT ck_version_analizada CHECK ((estado IN ('DISPONIBLE','CUARENTENA')) = (hash_sha256 IS NOT NULL));

CREATE UNIQUE INDEX ux_version_en_curso ON arc.version_archivo (archivo_id)
  WHERE estado IN ('PENDIENTE_CARGA','EN_ANALISIS');
CREATE INDEX ix_version_pendiente ON arc.version_archivo (subido_en) WHERE estado = 'PENDIENTE_CARGA';

-- 2. Motivo del último intento de versión rechazado.
ALTER TABLE arc.archivo
  ADD COLUMN motivo_rechazo_version varchar(20)
    CHECK (motivo_rechazo_version IN ('TIPO_NO_PERMITIDO','TAMANO_NO_COINCIDE','IDENTICA')),
  ADD COLUMN version_coincidente integer CHECK (version_coincidente >= 1),
  ADD CONSTRAINT ck_archivo_rechazo_version CHECK (motivo_rechazo_version IS NULL OR estado = 'DISPONIBLE'),
  ADD CONSTRAINT ck_archivo_version_coincidente
    CHECK ((version_coincidente IS NOT NULL) = (motivo_rechazo_version IS NOT DISTINCT FROM 'IDENTICA'));
```

- `ck_archivo_disponible` y `ck_archivo_rechazo` no cambian: `estado` y `motivo_rechazo` del archivo siguen describiendo la primera carga; `version_vigente` sigue siendo no nulo solo en `DISPONIBLE`.
- `ck_version_rechazada`: solo la versión 1 puede quedar `RECHAZADO` (es la fila del archivo rechazado del 33). Una versión nueva rechazada se borra.
- `ck_version_analizada`: coincide con lo que el 33 ya escribe (`aprobar` y `ponerEnCuarentena` registran el hash; `rechazar` y `devolverAPendiente` no).
- `ux_version_en_curso`: segunda barrera de «una sola versión en curso»; la primera es el dominio con el bloqueo optimista del archivo.
- El relleno quita `FORCE ROW LEVEL SECURITY` dentro de la transacción de la migración y lo repone: con `FORCE`, un dueño sin `BYPASSRLS` no vería filas y `SET NOT NULL` fallaría.
- `arc.archivo.version` es el bloqueo optimista; `arc.archivo.version_vigente` y `arc.version_archivo.numero` son números de versión del archivo. No se renombra nada.
- Función `arc.versiones_pendientes_vencidas(p_antes timestamptz, p_limite integer)` `SECURITY DEFINER`, `search_path = ''`, dueño `org_lector`: devuelve `(tenant_id, archivo_id, numero)` de las versiones `PENDIENTE_CARGA` con `numero > 1` y `subido_en < p_antes`, de todos los tenants, de la más antigua a la más reciente. `GRANT SELECT ON arc.version_archivo TO org_lector` y política `version_archivo_lector FOR SELECT TO org_lector USING (true)`. `REVOKE EXECUTE ... FROM PUBLIC`, `GRANT EXECUTE` al rol de la aplicación y `REVOKE` a `anon` y `authenticated` si existen (patrón de `01m_arc.sql`).
- `arc.cargas_pendientes_vencidas` no cambia: sigue listando archivos `PENDIENTE_CARGA` (versión 1).
- Inverso: falla con mensaje claro si existe alguna versión con `numero > 1` (el código del 33 solo lee la versión 1 y los objetos quedarían huérfanos). Si no, borra la función, la política y el `GRANT` de `org_lector`, los dos índices, las restricciones y las tres columnas. Deja la base como la dejó `01m_arc.sql`.
- `db/tests/01m_arc.test.sql` (spec 33) se ajusta: sus inserciones en `arc.version_archivo` declaran `estado`.

### Dominio (`libs/plataforma/archivos/src/domain/`)

- `archivo.ts`:
  - `ESTADOS_VERSION = ['PENDIENTE_CARGA','EN_ANALISIS','DISPONIBLE','CUARENTENA','RECHAZADO']` y `CodigoEstadoVersion`. `VersionArchivo` gana `estado`.
  - `MOTIVOS_RECHAZO_VERSION = ['TIPO_NO_PERMITIDO','TAMANO_NO_COINCIDE','IDENTICA']`; `RechazoVersion { motivo, versionCoincidente: number | null }`.
  - `ArchivoProps`: `versiones: VersionArchivo[]` reemplaza a `primeraVersion`; se agrega `rechazoVersion: RechazoVersion | null`. Se conserva el getter `primeraVersion` y se agregan `versiones`, `versionEnCurso` (la que está `PENDIENTE_CARGA` o `EN_ANALISIS` con `numero > 1`), `versionNumero(numero)` y `versionConHash(hash)`.
  - Primera carga (sin cambio de comportamiento): `solicitar`, `confirmarCarga`, `aprobar`, `rechazar`, `ponerEnCuarentena` y `devolverAPendiente` mueven a la vez el estado del archivo y el de la versión 1.
  - `solicitarVersion({ mimeDeclarado, bytesDeclarados, solicitadoPor }, categoria)`: exige archivo `DISPONIBLE` (`ArchivoNoDisponibleError`) y ninguna versión en curso (`VersionEnCursoError`); valida MIME y tamaño con las mismas reglas de `solicitar`; el número es el mayor existente más uno; la ruta sale de `armarRutaStorage`; limpia `rechazoVersion`. Devuelve la versión `PENDIENTE_CARGA`.
  - `confirmarVersion(numero)`: `PENDIENTE_CARGA` → `EN_ANALISIS`; en otro estado devuelve `false`. Versión inexistente → `VersionNoEncontradaError`.
  - `aprobarVersion(numero, contenido)`: la versión queda `DISPONIBLE`, `versionVigente = numero`, evento `archivo.version_creada`.
  - `rechazarVersion(numero, rechazo)`: quita la versión del agregado y guarda `rechazoVersion`. Sin evento.
  - `ponerVersionEnCuarentena(numero, contenido)`: la versión queda `CUARENTENA`; el archivo sigue `DISPONIBLE` con su vigente; evento `archivo.en_cuarentena` con `version`.
  - `devolverVersionAPendiente(numero)`: `EN_ANALISIS` → `PENDIENTE_CARGA`.
  - `descartarVersionPendiente(numero)`: quita una versión `PENDIENTE_CARGA` (limpieza); en otro estado devuelve `false`.
  - `marcarVigente(numero)`: exige archivo `DISPONIBLE`; versión inexistente → `VersionNoEncontradaError`; versión no `DISPONIBLE` → `VersionNoDisponibleError`; si ya es la vigente devuelve `false` sin evento; si no, cambia `versionVigente` y publica `archivo.version_vigente_cambiada`.
  - Las cuatro transiciones de análisis de versión solo valen desde `EN_ANALISIS`.
- `resultado-analisis.ts`: `RESULTADOS_ANALISIS` gana `IDENTICA`; `HallazgosAnalisis` gana `versionCoincidente: number | null` (lo resuelve `archivo.versionConHash`). Orden: tamaño, tipo, idéntica, antivirus.
- `mensaje-rechazo-version.ts`: `mensajeRechazoVersion(rechazo, versionVigente)`. `IDENTICA` contra la vigente → «El archivo es idéntico a la versión vigente»; contra otra → «El archivo es idéntico a la versión {n}»; `TIPO_NO_PERMITIDO` y `TAMANO_NO_COINCIDE` con su texto. Textos en constantes con nombre.
- `errores.ts`: `VersionEnCursoError` (ConflictError, `VERSION_EN_CURSO`, lleva `numero`), `VersionNoEncontradaError` (NotFoundError, `VERSION_NO_ENCONTRADA`), `VersionNoDisponibleError` (ConflictError, `VERSION_NO_DISPONIBLE`, lleva `estado`).
- `eventos-arc.ts`: `EVENTOS_ARC.versionCreada`, `EVENTOS_ARC.versionVigenteCambiada`; tipos `ArchivoVersionCreada` y `ArchivoVersionVigenteCambiada`; `ArchivoEnCuarentena` gana `version`.
- `permisos-arc.ts`: `PERMISOS_ARC.versionar = 'plat.archivo.versionar'`.

### Puertos (`application/ports/`)

```ts
export interface ArchivoPort {
  solicitarCarga(comando: SolicitarCargaComando): Promise<CargaSolicitada>;
  confirmarCarga(archivoId: string): Promise<EstadoArchivo>;
  nuevaVersion(comando: NuevaVersionComando): Promise<VersionSolicitada>;      // { archivoId, tamano, mime } -> { archivoId, numero, carga }
  confirmarVersion(archivoId: string, numero: number): Promise<VersionListada>; // idempotente
  versiones(archivoId: string): Promise<VersionesArchivo>;                      // { archivoId, versionVigente, versiones: VersionListada[] }
  marcarVigente(archivoId: string, numero: number): Promise<EstadoArchivo>;     // idempotente
  urlDescarga(consulta: UrlDescargaConsulta): Promise<UrlDescarga>;             // consulta.version opcional
  estado(archivoId: string): Promise<EstadoArchivo>;
}

interface VersionListada {
  numero: number; estado: CodigoEstadoVersion; vigente: boolean;
  hashSha256?: string; bytes?: number; mimeReal?: string;                       // solo después del análisis
  subidoPor: string; subidoEn: Date;
}

interface EstadoArchivo {                       // se agregan tres campos
  // ...los del 33; bytes y hashSha256 pasan a ser los de la versión vigente (sin vigente, los de la versión 1)
  versionVigente?: number;
  versionEnCurso?: { numero: number; estado: CodigoEstadoVersion };
  rechazoVersion?: { motivo: MotivoRechazoVersion; versionCoincidente?: number; mensaje: string };
}

interface TrabajoAnalisis { tenantId: string; archivoId: string; numero?: number }   // sin numero: versión 1
interface CargasPendientes {
  listarVencidas(antes: Date, limite: number): Promise<CargaPendiente[]>;
  listarVersionesVencidas(antes: Date, limite: number): Promise<VersionPendiente[]>;  // { tenantId, archivoId, numero }
}
interface RepositorioArchivos {                 // se agrega
  listarVersiones(archivoId: string): Promise<VersionRegistrada[]>;                   // filas con subido_por y subido_en, por numero
}
```

`RepositorioArchivos.obtener` devuelve el agregado con todas sus versiones; `guardar` conserva el bloqueo optimista por `version` y sincroniza las versiones (inserta las nuevas, actualiza las cambiadas, borra las descartadas).

### Casos de uso (`application/`)

- `SolicitarVersion` (`solicitar-version.ts`):
  1. Archivo de otro tenant o inexistente → `ArchivoNoEncontradoError`.
  2. Autorizador de la entidad, si existe, con `puedeEditar`; falso → `AccesoEntidadDenegadoError`.
  3. Carga la categoría y llama a `archivo.solicitarVersion`; guarda (transacción).
  4. Fuera de la transacción borra el objeto que hubiera quedado en esa ruta (un intento rechazado cuyo borrado falló) y firma la carga. Si Storage falla → `AlmacenNoDisponibleError`; la versión queda `PENDIENTE_CARGA` y la limpia la tarea diaria.
- `ConfirmarVersion` (`confirmar-version.ts`): como `ConfirmarCarga`, sobre la versión. Exige `puedeEditar`. Tras confirmar la transacción encola `{ tenantId, archivoId, numero }`. Si la versión ya estaba `EN_ANALISIS` vuelve a encolar con el mismo `jobId`; en otro estado devuelve la versión sin encolar. Versión inexistente (rechazada o limpiada) → `VersionNoEncontradaError`. Cola caída → `AlmacenNoDisponibleError`. El encolado común con `ConfirmarCarga` va a una función compartida en `dependencias-archivos.ts`.
- `AnalizarArchivo` (`analizar-archivo.ts`), con `numero` del trabajo (1 si falta):
  1. Carga el archivo. Si la versión no existe o no está `EN_ANALISIS`, termina sin tocar Storage (idempotente). Se conserva la rama del 33 que borra el objeto de un archivo `RECHAZADO`.
  2. Lee los bytes fuera de la transacción. Sin objeto → `devolverAPendiente()` o `devolverVersionAPendiente(numero)`.
  3. Mide (SHA-256, tipo real, antivirus), resuelve `versionCoincidente` con `archivo.versionConHash` y aplica `evaluarAnalisis`.
  4. En una transacción guarda y publica. Primera carga: como en el 33. Versión nueva: `APROBADO` → `aprobarVersion`; `TAMANO_NO_COINCIDE`, `TIPO_NO_PERMITIDO` o `IDENTICA` → `rechazarVersion`; `INFECTADO` → `ponerVersionEnCuarentena`.
  5. Versión rechazada: borra el objeto después de confirmar. En cuarentena: el objeto se conserva.
  - Un conflicto de bloqueo optimista (alguien marcó vigente durante el análisis) relanza y BullMQ reintenta.
- `ListarVersiones` (`listar-versiones.ts`): archivo del tenant; `puedeLeer`; devuelve todas las versiones existentes por número, con `vigente` y su estado. Las rechazadas no figuran (se borraron).
- `MarcarVersionVigente` (`marcar-version-vigente.ts`): archivo del tenant; `puedeEditar`; `archivo.marcarVigente(numero)`; si cambió, guarda y publica en la misma transacción. Devuelve el estado del archivo.
- `EmitirUrlDescarga`: resuelve la versión (`consulta.version` o la vigente). Archivo no `DISPONIBLE` → `ArchivoNoDisponibleError`; versión inexistente → `VersionNoEncontradaError`; versión no `DISPONIBLE` → `VersionNoDisponibleError`. Firma la ruta de esa versión. La auditoría de categoría sensible agrega `version` a `despues`.
- `ConsultarEstadoArchivo` y `estadoDe` (`vista-archivo.ts`): agregan `versionVigente`, `versionEnCurso` y `rechazoVersion` con su mensaje.
- `LimpiarCargasPendientes`: después de los archivos recorre `listarVersionesVencidas(ahora − 24 h, 200)`; por cada una, con el contexto de su tenant, `descartarVersionPendiente(numero)`, borra el objeto y guarda. El archivo y sus otras versiones no se tocan. `ResultadoLimpieza` gana `versionesBorradas`.
- Barrido de análisis atascados: solo si el spec 34 está implementado al implementar este. Su barrido de archivos `EN_ANALISIS` de más de 15 min (`arc.archivos_en_analisis_atascados`, `ReencolarAnalisisAtascados`) se extiende a versiones `EN_ANALISIS` con la misma antigüedad y reencola `{ tenantId, archivoId, numero }`. Si el 34 no está, no se crea aquí: una versión atascada se reencola al confirmar otra vez, como en el 33.

### Eventos (`infrastructure/event-schemas.ts`, `registrarEsquemasArc`)

| Evento | Payload |
| --- | --- |
| `archivo.version_creada` | `{ archivo_id, categoria, entidad_tipo, entidad_id, version, hash_sha256, bytes, mime_real }` |
| `archivo.version_vigente_cambiada` | `{ archivo_id, categoria, entidad_tipo, entidad_id, version_anterior, version_vigente }` |
| `archivo.en_cuarentena` (cambia) | `{ archivo_id, categoria, entidad_tipo, entidad_id, version, firma }` |

Sin `nombre_original`. Los dos nuevos no están en el SRS: se documentan como añadidos. `archivo.disponible` no cambia: solo la primera disponibilidad del archivo. Los dos nuevos se agregan a `EVENTOS_AUDITADOS` con sus métodos `archivoVersionCreada` y `archivoVersionVigenteCambiada` en `AuditoriaConsumidor`. Todos siguen en `VERSION_ESQUEMA_ARC = 1`.

### Infraestructura

- `typeorm/entidades.ts`: `FilaVersionArchivo.estado`; `FilaArchivo.motivoRechazoVersion` y `versionCoincidente`.
- `typeorm/mapeo.ts`: `archivoDesdeFilas(fila, versiones)`; `cambiosDeArchivo` y `cambiosDeVersion` incluyen las columnas nuevas.
- `typeorm/archivos.repositorio.ts`: `obtener` con `find` ordenado por `numero`; `guardar` sincroniza versiones; `listarVersiones`. Todo con `getRepository`, filtrando por `tenant_id`.
- `typeorm/cargas-pendientes.sql.ts`: segunda consulta a `arc.versiones_pendientes_vencidas`. Sigue siendo el único SQL crudo (función de base de datos).
- `bullmq/cola-analisis.bullmq.ts`: `jobId = {archivoId}-{numero}`. Se mantienen `attempts: 3`, `removeOnComplete` y `removeOnFail`.

### HTTP (`interface/archivos.controller.ts`, `archivos.dto.ts`)

| Método y ruta | Permiso | Respuesta |
| --- | --- | --- |
| `POST /v1/archivos/{id}/versiones` | `plat.archivo.versionar` | 201 `{ archivo_id, numero, carga: { url, token, expira_en } }` |
| `POST /v1/archivos/{id}/versiones/{numero}/confirmar` | `plat.archivo.versionar` | 200 versión `{ numero, estado, vigente, ... }` |
| `GET /v1/archivos/{id}/versiones` | `plat.archivo.descargar` | 200 `{ archivo_id, version_vigente, versiones: [...] }` |
| `PATCH /v1/archivos/{id}/version-vigente` | `plat.archivo.versionar` | 200 estado del archivo |
| `GET /v1/archivos/{id}/descarga?version=&disposicion=&vigencia_segundos=` | `plat.archivo.descargar` | 200 `{ url, expira_en }` |
| `GET /v1/archivos/{id}` (cambia) | `plat.archivo.descargar` | 200 estado con `version_vigente`, `version_en_curso`, `rechazo_version` |

Cuerpo de `POST .../versiones`: `tamano`, `mime`. Cuerpo de `PATCH .../version-vigente`: `version`. Cada versión de la lista: `numero`, `estado`, `vigente`, `hash_sha256`, `bytes`, `mime_real`, `subido_por`, `subido_en`. `rechazo_version`: `{ motivo, version_coincidente?, mensaje }`.

Errores nuevos: 409 `VERSION_EN_CURSO` (con `numero`); 409 `ARCHIVO_NO_DISPONIBLE` (con `estado`) al versionar o marcar vigente; 404 `VERSION_NO_ENCONTRADA`; 409 `VERSION_NO_DISPONIBLE` (con `estado`). Se conservan 422 `MIME_NO_PERMITIDO`, `TAMANO_EXCEDIDO`, `DATOS_INVALIDOS`; 403 `ACCESO_ENTIDAD_DENEGADO`; 404 `NO_ENCONTRADO`; 503 `ALMACEN_NO_DISPONIBLE`. `ErrorArchivoDto` y `cuerpoDeError` agregan `numero`. OpenAPI completo.

Sondeo del cliente tras confirmar: `GET /v1/archivos/{id}` deja de traer `version_en_curso`; si `version_vigente` es el número pedido, se aprobó; si trae `rechazo_version`, se rechazó; si no, la versión figura en la lista como `CUARENTENA`.

### Composición

- `ArchivosModule.register`: proveedores de `SolicitarVersion`, `ConfirmarVersion`, `ListarVersiones` y `MarcarVersionVigente` con `DEPENDENCIAS_ARCHIVOS` (`MarcarVersionVigente` necesita además `EVENT_PUBLISHER`); `ServicioArchivos` y `CasosDeUsoArchivos` los suman. `registrarWorker` no cambia de firma.
- `src/index.ts`: exporta los errores, tipos de evento, `ESTADOS_VERSION`, `MOTIVOS_RECHAZO_VERSION` y los tipos nuevos del puerto, por ruta explícita.
- `apps/worker/src/archivos/tarea-analisis.ts`: el aviso de fallo registra `archivoId` y `numero` de `trabajo.data`, no el `jobId`. `tarea-limpieza.ts`: el resultado incluye `versionesBorradas`.
- `plat.manifiesto.json`: `plat.archivo.versionar` («Subir versiones de un archivo y elegir la vigente»); alcance `TENANT`, no sensible, sin rol predefinido ni opción de menú. Sube a la siguiente versión menor libre al implementar (1.22.0 o 1.23.0 según el orden con el spec 32). Las pruebas que fijan la versión se actualizan.
- Sin variables de entorno ni dependencias nuevas.

## Plan de implementación

1. **Migración.** `db/01m_arc_versiones.sql`, inverso y prueba SQL: CHECK de estado de versión, `ck_version_rechazada`, `ck_version_analizada`, `ux_version_en_curso`, CHECK del rechazo de versión, RLS entre dos tenants con varias versiones, `arc.versiones_pendientes_vencidas` ve todos los tenants y excluye la versión 1. Ajuste de `db/tests/01m_arc.test.sql`. En `tools/migrar/test/db-esquemas.test.mjs`: ida y vuelta con relleno (revertir, insertar archivos en los cinco estados, aplicar, comprobar el estado de cada versión 1) y el inverso que falla con versiones `numero > 1`. Entidades y mapeo con las columnas nuevas para que el 33 siga funcionando sobre la base migrada.
2. **Dominio.** `Archivo` con lista de versiones, transiciones de versión, `marcarVigente`, `evaluarAnalisis` con `IDENTICA`, `mensajeRechazoVersion`, errores y eventos, con pruebas. Las pruebas del 33 (`archivo.spec.ts`, `resultado-analisis.spec.ts`) siguen verdes.
3. **Persistencia.** `obtener` con todas las versiones, `guardar` que sincroniza, `listarVersiones`. Integración contra base temporal: versión nueva, borrado de la rechazada, reutilización del número, conflicto de bloqueo optimista, `ux_version_en_curso`, aislamiento por tenant.
4. **Carga y análisis de versiones.** `SolicitarVersion`, `ConfirmarVersion`, `TrabajoAnalisis` con `numero`, `jobId` por versión, `AnalizarArchivo` por versión. Esquemas de los eventos, `EVENTOS_AUDITADOS` y métodos del consumidor.
5. **Lista, vigente y descarga.** `ListarVersiones`, `MarcarVersionVigente`, `version` en `EmitirUrlDescarga` y en su auditoría, `estadoDe` ampliado.
6. **HTTP y composición.** Rutas, DTO, OpenAPI, `ArchivosModule`, `ServicioArchivos`, `plat.archivo.versionar` en el manifiesto. Prueba e2e de las rutas nuevas con el almacén en memoria.
7. **Limpieza y worker.** `LimpiarCargasPendientes` con versiones, `CargasPendientesSql`, log de `tarea-analisis.ts`. Si el 34 está implementado, extensión de su barrido.
8. **Cierre.** `code-simplifier` sobre los archivos tocados; `pnpm db:up:remoto` en Supabase dev; TR-CA-202 y 203 repetidos contra Storage real en Supabase dev; `npx nx run-many -t lint test -p archivos api worker auditoria seguridad migrar catalogos identidad org personas`.

## Criterios de aceptación

- [ ] TR-CA-202: un archivo en versión 2 recibe la corregida → queda en versión 3 y vigente, se publica `archivo.version_creada` con `version = 3`, y las versiones 1 y 2 se descargan con `version=1` y `version=2`.
- [ ] TR-CA-203: una versión con el mismo hash que la vigente → no hay versión nueva; la fila y el objeto del intento se borran; `GET /v1/archivos/{id}` trae `rechazo_version` con motivo `IDENTICA` y mensaje «El archivo es idéntico a la versión vigente»; el siguiente intento recibe el mismo número.
- [ ] Contenido idéntico a una versión anterior no vigente → rechazo `IDENTICA` con `version_coincidente` y mensaje «El archivo es idéntico a la versión {n}».
- [ ] Versión con tipo real no permitido (un `.exe` declarado `application/pdf`) o con tamaño distinto del declarado → rechazada con `TIPO_NO_PERMITIDO` o `TAMANO_NO_COINCIDE`, sin consumir número, objeto borrado, sin evento; el archivo sigue `DISPONIBLE` con su vigente.
- [ ] Versión con la firma EICAR → la versión queda `CUARENTENA` y consume número; el objeto sigue en Storage; el archivo sigue `DISPONIBLE` con su vigente anterior; se publica `archivo.en_cuarentena` con `version`; descargarla con `version=` responde 409 `VERSION_NO_DISPONIBLE`.
- [ ] Segunda subida de EICAR al mismo archivo → rechazo `IDENTICA` contra la versión en cuarentena; `uq_version_hash` no se viola.
- [ ] Pedir una versión con otra `PENDIENTE_CARGA` o `EN_ANALISIS` → 409 `VERSION_EN_CURSO` con su `numero`; mientras tanto la descarga por defecto entrega la vigente.
- [ ] Versionar o marcar vigente un archivo `PENDIENTE_CARGA`, `EN_ANALISIS`, `RECHAZADO` o `CUARENTENA` → 409 `ARCHIVO_NO_DISPONIBLE` con su `estado`.
- [ ] MIME fuera de la categoría → 422 `MIME_NO_PERMITIDO`; tamaño sobre el máximo → 422 `TAMANO_EXCEDIDO`; un MIME distinto del de la versión anterior pero dentro de la categoría se acepta.
- [ ] Pedir una versión limpia el `rechazo_version` anterior.
- [ ] Confirmar una versión sin haber subido el objeto → vuelve a `PENDIENTE_CARGA`; confirmar dos veces → 200 y un solo trabajo (mismo `jobId`); confirmar una versión inexistente → 404 `VERSION_NO_ENCONTRADA`.
- [ ] Marcar vigente una versión anterior `DISPONIBLE` → la descarga por defecto entrega esa versión y se publica `archivo.version_vigente_cambiada` con `version_anterior` y `version_vigente`.
- [ ] Marcar la que ya es vigente → 200, sin evento ni cambio de `arc.archivo.version`.
- [ ] Marcar vigente una versión en `CUARENTENA` o en curso → 409 `VERSION_NO_DISPONIBLE`; una inexistente → 404 `VERSION_NO_ENCONTRADA`.
- [ ] `GET /v1/archivos/{id}/versiones` lista cada versión con `numero`, `estado`, `hash_sha256`, `bytes`, `mime_real`, `subido_por`, `subido_en` y cuál es la vigente.
- [ ] `GET /v1/archivos/{id}` expone `version_vigente`, `version_en_curso` cuando la hay y `rechazo_version` cuando el último intento se rechazó.
- [ ] Descarga con `version` inexistente → 404 `VERSION_NO_ENCONTRADA`; sin `version` → la vigente. La descarga de una categoría sensible deja en `aud` el número de versión.
- [ ] Una versión `PENDIENTE_CARGA` de más de 24 h → la limpieza borra su objeto y su fila; el archivo, su vigente y sus otras versiones no cambian; una de 23 h o `EN_ANALISIS` no se toca.
- [ ] Reprocesar el mismo trabajo de análisis no duplica eventos ni versiones; un trabajo viejo de un intento rechazado no toca el intento nuevo con el mismo número.
- [ ] La carga y el análisis de la primera versión se comportan como en el 33 (TR-CA-199, 200 y 201 siguen verdes).
- [ ] Aislamiento: archivo del tenant B pedido desde A → 404 `NO_ENCONTRADO` en las cuatro rutas nuevas y en la descarga con `version`; la prueba SQL con dos `app.tenant_id` no ve versiones ajenas.
- [ ] Autorizador que niega `puedeEditar` → 403 `ACCESO_ENTIDAD_DENEGADO` al pedir versión, confirmar y marcar vigente; que niega `puedeLeer` → 403 al listar.
- [ ] Sin `plat.archivo.versionar` → 403 en pedir, confirmar y marcar vigente; sin `plat.archivo.descargar` → 403 al listar. Rutas en OpenAPI bajo `/v1`.
- [ ] `archivo.version_creada` y `archivo.version_vigente_cambiada` tienen esquema registrado, sus payloads lo cumplen y dejan fila en `aud` (TR-RNF-013).
- [ ] `ruta_storage` de la versión n es `{tenant_id}/{archivo_id}/{n}`; ningún payload ni log de ARC contiene `nombre_original`, la URL firmada ni el token (TR-RNF-026).
- [ ] `plat.archivo.versionar` está en el manifiesto con alcance `TENANT`, no sensible y sin rol predefinido.
- [ ] Migración `01m_arc_versiones` reversible y probada en CI contra PostgreSQL 16, incluido el relleno del estado de las versiones existentes y el inverso que se niega con versiones `numero > 1`.
- [ ] Cobertura de dominio de `archivos` ≥ 70 %.
- [ ] El código nuevo sigue la sección «Código limpio» de `CLAUDE.md`; persistencia con TypeORM, con el único SQL crudo en `CargasPendientesSql`.
- [ ] `npx nx run-many -t lint test -p archivos api worker auditoria seguridad migrar catalogos identidad org personas` verde; `nx affected` verde en el CI del PR.

## Decisiones

- **Sí:** el contenido se compara contra todas las versiones del archivo y el rechazo ocurre en el análisis, que es cuando se conoce el hash. Decisión del usuario. Idéntico a la vigente: «El archivo es idéntico a la versión vigente»; idéntico a otra: se indica su número para que el usuario la marque vigente.
- **No:** comparar solo contra la vigente. Decisión del usuario. Obliga a quitar `uq_version_hash`.
- **Sí:** el rechazo no consume número: la versión rechazada borra su objeto y su fila, y el motivo queda en `arc.archivo`. La cuarentena conserva fila y objeto y sí consume número. Decisión del usuario.
- **No:** una fila por cada intento rechazado, con huecos en la numeración. Decisión del usuario.
- **Sí:** una sola versión en curso por archivo; otra solicitud responde 409 `VERSION_EN_CURSO`. Decisión del usuario.
- **No:** varias versiones en paralelo. Decisión del usuario.
- **Sí:** dos eventos nuevos, `archivo.version_creada` y `archivo.version_vigente_cambiada`, con esquema y auditados. Decisión del usuario.
- **No:** reutilizar `archivo.disponible` para versiones. Decisión del usuario. Sigue siendo la primera disponibilidad.
- **Sí:** estado propio en `arc.version_archivo`. El archivo debe seguir `DISPONIBLE` mientras la versión nueva se sube y analiza.
- **Sí:** `arc.archivo.estado` sigue siendo el ciclo de la primera carga y no se toca. Mientras el archivo no es `DISPONIBLE` solo existe la versión 1 y su estado es el mismo del archivo (los escribe la misma transición). Desde que es `DISPONIBLE` no cambia más, y cada versión nueva lleva su propio ciclo.
- **No:** derivar el estado del archivo de sus versiones o quitar la columna. Rompe los CHECK, el índice `ix_archivo_pendiente`, `arc.cargas_pendientes_vencidas` y el código del 33 sin ganar nada.
- **Sí:** `RECHAZADO` como estado de versión solo para la número 1 (`ck_version_rechazada`). Es la fila del archivo rechazado del 33, que se conserva.
- **Sí:** el rechazo de versión en dos columnas nuevas (`motivo_rechazo_version`, `version_coincidente`), no en `motivo_rechazo`. `ck_archivo_rechazo` ata `motivo_rechazo` al estado `RECHAZADO` del archivo.
- **Sí:** orden del análisis: tamaño, tipo, idéntica, antivirus. Un contenido igual al de una versión en cuarentena también está infectado y violaría `uq_version_hash` al guardarse: se rechaza antes como `IDENTICA` con el número de esa versión.
- **Sí:** el mensaje del rechazo se arma al consultar, con la vigente de ese momento. Si la vigente cambió, el mensaje dice el número.
- **Sí:** pedir una versión limpia el rechazo anterior. El cliente distingue el resultado de su intento del anterior.
- **Sí:** solo se versiona un archivo `DISPONIBLE`; una versión aprobada pasa a vigente sola (RF-081: «incrementa versión»).
- **Sí:** el MIME de la versión puede cambiar dentro de la categoría. La regla es de la categoría, no del archivo.
- **Sí:** todas las versiones se descargan con el `nombre_original` del archivo. Conservador: un nombre por versión agrega columna y validación. Si la versión cambia de tipo, la extensión puede no coincidir; se revisa con el 36.
- **Sí:** marcar la versión ya vigente es idempotente: 200 sin evento. Marcar una en cuarentena o en curso → 409 `VERSION_NO_DISPONIBLE`; inexistente → 404 `VERSION_NO_ENCONTRADA`.
- **Sí:** se puede marcar vigente con una versión en curso. Si esa versión se aprueba después, pasa a vigente; el bloqueo optimista ordena las dos operaciones.
- **Sí:** rutas propias `POST /v1/archivos/{id}/versiones` y `POST /v1/archivos/{id}/versiones/{numero}/confirmar`. `@Permiso` admite un código y `POST /v1/archivos/{id}/confirmar` exige `plat.archivo.subir`: quien solo versiona no podría confirmar.
- **No:** reutilizar `ConfirmarCarga` con un parámetro. Mezcla dos permisos y dos estados en un caso de uso; `ConfirmarVersion` comparte solo el encolado.
- **Sí:** `GET /v1/archivos/{id}/versiones` con `plat.archivo.descargar` y `puedeLeer`; versionar y marcar vigente con `plat.archivo.versionar` y `puedeEditar`.
- **Sí:** `TrabajoAnalisis` con `numero` opcional (por defecto 1) y `jobId = {archivoId}-{numero}`. Los trabajos encolados antes del despliegue siguen valiendo. Sin `:` en el `jobId`: BullMQ lo reserva para sus claves; se comprueba en su documentación al implementar.
- **Sí:** el análisis no borra objetos de una versión que ya no existe; `SolicitarVersion` borra lo que quede en la ruta antes de firmar. Evita que un trabajo viejo borre el objeto de un intento nuevo con el mismo número.
- **Sí:** `archivo.en_cuarentena` gana `version` en el mismo `schema_version` 1. Con versiones, el evento sin número no dice si el archivo o una versión quedó en cuarentena. El único consumidor es AUD, que es genérico, y ARC no está habilitado en producción.
- **Sí:** `archivo.version_vigente_cambiada` lleva también `categoria`, `entidad_tipo` y `entidad_id`, como los demás eventos de ARC. El consumidor filtra por entidad sin llamar a `ArchivoPort`.
- **Sí:** la limpieza diaria se extiende a versiones `PENDIENTE_CARGA` de más de 24 h con una función propia `arc.versiones_pendientes_vencidas`. `arc.cargas_pendientes_vencidas` no cambia de firma.
- **Sí:** el barrido de versiones `EN_ANALISIS` se extiende aquí solo si el 34 ya está implementado. El 34 está en Draft y el roadmap hace depender al 35 solo del 33; no se declara dependencia.
- **Sí:** `ux_version_en_curso` como segunda barrera en la base. El dominio y el bloqueo optimista son la primera.
- **No:** FK de `arc.archivo (id, version_vigente)` a `arc.version_archivo`. Referencia circular para una regla que el dominio ya garantiza y la integración prueba.
- **Sí:** el inverso de la migración se niega si hay versiones `numero > 1`. El código del 33 no las lee y sus objetos quedarían huérfanos.
- **Sí:** el relleno quita y repone `FORCE ROW LEVEL SECURITY` dentro de la migración. No depende de que el rol que migra tenga `BYPASSRLS`.
- **Sí:** el agregado carga todas sus versiones. Son pocas por archivo y las necesita para numerar, comparar hashes y saber si hay una en curso. La lista con `subido_en` sale de `listarVersiones`.
- **Sí:** SQL crudo solo para las dos funciones de base de datos, en `CargasPendientesSql` (regla 11).
- **Sí:** migración `01m_arc_versiones` (letra `m` de ARC; se aplica después de `01m_arc.sql`).
- **Sí:** `plat.archivo.versionar` solo en el manifiesto, sin rol predefinido (criterio del 33).

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| El cambio del agregado (una versión → lista) rompe el flujo del 33 | Las pruebas del 33 no se cambian salvo por la forma del agregado; TR-CA-199, 200 y 201 son criterio de este spec. |
| Entre aplicar la migración y desplegar, el código del 33 inserta versiones sin `estado` y falla | ARC no está habilitado en producción (espera al 34). En dev y staging se migra y se despliega seguido. |
| La URL de carga de un intento rechazado vive 2 h y apunta a la ruta que reutiliza el intento siguiente | La tiene el mismo usuario; la carga no reemplaza objetos; el análisis valida tamaño, tipo, hash y antivirus de lo que haya en la ruta. `SolicitarVersion` borra restos antes de firmar. |
| Una versión queda `EN_ANALISIS` (worker caído, intentos agotados) y bloquea el archivo con `VERSION_EN_CURSO` | `confirmar` reencola con el mismo `jobId`; el barrido del 34 la reencola sola cuando exista. La vigente sigue descargable. |
| Marcar vigente y aprobar una versión a la vez | Bloqueo optimista sobre `arc.archivo.version`: la API responde 409 `conflict`; el análisis reintenta por BullMQ. |
| Dos solicitudes de versión simultáneas | Bloqueo optimista y `ux_version_en_curso`; la segunda responde 409. |
| El relleno deja versiones sin estado | `SET NOT NULL` hace fallar la migración entera; la ida y vuelta con datos lo prueba en CI. |
| Storage real solo existe en Supabase Cloud | Pruebas locales y de CI con `AlmacenArchivosMemoria`; TR-CA-202 y 203 se repiten a mano contra Supabase dev al cerrar. |
| Las versiones en cuarentena acumulan objetos | Fuera de alcance: liberar o borrar cuarentenas va en su propio spec; la retención es el 69. |

## Lo que **no** entra en este spec

- `<ui-archivo-carga>` y la lista de versiones en pantalla (spec 36).
- Carga desde el servidor (spec 52).
- Retención y bloqueo legal (spec 69).
- Antivirus real y barrido de análisis atascados (spec 34), salvo su extensión a versiones si ya existe.
- Borrar versiones, liberar cuarentenas, comparar o mostrar diferencias entre versiones.
- Nombre de archivo por versión.
- Roles predefinidos con `plat.archivo.versionar`.

Cada uno, si llega, va en su propio spec.
