# SPEC 34 — Archivos: antivirus real con ClamAV (clamd) y reencolado de análisis atascados

> **Status:** Implementado
> **Depends on:** SPEC 33, SPEC 21
> **Date:** 2026-11-18
> **Objective:** Hacer que el worker analice cada archivo de TR-ARC con ClamAV (`clamd` por TCP, en la red privada) detrás del puerto `AnalizadorAntivirus`, elegir el motor por ambiente con `ARC_ANTIVIRUS`, reencolar los archivos que llevan más de 15 minutos `EN_ANALISIS` y dejar clamd funcionando en staging, para cumplir TR-RNF-114.

## Por qué existe este spec

Fila 34 de `docs/roadmap-specs.md` (TR-RNF-114, adaptador real). Contexto: `docs/spec-context/tr-arc/arc-subida-versiones-url-firmada.md`, partición B y pregunta 2 de la sec. 9. El spec 33 dejó un solo antivirus, `AnalizadorFirmaEicar`, que da por limpio todo lo que no sea la cadena de prueba: por eso TR-ARC no se habilita en producción.

El roadmap da 4 h. Con el barrido de atascados y staging el estimado real es 6-7 h. Si se pasa, se recorta en este orden: la comprobación `PING` al arrancar, la prueba de 25 MB en el CI (queda solo en staging) y la variante con clamd de `apps/api/test/archivos.integracion.spec.ts` (queda la prueba de integración del adaptador). El barrido y staging no se recortan: son decisiones del usuario.

Lo que hay en el código hoy (revisado al redactar):

- `libs/plataforma/archivos/src/application/ports/analizador-antivirus.ts`: `AnalizadorAntivirus.analizar(contenido: Uint8Array): Promise<ResultadoAntivirus>` con `{ limpio, firma? }`. Su comentario ya fija el contrato: «Si el motor no responde, lanza: el trabajo de análisis se reintenta».
- `application/analizar-archivo.ts`: lee los bytes con `AlmacenArchivos.leer`, calcula SHA-256, detecta el tipo y llama al antivirus. No atrapa errores: un fallo relanza y el archivo sigue `EN_ANALISIS`. La firma viaja a `archivo.en_cuarentena` (`firma: textoCorto` en `infrastructure/event-schemas.ts`); sin firma usa `DESCONOCIDA`.
- `archivos.module.ts`: `ArchivosModule.registrarWorker({ dataSource, supabase, bucket })` crea `new AnalizadorFirmaEicar()` fijo. No recibe `redisUrl`: el worker no puede encolar.
- `infrastructure/bullmq/cola-analisis.bullmq.ts`: `jobId = archivoId`, `attempts: 3`, espera exponencial desde 5 s, `removeOnComplete` y `removeOnFail` en `true`. Un trabajo terminado o fallido no retiene su `jobId`.
- Agotados los 3 intentos el archivo queda `EN_ANALISIS` sin trabajo. Solo lo rescata el cliente llamando otra vez a `confirmar` (`ConfirmarCarga` reencola).
- `infrastructure/typeorm/cargas-pendientes.sql.ts` (`CargasPendientesSql`, `EjecutorSql`) y `arc.cargas_pendientes_vencidas` en `db/01m_arc.sql`: función `SECURITY DEFINER`, `search_path = ''`, dueño `org_lector`, `REVOKE` a `PUBLIC`, `GRANT EXECUTE` a `current_user`. Es el patrón del barrido.
- `arc.archivo.actualizado_en` lo mantiene TypeORM (`updateDate: true` en `entidades.ts`): cambia cuando `ConfirmarCarga` guarda el paso a `EN_ANALISIS`.
- `apps/worker/src/archivos/`: `tarea-analisis.ts` (concurrencia 2), `tarea-limpieza.ts` (cola `arc-limpieza`, `upsertJobScheduler`, zona `America/Lima`) y `archivos.module.ts`.
- `apps/worker/src/config/env.ts`: `ARC_BUCKET`, `ARC_LIMPIEZA_CRON`; sin variables de antivirus. `NODE_ENV` es `production` en toda imagen (`apps/worker/Dockerfile`), también en staging. El ambiente lo distingue `APP_ENV` (`local | test | staging | production`, `libs/plataforma/observabilidad-arranque`). Precedente de «en producción no se admite el adaptador de prueba»: `exigirProveedorReal` en `libs/plataforma/identidad/src/interface/entorno-identidad.ts`.
- CI (`.github/workflows/ci.yml`): el job `nx` levanta `postgres:16` y `redis:7` como servicios y corre `pnpm nx affected -t lint test build`. Las pruebas con base se saltan sin `TEST_DATABASE_URL`. Las pruebas SQL de `db/tests/` las lista `tools/migrar/test/db-esquemas.test.mjs` (`CASOS`).
- Runner de migraciones (`tools/migrar/migrar.mjs`): ordena los `.sql` con `sort()` byte a byte y registra el nombre en `migraciones._migraciones`. `01m_arc_analisis.sql` queda después de `01m_arc.sql` (`.` va antes que `_`, como `01a_org.sql` y `01a_org_alta.sql`).
- Staging (`docs/ops/staging.md`): proyecto Railway `vitrina-staging` con `api`, `worker` y Redis. La tabla «Solo `api`» lista `SUPABASE_URL` y `SUPABASE_SECRET_KEY`, pero el worker las exige desde el 33: el documento quedó desactualizado.
- `libs/plataforma/observabilidad` solo expone métricas del outbox (`registrarMetricasOutbox`). No hay un medidor genérico: aquí la observabilidad va por logs.
- Verificado en la documentación de ClamAV (context7, `docs.clamav.net`): `INSTREAM` exige prefijo `n` o `z`; cada trozo lleva 4 bytes de longitud en orden de red y el flujo termina con un trozo de longitud cero; si se pasa de `StreamMaxLength` clamd responde `INSTREAM size limit exceeded`. La imagen oficial escucha clamd en el puerto 3310, sin cifrado ni autenticación. RAM recomendada: mínimo 3 GiB, preferido 4 GiB. Se recomienda una etiqueta de versión menor (`clamav/clamav:1.4`) y un volumen para las firmas.
- No verificado (se confirma en el paso 2 o 6, antes de escribir el código que depende de ello): texto exacto de `PING`/`PONG` y de `stream: <firma> FOUND`; valor por defecto de `StreamMaxLength`, `MaxFileSize` y `MaxScanSize`, y que clamd da por limpio sin analizar lo que supera `MaxFileSize`; variables de la imagen (`CLAMAV_NO_FRESHCLAMD`, `CLAMD_STARTUP_TIMEOUT`); tiempo de arranque; ruta de `clamd.conf` y del volumen de firmas; nombre DNS privado de Railway y si clamd escucha en IPv6.

## Alcance

**Entra:**

- Adaptador `AnalizadorClamav` (cliente TCP propio con `node:net`, comando `zINSTREAM`) que implementa `AnalizadorAntivirus` sin cambiar su contrato.
- Error `AntivirusNoDisponibleError` para clamd caído, tiempo agotado, respuesta desconocida y tamaño excedido. Nunca se interpreta como «limpio».
- Selección del motor por ambiente: `ARC_ANTIVIRUS=eicar|clamav`. El worker no arranca con `APP_ENV=production` y `eicar`.
- Comprobación `PING` al arrancar el worker con `clamav`: avisa, no detiene el arranque.
- Barrido periódico del worker que reencola los archivos `EN_ANALISIS` de más de 15 minutos: función `arc.archivos_en_analisis_atascados`, caso de uso `ReencolarAnalisisAtascados` y tarea `TareaReencoladoArchivos`.
- Migración `db/01m_arc_analisis.sql` con su inverso y prueba SQL.
- Servicio `clamav` en el job `nx` del CI y pruebas del adaptador real: cadena EICAR, archivo limpio y archivo de 25 MB.
- Staging: servicio `clamav` en Railway `vitrina-staging`, variables del worker, sección nueva en `docs/ops/staging.md` y TR-CA-201 contra clamd real.
- Logs estructurados del análisis: motor, resultado, duración y bytes.
- Nota de la fila 34 en `docs/roadmap-specs.md`.

**No entra (specs futuros):**

- Versiones en análisis mientras el archivo sigue `DISPONIBLE` → spec 35. El barrido de este spec cubre solo archivos en estado `EN_ANALISIS`; el 35 lo extiende a las versiones.
- `<ui-archivo-carga>` → spec 36.
- Servicio clamd de producción: queda documentado; se despliega con el plan de pase a producción.
- Reanalizar los archivos ya `DISPONIBLE` que solo pasaron por EICAR. Solo existen en dev y staging.
- Liberar un archivo de `CUARENTENA`.
- Análisis por flujo sin cargar el archivo en memoria (ver Decisiones).
- ClamAV en local: `docker-compose.yml` no cambia.
- Métricas OpenTelemetry del antivirus y alerta en Grafana.

## Base de código reutilizada

| Pieza | Qué se hace |
| --- | --- |
| `AnalizadorAntivirus` y `ResultadoAntivirus` (`application/ports/analizador-antivirus.ts`) | Sin cambios de contrato. Se agrega en el mismo archivo el puerto `SaludAntivirus`. |
| `AnalizarArchivo` | Sin cambios. Ya relanza los errores del antivirus y lleva la firma al evento. |
| `AnalizadorFirmaEicar` | Se conserva para local y pruebas. Implementa también `SaludAntivirus` (siempre responde). |
| `ColaAnalisis`, `abrirColaAnalisis`, `ColaAnalisisAbierta` | Sin cambios. El worker abre la cola para reencolar con el mismo `jobId`. |
| `CargasPendientesSql`, `EjecutorSql`, `arc.cargas_pendientes_vencidas` | Patrón del adaptador SQL y de la función. `EjecutorSql` se reutiliza. |
| `LimpiarCargasPendientes` | Patrón del caso de uso por lotes con `Clock`. |
| `TareaLimpiezaArchivos` (`apps/worker/src/archivos/tarea-limpieza.ts`) | Patrón de la tarea con cron: cola propia, `upsertJobScheduler`, avisos y `REPORTADOR_ERRORES`. |
| `exigirProveedorReal` (`identidad`) | Patrón de la validación de entorno por `APP_ENV`. No se importa. |
| `apps/api/test/archivos.integracion.spec.ts` | Se agrega un bloque con clamd real; el resto no cambia. |
| `docs/ops/staging.md` y `deploy-staging.yml` | El documento gana una sección; el workflow no cambia. |

## Diseño

### Adaptador `infrastructure/antivirus/analizador-clamav.ts`

```ts
export interface OpcionesClamav {
  host: string;
  puerto: number;
  tiempoConexionMs: number;
  tiempoRespuestaMs: number;
  alAnalizar?: (medicion: MedicionAntivirus) => void;   // log; sin contenido ni nombre
}
export interface MedicionAntivirus {
  resultado: 'LIMPIO' | 'INFECTADO' | 'ERROR';
  duracionMs: number;
  bytes: number;
  codigoError?: CodigoErrorAntivirus;
}

export class AnalizadorClamav implements AnalizadorAntivirus, SaludAntivirus {
  analizar(contenido: Uint8Array): Promise<ResultadoAntivirus>;
  comprobar(): Promise<void>;                            // PING
}
```

- Una conexión TCP por análisis; se cierra al recibir la respuesta. Sin `IDSESSION` ni conexiones reutilizadas.
- `analizar`: escribe `zINSTREAM\0`, luego el contenido en trozos de `TAMANO_TROZO_BYTES` (64 KiB), cada uno con su longitud en 4 bytes big-endian, y el trozo final de longitud cero. Los trozos son vistas (`subarray`) del mismo `Uint8Array`: no se copia el archivo. Respeta la contrapresión del socket.
- Respuesta, hasta el byte NUL o el cierre:

  | Respuesta de clamd | Resultado |
  | --- | --- |
  | `stream: OK` | `{ limpio: true }` |
  | `stream: <firma> FOUND` | `{ limpio: false, firma }` |
  | `INSTREAM size limit exceeded` | `AntivirusNoDisponibleError('TAMANO_EXCEDIDO')` |
  | Cualquier otra, vacía o `... ERROR` | `AntivirusNoDisponibleError('RESPUESTA_DESCONOCIDA')` |
  | Conexión rechazada o cortada | `AntivirusNoDisponibleError('CONEXION')` |
  | Sin conexión en `tiempoConexionMs` o sin respuesta en `tiempoRespuestaMs` | `AntivirusNoDisponibleError('TIEMPO_AGOTADO')` |

- Solo las dos primeras filas devuelven un resultado. Todo lo demás lanza.
- `comprobar`: envía `zPING\0` y exige `PONG`; si no, lanza el mismo error.
- La firma se recorta al largo de `textoCorto` del esquema del evento si lo supera.
- `domain/errores.ts`: `AntivirusNoDisponibleError` (`code = 'ANTIVIRUS_NO_DISPONIBLE'`, `codigoOrigen`), con la forma de `AlmacenNoDisponibleError`. El mensaje lleva solo el código, nunca la respuesta cruda de clamd.
- `application/ports/analizador-antivirus.ts`: `SaludAntivirus { comprobar(): Promise<void> }`.

### Barrido de atascados

Migración `db/01m_arc_analisis.sql` (+ `db/rollback/01m_arc_analisis.sql`, `db/tests/01m_arc_analisis.test.sql`):

```sql
CREATE INDEX ix_archivo_en_analisis ON arc.archivo (actualizado_en) WHERE estado = 'EN_ANALISIS';

CREATE FUNCTION arc.archivos_en_analisis_atascados(p_antes timestamptz, p_limite integer)
RETURNS TABLE (tenant_id uuid, archivo_id uuid)
LANGUAGE sql STABLE STRICT SECURITY DEFINER SET search_path = '' AS $$
  SELECT a.tenant_id, a.id
    FROM arc.archivo a
   WHERE a.estado = 'EN_ANALISIS' AND a.actualizado_en < p_antes
   ORDER BY a.actualizado_en, a.id
   LIMIT p_limite;
$$;
```

- Dueño `org_lector`, `REVOKE EXECUTE ... FROM PUBLIC`, `GRANT EXECUTE` a `current_user` y `REVOKE` a `anon` y `authenticated` si existen: igual que `arc.cargas_pendientes_vencidas`. `org_lector` ya tiene `SELECT` y su política sobre `arc.archivo` (01m_arc).
- Inverso: borra la función y el índice.
- `application/ports/archivos-atascados.ts`: `ArchivosAtascados.listarEnAnalisisAntesDe(antes: Date, limite: number): Promise<TrabajoAnalisis[]>`.
- `infrastructure/typeorm/archivos-atascados.sql.ts`: `ArchivosAtascadosSql` sobre `EjecutorSql`. SQL crudo por ser función de base de datos (regla 11).
- `application/reencolar-analisis-atascados.ts`: `ReencolarAnalisisAtascados.ejecutar(): Promise<{ reencolados: number; fallidos: number }>`.
  1. `antes = reloj.now() − MINUTOS_HASTA_ATASCADO` (15).
  2. Pide un lote de `TAMANO_LOTE` (200), del más antiguo al más reciente.
  3. Llama a `cola.encolar({ tenantId, archivoId })` por cada uno. Un encolado que falla suma a `fallidos` y sigue.
  - No abre transacción ni cambia el archivo: sigue `EN_ANALISIS` hasta que `AnalizarArchivo` lo resuelva. Un lote por corrida.
  - `jobId = archivoId`: si el trabajo sigue vivo (en espera, activo o con reintento pendiente) BullMQ no crea otro.
- `apps/worker/src/archivos/tarea-reencolado.ts`: `TareaReencoladoArchivos`, cola `arc-reencolado`, programador `arc-reencolado`, patrón `ARC_REENCOLADO_CRON`, zona `America/Lima`, sin reintentos. Registra `info` con el resultado, o `warn` si hubo reencolados o fallidos.

### Composición

- `ArchivosModule.registrarWorker` recibe además `redisUrl` y `antivirus`:

  ```ts
  type OpcionesAntivirus =
    | { motor: 'eicar' }
    | { motor: 'clamav'; host: string; puerto: number; tiempoConexionMs: number; tiempoRespuestaMs: number };
  ```

  Crea el analizador según `motor`, abre la cola con `abrirColaAnalisis` (cerrada con `CierreColaAnalisis`), y exporta `ReencolarAnalisisAtascados` y el token `SALUD_ANTIVIRUS`. Con `clamav`, `alAnalizar` escribe el log con el `Logger('Archivos')` del módulo.
- `libs/plataforma/archivos/src/interface/entorno-archivos.ts`: `MOTORES_ANTIVIRUS`, `camposEntornoAntivirus` y `exigirAntivirusReal`, exportados por `index.ts`.
- `apps/worker/src/config/env.ts`: agrega `...camposEntornoAntivirus`, `ARC_REENCOLADO_CRON` y `.superRefine(exigirAntivirusReal)`.
- `apps/worker/src/archivos/archivos.module.ts` y `worker.module.ts`: pasan `antivirus` y `patronReencolado`; registran `TareaReencoladoArchivos`.
- `TareaAnalisisArchivos.onApplicationBootstrap`: llama a `SaludAntivirus.comprobar()`. Si responde, `info` «Antivirus listo» con el motor. Si no, `warn` con el código y `REPORTADOR_ERRORES`; la cola arranca igual.
- `apps/api` no cambia: la API no habla con clamd.
- Sin dependencia npm nueva.

### Variables de entorno (solo worker; `.env.example` con comentario)

| Variable | Por defecto | Regla |
| --- | --- | --- |
| `ARC_ANTIVIRUS` | `eicar` | `eicar` o `clamav`. Con `APP_ENV=production` debe ser `clamav`: «en producción debe ser clamav». |
| `CLAMAV_HOST` | — | Obligatoria con `clamav`. |
| `CLAMAV_PORT` | `3310` | Entero positivo. |
| `CLAMAV_TIMEOUT_MS` | `60000` | Espera de la respuesta de clamd. |
| `CLAMAV_CONEXION_TIMEOUT_MS` | `5000` | Espera de la conexión TCP. |
| `ARC_REENCOLADO_CRON` | `*/5 * * * *` | Cron de 5 campos, zona `America/Lima`. |

### Log del análisis

`{ evento: 'arc.antivirus.analisis', motor, resultado, duracion_ms, bytes, codigo_error? }`. Sin `nombre_original`, ruta, contenido, firma cruda de error ni respuesta de clamd. El `archivoId` sale en el log de fallo que ya escribe `TareaAnalisisArchivos`.

### Servicio clamd

- Imagen `clamav/clamav` con etiqueta de versión menor fijada (la estable vigente al implementar; nunca `latest`).
- `clamd.conf`: `StreamMaxLength 30M`, `MaxFileSize 30M` y `MaxScanSize 30M` como mínimo. Cubre los 25 MB del bucket (`26214400` bytes) con margen. Un archivo mayor que `MaxFileSize` clamd lo da por limpio sin analizarlo: por eso se fija junto con `StreamMaxLength`.
- **CI** (`ci.yml`, job `nx`): servicio `clamav` con el puerto 3310 publicado, y `CLAMAV_HOST=localhost`, `CLAMAV_PORT=3310` en el `env` del job. Antes de `nx affected`, un paso «Configurar y esperar clamd»: escribe los tres límites en el `clamd.conf` del contenedor (`docker exec` sobre `job.services.clamav.id`), lo reinicia y espera `PONG` con tope de 5 minutos. Sin `CLAMAV_HOST` las pruebas con clamd se saltan (`describeConClamav`), como las de base sin `TEST_DATABASE_URL`.
- **Staging** (Railway `vitrina-staging`): servicio `clamav` desde la imagen, sin dominio público, con volumen para las firmas y los mismos tres límites. El worker lo alcanza por la red privada del proyecto. `deploy-staging.yml` no lo redespliega: la imagen no es del repo.
- La forma exacta de fijar los límites en la imagen (comando de inicio de Railway o archivo montado) y el nombre DNS privado se confirman en la documentación de la imagen y de Railway en el paso 6 y quedan escritos en `docs/ops/staging.md`.

## Plan de implementación

1. **Migración.** `db/01m_arc_analisis.sql`, inverso y prueba SQL: un `EN_ANALISIS` de 16 min sale, uno de 14 min no, otros estados no; ve dos tenants; orden por antigüedad y límite; `arc_test_sin_permiso` recibe `42501`; `anon` y `authenticated` sin `EXECUTE`; ida y vuelta. Alta en `CASOS` de `tools/migrar/test/db-esquemas.test.mjs`.
2. **Adaptador ClamAV.** Antes de codificar, confirmar en `docs.clamav.net` el texto de `PING`/`PONG` y de `FOUND`. `AntivirusNoDisponibleError`, `SaludAntivirus`, `AnalizadorClamav`. Pruebas unitarias contra un servidor TCP falso (`node:net`): `OK`, `FOUND` con firma, tamaño excedido, respuesta desconocida, conexión rechazada, sin respuesta (tiempo agotado), trozos con su longitud y cierre con trozo cero, `PING`. Prueba `analizador-clamav.integracion.spec.ts` con `describeConClamav`: EICAR, PDF limpio, 25 MB y `PING`.
3. **Composición y entorno.** `OpcionesAntivirus` en `registrarWorker`, `entorno-archivos.ts`, variables en `apps/worker/src/config/env.ts` y `.env.example`, `PING` al arrancar. Pruebas en `apps/worker/test/env.spec.ts`: valores por defecto, `production` con `eicar` no arranca, `clamav` sin `CLAMAV_HOST` no arranca. El worker sigue funcionando en local con `eicar`.
4. **Barrido.** `ArchivosAtascados`, `ArchivosAtascadosSql`, `ReencolarAnalisisAtascados` y `TareaReencoladoArchivos`. Pruebas: caso de uso con dobles; tarea contra Redis en `apps/worker/test/archivos.spec.ts` (programador, un solo trabajo con el mismo `jobId`).
5. **CI.** Servicio `clamav` y paso de espera en `ci.yml`. Bloque nuevo en `apps/api/test/archivos.integracion.spec.ts` con `registrarWorker({ antivirus: { motor: 'clamav', ... } })`: TR-CA-201 y archivo limpio contra clamd real; clamd inalcanzable (puerto cerrado) deja el archivo `EN_ANALISIS`.
6. **Staging.** Servicio `clamav` en Railway, variables del worker (`ARC_ANTIVIRUS=clamav`, `CLAMAV_HOST`, `CLAMAV_PORT`), redeploy del worker. Sección «ClamAV» en `docs/ops/staging.md`: creación del servicio, límites, volumen, RAM, variables, cómo comprobar y qué replicar en producción; se corrige la tabla de variables (el worker también lleva `SUPABASE_URL` y `SUPABASE_SECRET_KEY`) y se agrega la fila en «Estado».
7. **Cierre.** `code-simplifier` sobre los archivos tocados; `pnpm db:up:remoto` en Supabase dev; prueba en staging de TR-CA-201 (EICAR y archivo limpio) y del archivo de 25 MB, con la evidencia en `docs/ops/staging.md`; nota de la fila 34 en `docs/roadmap-specs.md`.

## Criterios de aceptación

- [ ] TR-CA-201 contra clamd real (CI y staging): un archivo con la cadena EICAR → `CUARENTENA`, `archivo.en_cuarentena` con la firma que devuelve ClamAV (no `EICAR-Test-File` ni `DESCONOCIDA`), el objeto sigue en Storage y la descarga responde 409.
- [ ] Un PDF limpio contra clamd real (CI y staging) → `DISPONIBLE` con `archivo.disponible`.
- [ ] clamd caído o inalcanzable → el trabajo falla con `AntivirusNoDisponibleError`, BullMQ lo reintenta y el archivo sigue `EN_ANALISIS`; nunca `DISPONIBLE`.
- [ ] Respuesta desconocida, vacía o `INSTREAM size limit exceeded` → error; ninguna se interpreta como limpio.
- [ ] Sin respuesta de clamd → el análisis falla al cumplirse `CLAMAV_TIMEOUT_MS`; sin conexión → al cumplirse `CLAMAV_CONEXION_TIMEOUT_MS`. El socket queda cerrado.
- [ ] Un archivo de 25 MB (`26214400` bytes) se analiza sin `size limit exceeded` (CI y staging).
- [ ] Un archivo `EN_ANALISIS` de más de 15 min → el barrido lo reencola; dos corridas seguidas con el trabajo aún vivo dejan un solo trabajo (mismo `jobId`).
- [ ] Un archivo `EN_ANALISIS` de 14 min, o en `PENDIENTE_CARGA`, `DISPONIBLE`, `CUARENTENA` o `RECHAZADO`, no se toca.
- [ ] El barrido no cambia el estado: un archivo reencolado con clamd caído sigue `EN_ANALISIS`.
- [ ] `arc.archivos_en_analisis_atascados` ve los archivos de todos los tenants y solo la ejecuta el rol de la aplicación con el que corre el worker; `PUBLIC`, `anon` y `authenticated` no.
- [ ] `APP_ENV=production` con `ARC_ANTIVIRUS=eicar` (o sin definir) → el worker no arranca: «Variables de entorno inválidas: ARC_ANTIVIRUS: custom».
- [ ] `ARC_ANTIVIRUS=clamav` sin `CLAMAV_HOST` → el worker no arranca.
- [ ] Sin variables nuevas, el worker arranca en local con `eicar` y las pruebas actuales del 33 siguen en verde.
- [ ] Con `clamav` y clamd sin responder al arrancar → el worker arranca, escribe un `warn` y lo reporta; con clamd arriba escribe «Antivirus listo».
- [ ] El log `arc.antivirus.analisis` lleva motor, resultado, duración y bytes; ningún log contiene `nombre_original`, contenido del archivo ni la respuesta cruda de clamd (TR-RNF-026).
- [ ] `apps/api` no tiene variables ni conexiones a clamd.
- [ ] Migración `01m_arc_analisis` reversible, aplicada después de `01m_arc` y probada en CI contra PostgreSQL 16.
- [ ] El job `nx` del CI levanta `clamav/clamav` y las pruebas con `describeConClamav` corren (no se saltan).
- [ ] `docs/ops/staging.md` tiene la sección de ClamAV, la tabla de variables corregida y la evidencia de TR-CA-201 en staging.
- [ ] `docs/roadmap-specs.md`, fila 34: TR-RNF-114 cumplido; la habilitación en producción depende del servicio clamd de producción.
- [ ] El dominio no importa `node:net`, NestJS, TypeORM ni Supabase; el único SQL crudo nuevo está en `ArchivosAtascadosSql`.
- [ ] El código nuevo sigue la sección «Código limpio» de `CLAUDE.md`.
- [ ] `npx nx run-many -t lint test -p archivos worker api migrar` verde; `nx affected` verde en el CI del PR.

## Decisiones

- **Sí:** ClamAV como servicio `clamd` aparte, con la imagen oficial `clamav/clamav`; el worker envía los bytes por TCP (`INSTREAM`) dentro de la red privada. Decisión del usuario. Los archivos no salen de la infraestructura.
- **No:** API externa de escaneo. Decisión del usuario. Datos personales a un tercero y costo por archivo.
- **No:** ClamAV dentro de la imagen del worker. Decisión del usuario. Rompe la imagen distroless del spec 21 y carga las firmas en cada escaneo.
- **Sí:** `ARC_ANTIVIRUS=eicar|clamav`; local con `eicar`; el CI levanta `clamav/clamav` como servicio y prueba el adaptador real; staging y producción con clamd. Decisión del usuario.
- **No:** ClamAV en `docker-compose.yml`, ni probar solo con clamd doblado. Decisión del usuario.
- **Sí:** el worker no arranca en producción con `eicar`. Decisión del usuario. Producción es `APP_ENV=production`, no `NODE_ENV`: la imagen fija `NODE_ENV=production` también en staging. Mismo criterio que `exigirProveedorReal`.
- **Sí:** en staging `eicar` no bloquea el arranque. El valor por defecto es `eicar` y el merge llega antes de crear el servicio: bloquear dejaría caído el worker entero (relay del outbox incluido). Staging pasa a `clamav` por variable en el paso 6.
- **Sí:** tarea del worker que reencola los `EN_ANALISIS` de más de 15 minutos, con función `SECURITY DEFINER`. Decisión del usuario. Falla cerrado: nunca queda `DISPONIBLE` un archivo sin escanear.
- **No:** dejar el reintento solo en manos del cliente. Decisión del usuario.
- **Sí:** staging entra en este spec. Decisión del usuario.
- **Sí:** cliente TCP propio con `node:net`. El protocolo son un comando, trozos con longitud y una línea de respuesta; una librería npm agrega una dependencia que mantener para unas 80 líneas y no deja controlar los tiempos de espera ni la lista cerrada de respuestas.
- **Sí:** el contrato de `AnalizadorAntivirus` no cambia. `{ limpio, firma? }` y «si no responde, lanza» ya cubren a ClamAV. La salud va en un puerto aparte, `SaludAntivirus`, porque solo la usa el arranque.
- **Sí:** lista cerrada de respuestas: solo `stream: OK` es limpio y solo `FOUND` es infectado. Cualquier otra lanza.
- **Sí:** `TAMANO_EXCEDIDO` es un error que se reintenta, no un rechazo. Es un fallo de configuración de clamd, no del archivo: se corrige el límite y el barrido lo recupera.
- **Sí:** `AntivirusNoDisponibleError` en `domain/errores.ts`, junto a `AlmacenNoDisponibleError` y con su forma.
- **Sí:** una conexión por análisis. Con concurrencia 2 no hay nada que ganar con un pool, y una conexión rota no afecta al siguiente trabajo.
- **Sí:** `CLAMAV_TIMEOUT_MS` (respuesta) y `CLAMAV_CONEXION_TIMEOUT_MS` (conexión) separados. Un clamd caído se detecta en 5 s; un escaneo largo tiene 60 s. Tres intentos caben muy por debajo de los 15 minutos del barrido.
- **Sí:** `StreamMaxLength`, `MaxFileSize` y `MaxScanSize` en 30M. El bucket admite 25 MB; con un límite menor clamd rechaza el flujo o da por limpio un archivo que no analizó.
- **No:** `AlertExceedsMax`. Marcaría como infectado un ZIP que pase un límite interno de clamd, y no existe aún cómo liberar una cuarentena.
- **Sí:** el `PING` de arranque avisa y no detiene el worker. clamd tarda en cargar las firmas y Railway redespliega cada servicio por separado; el worker también corre el relay del outbox y las tareas programadas, que no dependen del antivirus. La garantía está por archivo: sin clamd el trabajo falla y el archivo sigue `EN_ANALISIS`.
- **Sí:** el barrido usa `actualizado_en`. Es la marca del paso a `EN_ANALISIS`; `creado_en` contaría el tiempo que el cliente tardó en subir.
- **Sí:** el barrido solo encola; no cambia el archivo ni abre transacción. El estado lo decide `AnalizarArchivo`, que ya es idempotente.
- **Sí:** un lote de 200 por corrida, cada 5 minutos, sin tope de reintentos. Reencolar no saca la fila de la lista, así que paginar devolvería el mismo lote. Un archivo que siempre falla se reintenta en cada corrida y cada fallo definitivo llega a `REPORTADOR_ERRORES`.
- **No:** estado nuevo (`ANALISIS_FALLIDO`) tras N barridos. Cambia el dominio, el CHECK y la API por un caso que se resuelve arreglando clamd o Storage.
- **Sí:** migración `db/01m_arc_analisis.sql`. Lleva la letra del esquema `arc` y el runner la aplica después de `01m_arc.sql`.
- **Sí:** SQL crudo solo en `ArchivosAtascadosSql` (regla 11: función de base de datos).
- **Sí:** la función se concede a `current_user`, como en `01m_arc.sql`. La API y el worker usan hoy el mismo rol de base: «solo el worker» significa «solo el rol de la aplicación». Separar roles es otro spec.
- **No:** análisis por flujo. El archivo ya está en memoria para el SHA-256 y `file-type`; el adaptador lo envía en vistas sin copiarlo, así que ClamAV no suma memoria: siguen siendo 50 MB con concurrencia 2. Hacerlo por flujo obliga a cambiar `AlmacenArchivos.leer`, el hash y el detector. Se reabre si una categoría supera los 25 MB.
- **Sí:** observabilidad por logs. `observabilidad` no expone un medidor genérico; crearlo es alcance de TR-OBS.
- **Sí:** las pruebas con clamd se saltan sin `CLAMAV_HOST`. En local no hay clamd; en el CI la variable está y un criterio exige que corran.
- **Sí:** la firma de las pruebas se compara con un patrón (`/EICAR/i`), no con un nombre exacto. El nombre cambia entre versiones de las firmas.
- **Sí:** `deploy-staging.yml` no cambia. El servicio `clamav` usa una imagen pública que no se construye en el repo.
- **Sí:** el servicio clamd de producción se documenta en `docs/ops/staging.md` y se crea en el pase a producción. Hoy no existe ambiente de producción.

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| clamd pide 3-4 GiB de RAM: es el servicio más caro de `vitrina-staging` en Railway (cobro por uso) | Se anota el costo real en `docs/ops/staging.md` al crearlo. Si no es asumible, staging vuelve a `eicar` con una variable y el servicio se apaga; producción no tiene esa salida. |
| Un archivo mayor que `MaxFileSize` o un contenedor que pasa un límite interno se da por limpio sin analizar | `MaxFileSize` y `MaxScanSize` en 30M, por encima del máximo del bucket. La prueba de 25 MB lo cubre en CI y staging. Los límites internos de ZIP quedan como riesgo aceptado. |
| El servicio de CI arranca con el `clamd.conf` de la imagen y no admite montar archivos | Paso que escribe los límites con `docker exec`, reinicia el contenedor y espera `PONG`. Si no resulta, la prueba de 25 MB queda solo en staging (primer recorte). |
| El CI tarda más: descarga de la imagen y carga de firmas en cada corrida | Tope de 5 min en la espera. Se mide en el PR; si pesa, el servicio pasa a un job aparte que corre solo las pruebas con clamd. |
| clamd tarda en arrancar y el worker empieza antes | El `PING` solo avisa; los trabajos fallan, reintentan y el barrido los recupera. |
| Detalles de la imagen y de Railway no verificados (variables, ruta de `clamd.conf`, DNS privado, IPv6) | Se confirman en la documentación en los pasos 2 y 6, antes de escribir lo que depende de ellos. |
| TCP a clamd sin cifrado ni autenticación | Solo red privada: sin dominio público en Railway y sin puerto publicado fuera del runner del CI. |
| Firmas desactualizadas si `freshclam` no puede descargar | Volumen de firmas y `freshclam` de la imagen activo en staging. La alerta por antigüedad de firmas queda para el pase a producción. |
| Un archivo que siempre falla se reencola cada 5 minutos | Tres intentos por ciclo y aviso a `REPORTADOR_ERRORES` en cada fallo definitivo; el `warn` del barrido muestra cuántos reencola. |
| Archivos ya `DISPONIBLE` en dev y staging que solo pasaron por EICAR | Son datos de prueba. No hay archivos en producción: ARC no estaba habilitado. |

## Lo que **no** entra en este spec

- Versiones y su análisis mientras el archivo sigue `DISPONIBLE`; el barrido de versiones (spec 35).
- `<ui-archivo-carga>` (spec 36).
- Despliegue de clamd en producción y habilitación de ARC en producción (plan de pase a producción).
- Reanálisis de archivos ya disponibles y liberación de cuarentenas.
- Análisis por flujo, ClamAV en local, métricas y alertas del antivirus.
- Roles de base separados para la API y el worker.

Cada uno, si llega, va en su propio spec.
