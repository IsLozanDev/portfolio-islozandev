# SPEC 52 — Facturación electrónica: envío de boleta y factura a SUNAT, CDR en ARC y estados finales

> **Status:** Implementado
> **Depends on:** SPEC 51, SPEC 51c, SPEC 33, SPEC 11
> **Date:** 2026-11-25
> **Objective:** Agregar a `libs/plataforma/comprobantes` el worker que toma cada comprobante en `PENDIENTE_ENVIO`, lo envía con el adaptador del emisor, guarda en TR-ARC el XML firmado y el CDR con su hash, deja el comprobante en `ACEPTADO`, `ACEPTADO_CON_OBSERVACIONES` o `RECHAZADO` y publica `cpe.aceptado` o `cpe.rechazado`.

## Por qué existe este spec

Fila 52 de `docs/roadmap-specs.md` (R2-05: TR-RF-059). Contexto: `docs/spec-context/tr-fe/fe-boleta-factura-cdr.md`, parte B. El 51 emite y numera; el 51b firma; el 51c envía a SUNAT y entiende la respuesta. Este spec une las tres piezas para que un comprobante real llegue a SUNAT y su resultado quede guardado.

Lo que hay en el código hoy (revisado al redactar):

- `comprobantes` (51): `Comprobante` en `PENDIENTE_ENVIO`, evento `cpe.emitido` por outbox y `documentoDesdeComprobante(comprobante, empresa, codigoEstablecimiento, tipoDocumentoAdquirente)`. El trigger `fe.proteger_comprobante` solo deja cambiar `estado`, `version` y `modificado_en`. Nada consume `cpe.emitido` todavía.
- `comprobantes` (50, 51c): `ResolutorPseMapa` con `SIMULADO`, `NUBEFACT` y `SUNAT`, armado por `adaptadoresPse` en `registerPruebas`. `RespuestaPse` trae `xmlFirmado`, `cdr` y `hash` (SUNAT). `RESULTADOS_PSE`: `ACEPTADO`, `ACEPTADO_CON_OBSERVACIONES`, `RECHAZADO`, `ERROR_TECNICO`, `EN_PROCESO`. El adaptador SUNAT devuelve `RECHAZADO` para los códigos de `CODIGOS_CREDENCIAL_INVALIDA`.
- `EjecutarPruebaEmisor` (50, 51c) ya resuelve la URL, el emisor del documento y las credenciales: token, y `.pfx` con su clave si el proveedor lo requiere. Patrón de cola: consumidor de evento → cola BullMQ `fe-pruebas` con `jobId` propio, 3 intentos con backoff y `ErrorTecnicoPseError` para reintentar.
- `PseSimulador`: acepta, o rechaza o da error técnico según el token. No devuelve `xmlFirmado` ni `cdr`.
- `mapeo-nubefact.ts` solo arma la boleta de prueba del 50.
- ARC (33, 34, 35): `ArchivoPort` solo carga por URL firmada desde el navegador, con análisis en el worker. `AlmacenArchivos` no tiene escritura desde el servidor. Categoría `CPE_XML` (`application/xml`, `application/zip`, 25 MB, no sensible). `arc.archivo.creado_por` y `arc.version_archivo.subido_por` son `NOT NULL`. Los specs 33 y 35 dejan la carga desde el servidor para este spec.
- Matriz de límites: `comp('fe', 'kernel', 'org', 'sec', 'cat', 'cfg', 'aud', 'seg', 'evt', 'seq')`, sin `arc`.
- Última letra de migración: `01v`. Este spec propone `01w` (ARC) y `01x` (FE); se reservan al abrir el worktree.

## Alcance

**Entra:**

- **Carga desde el servidor en ARC.** Puerto nuevo `ARCHIVO_SISTEMA_PORT` con `guardar(comando)`:
  - recibe los bytes, valida MIME y tamaño de la categoría y calcula el SHA-256;
  - sube el objeto al bucket con `AlmacenArchivos.subir` (método nuevo);
  - deja el archivo y su versión 1 en `DISPONIBLE` en la misma transacción, sin pasar por el antivirus, con `origen = 'SISTEMA'` y sin actor;
  - publica `archivo.disponible`, como al terminar un análisis.

  Lo exportan `ArchivosModule.register` y `registrarWorker`.
- **Disparo.** Un consumidor de `cpe.emitido` encola en la cola BullMQ `fe-envios` con `jobId = comprobanteId`. Los comprobantes con `modoEnvio = RESUMEN` los descarta el procesador (van en el resumen diario del 55).
- **Procesador `EnviarComprobante`** (en `apps/worker`, con el contexto del tenant del trabajo, fuera de la transacción mientras llama a SUNAT):
  1. Lee el comprobante. Si ya no está en `PENDIENTE_ENVIO`, termina sin enviar.
  2. Prepara el envío: emisor habilitado (`VERIFICADO` o `PRODUCCION`), proveedor con adaptador, datos del emisor, anexo SUNAT **de la sucursal del comprobante**, código SUNAT del tipo de documento del adquirente (`codigo_externo` del cat. 06) y credenciales de la bóveda.
  3. Envía con el adaptador del emisor y mide la duración.
  4. Registra el resultado según la tabla siguiente.
- **Resultado por respuesta:**

  | Respuesta | Comprobante | Intento en `fe.envio` | Reintento | Evento |
  | --- | --- | --- | --- | --- |
  | `ACEPTADO` | `ACEPTADO` | sí | no | `cpe.aceptado` |
  | `ACEPTADO_CON_OBSERVACIONES` | `ACEPTADO_CON_OBSERVACIONES`, con las observaciones | sí | no | `cpe.aceptado` con `observaciones` |
  | `RECHAZADO` | `RECHAZADO` con código y descripción | sí | no | `cpe.rechazado` |
  | `ERROR_TECNICO` | sigue `PENDIENTE_ENVIO` | sí | sí, hasta 3 intentos con backoff; luego queda para el 56 | no |
  | `CREDENCIAL_INVALIDA` (nuevo) | sigue `PENDIENTE_ENVIO` | sí | no | no; log de alerta `fe.envio.credencial_invalida` |
  | No se pudo preparar (emisor no habilitado, proveedor sin adaptador, datos del emisor incompletos) | sigue `PENDIENTE_ENVIO` | sí, `NO_ENVIADO` con el motivo | no | no; log de alerta |

- **Estado primero, archivo después.** Con una respuesta final se guardan en ARC el XML firmado (`application/xml`) y el CDR tal como lo devuelve SUNAT (`application/zip`), si vienen. Cada subida se reintenta en memoria hasta 3 veces. Si sigue fallando, se registran igual el estado y el evento con el `archivo_id` en `null` y un log de error `fe.envio.archivo_no_guardado`. Nunca se reenvía a SUNAT un comprobante ya respondido; el CDR que falte se recupera con `getStatusCdr` en el 56.
- **`CREDENCIAL_INVALIDA` en `RESULTADOS_PSE`.** El adaptador SUNAT lo devuelve para `CODIGOS_CREDENCIAL_INVALIDA`. La prueba del emisor (50) lo registra como `RECHAZADA`, igual que hoy.
- **`PseSimulador`.** Suma `TOKEN_SIMULAR_OBSERVACION` (→ `ACEPTADO_CON_OBSERVACIONES` con una observación) y `TOKEN_SIMULAR_CREDENCIAL` (→ `CREDENCIAL_INVALIDA`). Al aceptar devuelve un `xmlFirmado` y un `cdr` ficticios y pequeños, para cubrir el camino de ARC en CI.
- **Proveedor `NUBEFACT`.** Sin envío real en este spec: el comprobante queda `PENDIENTE_ENVIO` con el intento `NO_ENVIADO` (`SIN_ADAPTADOR`).
- **Persistencia de la respuesta en `fe.comprobante`:**
  - `hash`, `xml_archivo_id`, `cdr_archivo_id`, `codigo_respuesta`, `descripcion_respuesta`, `observaciones` y `respondido_en`;
  - el trigger las suma a las columnas mutables y, desde un estado final, rechaza cualquier cambio (TR-RN-022 en la base).
- **Tabla `fe.envio`** (`EnvioPse` de T-06), de solo inserción, con un registro por intento.
- **Transiciones en el dominio.** `Comprobante.registrarRespuesta` solo parte de `PENDIENTE_ENVIO`. Se actualiza con bloqueo optimista por `version`.
- **Eventos `cpe.aceptado` y `cpe.rechazado`** con esquema registrado en `registrarEsquemasFe` y sin datos del adquirente.
- **`GET /v1/fe/comprobantes/{id}`** suma los datos de respuesta: estado, código, descripción, observaciones, hash, ids de archivo y `respondidoEn`.
- **Migraciones con inverso y prueba SQL:** `db/01w_arc_carga_sistema.sql` y `db/01x_fe_envio.sql`.
- **Humo de punta a punta contra la beta real de SUNAT**, con la API y el worker locales y una empresa de dev.

**No entra (specs futuros):**

- Reintentos de TR-RF-060 (1, 5, 15, 60 min y luego cada hora), circuito por emisor, contingencia y `getStatusCdr`, incluidos el `1033` y el CDR que falte (spec 56). Aquí solo los 3 intentos de BullMQ.
- Reenvío de los que quedaron en `PENDIENTE_ENVIO` por credencial, configuración o intentos agotados (spec 56).
- Estado `ENVIADO`, respuesta asíncrona `EN_PROCESO` y mapeo completo de Nubefact. Van en su propio spec si Nubefact vuelve a usarse.
- Resumen diario de boletas en modo `RESUMEN` y baja (spec 55). Notas (spec 54).
- PDF y QR con el hash (spec 53), entrega al adquirente (spec 59), monitor, conciliación diaria emitidos vs. CDR y alertas al administrador (specs 57 y 58).
- Descarga del XML y del CDR por URL firmada desde la API y su autorizador de entidad (specs 53 y 57).
- Antivirus sobre archivos generados por la plataforma o devueltos por SUNAT.

## Base de código reutilizada

| Pieza | Qué se hace |
| --- | --- |
| `documentoDesdeComprobante` (51) | Arma el documento; se le pasa el anexo de la sucursal del comprobante. |
| `adaptadoresPse`, `ResolutorPseMapa`, `PseSunat` (50, 51c) | El mismo resolutor para pruebas y envíos. `PseSunat` devuelve `CREDENCIAL_INVALIDA`. |
| `EjecutarPruebaEmisor` (50, 51c) | Su lectura de credenciales y certificado se extrae a `application/credenciales-emisor.ts` y la usan los dos procesadores, sin duplicarla. |
| `cola-pruebas.ts`, `PruebasFeConsumidor`, `ErrorTecnicoPseError` (50) | Mismo patrón para `fe-envios`: `jobId` propio, 3 intentos y backoff exponencial desde 5 s. |
| `ArchivosModule`, `AlmacenArchivos`, `CategoriaArchivo` (33, 35) | Suman la carga desde el servidor; el flujo del navegador no cambia. |
| `EventosModule.registrarWorker`, `@SuscribirEvento` (11) | Consumidor de `cpe.emitido`, idempotente por `event_id` y por `jobId`. |
| `catalogos` (`CATALOGO_PORT`) | `codigo_externo` del tipo de documento del adquirente. |
| `org` (`ConsultarSucursal`) | `codigoEstablecimientoSunat` de la sucursal del comprobante. |

## Modelo de datos

### Migración `db/01w_arc_carga_sistema.sql` (+ `db/rollback/…`, `db/tests/…`)

```sql
ALTER TABLE arc.archivo
  ADD COLUMN origen varchar(8) NOT NULL DEFAULT 'CARGA' CHECK (origen IN ('CARGA','SISTEMA')),
  ALTER COLUMN creado_por DROP NOT NULL,
  ADD CONSTRAINT ck_archivo_actor CHECK (origen = 'SISTEMA' OR creado_por IS NOT NULL);
ALTER TABLE arc.version_archivo
  ALTER COLUMN subido_por DROP NOT NULL;
```

- `subido_por` de `version_archivo` sin actor solo si el archivo es `SISTEMA`: lo hace cumplir el caso de uso, y la prueba SQL lo comprueba con una consulta de control.
- Inverso: vuelve a `NOT NULL` y quita `origen`. Se niega si hay archivos `SISTEMA`.
- Prueba SQL: un archivo `CARGA` sin `creado_por` falla y uno `SISTEMA` sin actor pasa.

### Migración `db/01x_fe_envio.sql` (+ `db/rollback/…`, `db/tests/…`)

```sql
ALTER TABLE fe.comprobante
  ADD COLUMN hash                  varchar(100),
  ADD COLUMN xml_archivo_id        uuid,
  ADD COLUMN cdr_archivo_id        uuid,
  ADD COLUMN codigo_respuesta      varchar(10),
  ADD COLUMN descripcion_respuesta varchar(500),
  ADD COLUMN observaciones         jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(observaciones) = 'array'),
  ADD COLUMN respondido_en         timestamptz;

CREATE TABLE fe.envio (
  id              uuid PRIMARY KEY,
  tenant_id       uuid NOT NULL,
  comprobante_id  uuid NOT NULL REFERENCES fe.comprobante(id),
  intento         smallint NOT NULL CHECK (intento >= 1),
  proveedor       varchar(20) NOT NULL,
  resultado       varchar(26) NOT NULL CHECK (resultado IN
                    ('ACEPTADO','ACEPTADO_CON_OBSERVACIONES','RECHAZADO','ERROR_TECNICO','CREDENCIAL_INVALIDA','NO_ENVIADO')),
  codigo          varchar(20),
  descripcion     varchar(500),
  enviado_en      timestamptz NOT NULL,
  duracion_ms     integer CHECK (duracion_ms >= 0),
  UNIQUE (comprobante_id, intento)
);
```

- `fe.proteger_comprobante`:
  - columnas mutables: `estado`, `version`, `modificado_en`, `hash`, `xml_archivo_id`, `cdr_archivo_id`, `codigo_respuesta`, `descripcion_respuesta`, `observaciones` y `respondido_en`;
  - si `OLD.estado` es `ACEPTADO`, `ACEPTADO_CON_OBSERVACIONES` o `RECHAZADO`, rechaza todo `UPDATE`. La baja (55) ajusta el trigger para `ANULADO`.
- `fe.envio`: solo inserción. El trigger rechaza `UPDATE` y `DELETE`. RLS `ENABLE + FORCE` por `app.tenant_id` y `REVOKE` a `anon, authenticated`, como `01u`.
- `intento` cuenta todos los intentos del comprobante, de este spec y de los reintentos futuros del 56, no los de un trabajo.
- Inverso: borra `fe.envio`, quita las columnas y restaura el trigger de `01u`. Se niega si hay comprobantes con respuesta.
- Prueba SQL:
  - pasar de `PENDIENTE_ENVIO` a `ACEPTADO` con sus columnas pasa;
  - cambiar el estado, o cualquier columna, de un `ACEPTADO` o un `RECHAZADO` falla;
  - cambiar `total` sigue fallando;
  - `UPDATE` o `DELETE` en `fe.envio` fallan;
  - aislamiento con dos `app.tenant_id`.

### ARC (`libs/plataforma/archivos`)

```ts
// application/ports/archivo-sistema.port.ts — exportado en index.ts
export const ARCHIVO_SISTEMA_PORT = Symbol('ArchivoSistemaPort');
export interface GuardarArchivoComando {
  categoria: string;
  nombreOriginal: string;
  mime: string;
  bytes: Uint8Array;
  entidadTipo: string;   // FE usa 'FE_COMPROBANTE'
  entidadId: string;
}
export interface ArchivoGuardado { archivoId: string; hashSha256: string; bytes: number; }
/** Bytes generados por la plataforma o devueltos por un tercero de confianza: sin antivirus ni actor. Tenant del contexto. */
export interface ArchivoSistemaPort { guardar(comando: GuardarArchivoComando): Promise<ArchivoGuardado>; }

// application/ports/almacen-archivos.ts suma
/** No reemplaza un objeto que ya existe. */
subir(ruta: string, bytes: Uint8Array, mime: string): Promise<void>;
```

- Caso de uso `GuardarArchivoSistema`:
  1. Valida la categoría, el MIME y el tamaño con los errores que ya existen.
  2. Calcula el SHA-256 y sube con la ruta de siempre.
  3. En una transacción, inserta el archivo y la versión 1 en `DISPONIBLE`, con `origen = SISTEMA` y `mime_real = mime`, y publica `archivo.disponible`.

  Si la transacción falla, borra el objeto subido.
- El agregado `Archivo` suma la fábrica `Archivo.delSistema(...)`. No pasa por `EN_ANALISIS`.
- Adaptador Supabase de `AlmacenArchivos.subir` con `upload(ruta, bytes, { contentType, upsert: false })`. La firma exacta se confirma con la documentación vigente de `supabase-js` al implementar.

### Dominio de FE (`libs/plataforma/comprobantes/src/domain/`)

- `respuesta-pse.ts`: `RESULTADOS_PSE` suma `CREDENCIAL_INVALIDA`.
- `comprobante/comprobante.ts`: `registrarRespuesta(respuesta: RespuestaFinal, archivos: { xmlArchivoId, cdrArchivoId }, ahora)`:
  - solo desde `PENDIENTE_ENVIO`; si no, `TransicionComprobanteInvalidaError` (interno, no HTTP);
  - `RespuestaFinal` es `ACEPTADO`, `ACEPTADO_CON_OBSERVACIONES` o `RECHAZADO`, con código, descripción, observaciones y hash;
  - levanta `cpe.aceptado` o `cpe.rechazado`.
- `comprobante/tipo-comprobante.ts`: `ESTADOS_FINALES` y `esEstadoFinal(estado)`.
- `envio/intento-envio.ts`: `IntentoEnvio { comprobanteId, intento, proveedor, resultado, codigo, descripcion, enviadoEn, duracionMs }` y `RESULTADOS_ENVIO`, que son `RESULTADOS_PSE` sin `EN_PROCESO` más `NO_ENVIADO`.
- `envio/motivos-no-envio.ts`: `EMISOR_NO_HABILITADO`, `SIN_ADAPTADOR`, `DATOS_INCOMPLETOS` y `URL_NO_PERMITIDA`, que caben en `fe.envio.codigo`.
- `eventos-fe.ts` suma:

  ```ts
  aceptado: 'cpe.aceptado'   // { comprobante_id, tipo, serie, numero, total, moneda, estado, codigo_respuesta,
                             //   observaciones: string[], xml_archivo_id, cdr_archivo_id, origen_producto, origen_id }
  rechazado: 'cpe.rechazado' // { comprobante_id, tipo, serie, numero, total, moneda, estado: 'RECHAZADO', codigo_respuesta,
                             //   descripcion_respuesta, xml_archivo_id, origen_producto, origen_id }
  ```

  Sin datos del adquirente.

### Aplicación (`libs/plataforma/comprobantes/src/application/`)

- `credenciales-emisor.ts`: `credencialesDelEmisor(emisor, proveedor, url, boveda)`, extraído de `EjecutarPruebaEmisor`.
- `ports/cola-envios-fe.ts`: `TrabajoEnvioFe { tenantId, comprobanteId }` y `ColaEnviosFe.encolar`.
- `ports/repositorio-envios.ts`: `RepositorioEnvios.siguienteIntento(comprobanteId)` y `registrar(intento)`.
- `ports/archivos-cpe.ts`: `ArchivosCpe.guardarXml(comprobante, bytes)` y `guardarCdr(comprobante, bytes)` → `archivoId | null`, con los 3 intentos en memoria. Implementado sobre `ARCHIVO_SISTEMA_PORT`, con nombres `RUC-TT-SERIE-NUMERO.xml` y `R-RUC-TT-SERIE-NUMERO.zip`.
- `encolar-envio-comprobante.ts`: encola cada `cpe.emitido`; el procesador descarta `RESUMEN`.
- `enviar-comprobante.ts` (`EnviarComprobante.ejecutar(trabajo, intento)`):
  1. Transacción de lectura: comprobante, emisor, proveedor, empresa, sucursal y código del adquirente. Termina si el comprobante ya no está `PENDIENTE_ENVIO`. Si algo impide enviar, registra el intento `NO_ENVIADO` con el motivo y termina.
  2. Envía fuera de la transacción.
  3. `ERROR_TECNICO`: registra el intento y, si no es el último, lanza `ErrorTecnicoPseError`. `CREDENCIAL_INVALIDA`: registra el intento, deja el log de alerta y termina.
  4. Respuesta final: guarda el XML y el CDR, y en una transacción relee con `version`, registra la respuesta, actualiza, inserta el intento y publica el evento.

  Si la versión cambió y el comprobante ya está en un estado final, termina sin error (otro trabajo ganó).
- El log lleva comprobante, emisor, serie-número, intento, resultado, código y duración. Nunca lleva el documento, el XML, el CDR, las credenciales ni datos del adquirente.

### Infraestructura e interfaz

- `infrastructure/bullmq/cola-envios.ts`:
  - `NOMBRE_COLA_ENVIOS_FE = 'fe-envios'` e `INTENTOS_ENVIO_FE = 3`;
  - backoff exponencial desde 5 s;
  - `jobId = comprobanteId`;
  - `removeOnComplete` y `removeOnFail`.
- `infrastructure/typeorm/`: entidad `EnvioEntidad`, columnas nuevas en la entidad del comprobante y su mapeo, `RepositorioEnviosTypeOrm`. `siguienteIntento` usa `MAX(intento) + 1` con `QueryBuilder`.
- `infrastructure/arc/archivos-cpe.arc.ts`: el adaptador de `ArchivosCpe`.
- `interface/envios-fe.consumidor.ts`: `@SuscribirEvento(EVENTOS_FE.comprobanteEmitido, { consumidor: 'fe-envios-encolado' })`.
- `interface/comprobantes.dto.ts` y `vista-comprobante.ts`: los campos de respuesta en el `GET`, con OpenAPI.
- `pse/sunat/pse.sunat.ts`: mapea `CODIGOS_CREDENCIAL_INVALIDA` a `CREDENCIAL_INVALIDA`.
- `pse/simulador/pse.simulador.ts`: los tokens nuevos y los bytes ficticios.
- `application/ejecutar-prueba-emisor.ts`: `CREDENCIAL_INVALIDA` se registra como `RECHAZADA`.

### Composición

- `ComprobantesModule.registerEnvios({ redisUrl, entorno, imports })`, aparte de `registerPruebas`:
  - abre la cola `fe-envios` y la cierra con la app;
  - provee el consumidor y `EnviarComprobante`, con el mismo `adaptadoresPse`;
  - `imports` debe exportar `ConsultarEmpresa`, `ConsultarSucursal`, `CATALOGO_PORT`, `BOVEDA_SECRETOS` y `ARCHIVO_SISTEMA_PORT`.
- `apps/worker/src/envios-fe/envios-fe.module.ts`, como `pruebas-fe.module.ts`, con el `Worker` de BullMQ que llama a `EnviarComprobante`.
- `ArchivosModule.register` y `registrarWorker` exportan `ARCHIVO_SISTEMA_PORT`.
- `eslint.config.mjs`: `comp('fe', …, 'arc')` con su comentario; `tools/boundaries-test` lo comprueba.
- `registrarEsquemasFe`: esquemas de `cpe.aceptado` y `cpe.rechazado`.
- Manifiesto sin cambios. El worker no expone endpoint; `plat.sistema.job` sigue siendo solo documental.
- `docs/ops/supabase-ambientes.md`, sección FE: la cola `fe-envios` y que los comprobantes de un emisor `VERIFICADO` van a la beta y no tienen validez tributaria.

## Plan de implementación

1. **ARC desde el servidor.** Migración `01w` con inverso y prueba SQL; `AlmacenArchivos.subir` (confirmar la API de `supabase-js` con ctx7); `Archivo.delSistema`, `GuardarArchivoSistema`, `ARCHIVO_SISTEMA_PORT` y exportes. Pruebas:
   - MIME fuera de la categoría → error y no se sube nada;
   - el hash coincide con los bytes;
   - una transacción fallida borra el objeto;
   - el archivo nace `DISPONIBLE` con `archivo.disponible`;
   - aislamiento.
2. **Migración FE.** `01x_fe_envio.sql` con el trigger nuevo, `fe.envio`, RLS, inverso y prueba SQL.
3. **Dominio.** `CREDENCIAL_INVALIDA`, `registrarRespuesta`, estados finales, `IntentoEnvio`, motivos y eventos. Pruebas de las transiciones: final desde final falla y cada resultado da su estado y evento. Cambio en `PseSunat` y en `EjecutarPruebaEmisor` con sus pruebas, y tokens nuevos del simulador.
4. **Procesador.** `credenciales-emisor` extraído (las pruebas del 50 siguen verdes), `EncolarEnvioComprobante`, `EnviarComprobante`, repositorio de envíos, `ArchivosCpe`, cola y consumidor. Integración con el simulador:
   - TR-CA-150, 151 y 152;
   - error técnico con reintento y agotado;
   - credencial inválida;
   - Nubefact `NO_ENVIADO`;
   - boleta `RESUMEN` no encolada;
   - evento reentregado sin otro envío;
   - ARC caído → estado final con `archivo_id` en `null`;
   - aislamiento.
5. **HTTP y composición.** Campos de respuesta en el `GET` y OpenAPI; `registerEnvios`; módulo de `apps/worker`; matriz con `arc`; esquemas.
6. **Humo en la beta real.**
   - Antes de crear datos en dev se pide autorización al usuario. Los comprobantes, seg, org y personas no admiten borrado.
   - Con el emisor `SUNAT`/`MODDATOS` del humo del 51c, la API y el worker locales: una factura y una boleta por `POST /v1/fe/comprobantes`.
   - Se comprueba que quedan `ACEPTADO` con `cdr_archivo_id` y `xml_archivo_id`, que los archivos existen en Storage con su hash, que se publica `cpe.aceptado` y que hay una fila en `fe.envio`.
   - Si la beta está caída ese día, se dice así en el cierre.
7. **Cierre.** `code-simplifier` sobre los archivos tocados; `pnpm db:up:remoto` en Supabase dev; `npx nx run-many -t lint test -p comprobantes archivos api worker migrar boundaries-test`.

## Criterios de aceptación

- [ ] TR-CA-150: B002-00000125 con respuesta `0` → `ACEPTADO`, CDR guardado en ARC (`cdr_archivo_id` con su hash) y `cpe.aceptado` publicado una vez.
- [ ] TR-CA-151: rechazo de SUNAT (por ejemplo, unidad inexistente) → `RECHAZADO` con `codigo_respuesta` y `descripcion_respuesta`, y `cpe.rechazado` publicado.
- [ ] TR-CA-152: observación no bloqueante → `ACEPTADO_CON_OBSERVACIONES`, con la observación en `observaciones`, en el `GET` y en `cpe.aceptado`.
- [ ] `ERROR_TECNICO`: se reintenta hasta 3 veces con backoff; agotados los intentos, el comprobante sigue `PENDIENTE_ENVIO` con un intento `ERROR_TECNICO` por cada vez en `fe.envio`, y no se pierde (TR-RNF-104).
- [ ] `CREDENCIAL_INVALIDA`: el comprobante sigue `PENDIENTE_ENVIO`, sin reintento ni evento, con log de alerta y un intento registrado. La prueba del emisor la sigue viendo como `RECHAZADA`.
- [ ] Emisor no habilitado, proveedor `NUBEFACT` o datos del emisor incompletos: intento `NO_ENVIADO` con el motivo, comprobante en `PENDIENTE_ENVIO` y sin llamar al PSE.
- [ ] Una boleta con `modoEnvio = RESUMEN` no se envía ni registra intentos.
- [ ] El documento enviado lleva el anexo SUNAT de la sucursal del comprobante y el código SUNAT del tipo de documento del adquirente.
- [ ] El mismo `cpe.emitido` entregado dos veces no envía dos veces ni duplica eventos: `jobId`, estado y `version`.
- [ ] Falla de ARC después de la respuesta: el estado final y el evento se registran con el `archivo_id` en `null` y el log `fe.envio.archivo_no_guardado`; no se reenvía a SUNAT.
- [ ] TR-RN-022: un comprobante `ACEPTADO` o `RECHAZADO` no cambia ni de estado ni de columna, en la base (prueba SQL) y en el dominio. `fe.envio` no admite `UPDATE` ni `DELETE`.
- [ ] `ARCHIVO_SISTEMA_PORT.guardar` deja el archivo `DISPONIBLE` con `origen = SISTEMA`, hash SHA-256 correcto y `archivo.disponible`, sin antivirus. Un MIME fuera de `CPE_XML` falla sin subir nada. Un archivo `CARGA` sigue exigiendo actor.
- [ ] `cpe.aceptado` y `cpe.rechazado` tienen esquema registrado y no llevan datos del adquirente.
- [ ] `GET /v1/fe/comprobantes/{id}` devuelve estado, código, descripción, observaciones, hash e ids de archivo, documentados en OpenAPI.
- [ ] TR-RNF-026: ningún log, error ni evento contiene el XML, el CDR, credenciales ni datos del adquirente.
- [ ] Aislamiento (TR-RNF-010): el worker procesa con el tenant del trabajo; prueba SQL con dos `app.tenant_id` en `fe.envio` y en `arc.archivo`.
- [ ] Humo: una factura y una boleta emitidas por la API local quedan `ACEPTADO` en la beta real de SUNAT, con XML y CDR en Storage de dev.
- [ ] Migraciones `01w_arc_carga_sistema` y `01x_fe_envio` reversibles y probadas en CI contra PostgreSQL 16.
- [ ] Cobertura de dominio de `comprobantes` y `archivos` ≥ 70 %.
- [ ] El código nuevo sigue la sección «Código limpio» de `CLAUDE.md`; persistencia con TypeORM, sin SQL crudo nuevo (solo triggers en las migraciones).
- [ ] `npx nx run-many -t lint test -p comprobantes archivos api worker migrar boundaries-test` verde; `nx affected` verde en el CI del PR.

## Decisiones

- **Sí:** solo SUNAT directo y el simulador envían comprobantes reales. Decisión del usuario. SUNAT directo es el principal desde el 2026-11-25. El mapeo completo de Nubefact, `EN_PROCESO` y `ENVIADO` quedan para un spec propio si Nubefact se usa.
- **Sí:** 3 intentos con backoff ante `ERROR_TECNICO`, como `fe-pruebas`. Decisión del usuario. Una caída breve de SUNAT no deja comprobantes parados hasta el 56, que trae la política completa de TR-RF-060.
- **Sí:** `CREDENCIAL_INVALIDA` como resultado propio de `RespuestaPse`, y el comprobante sigue `PENDIENTE_ENVIO`. Decisión del usuario. No es culpa del comprobante, SUNAT no lo procesó y un estado final por configuración publicaría un `cpe.rechazado` falso. El detalle de los códigos de SUNAT queda en el adaptador.
- **Sí:** también es `CREDENCIAL_INVALIDA` (con su código) lo que el adaptador SUNAT corta sin llamar: `URL_NO_PERMITIDA`, `SIN_USUARIO_SOL`, `SIN_CERTIFICADO` y `FIRMA_FALLIDA`. Decisión del usuario (2026-11-25, durante la implementación). Antes eran `RECHAZADO`: en el envío real dejarían un comprobante en estado final y un `cpe.rechazado` por un problema de configuración. La prueba del emisor los sigue registrando como `RECHAZADA` (`estadoPruebaDe` en `domain/emisor.ts`).
- **Sí:** los esquemas de `cpe.aceptado` y `cpe.rechazado` van en el paso 3, junto con los eventos: la prueba de esquemas exige uno por cada evento de `EVENTOS_FE`.
- **Sí:** estado primero, archivo después. Decisión del usuario. Reenviar a SUNAT un comprobante ya respondido da `1033`. El estado es la verdad tributaria (TR-RNF-104: 0 perdidos) y el CDR que falte se recupera con `getStatusCdr` (56).
- **No:** estado `ENVIADO` antes de llamar a `sendBill`. Decisión del usuario. `sendBill` es síncrono. Una caída entre el `POST` y la transacción es rara, y su `1033` lo resuelve el 56.
- **Sí:** `ARCHIVO_SISTEMA_PORT.guardar` sin antivirus, con `origen = SISTEMA` y sin actor. Decisión del usuario. Los bytes los genera la plataforma o los devuelve SUNAT; esperar al antivirus haría depender el estado tributario de ClamAV. Es un puerto aparte de `ArchivoPort` (los specs 33 y 35 decían `ArchivoPort.guardar`): el worker no necesita la carga por URL firmada ni los autorizadores de entidad que compone `apps/api`.
- **Sí:** `creado_por` nulo solo para `origen = SISTEMA`, sin un uuid de sistema inventado. La auditoría distingue la carga de una persona de la del sistema.
- **Sí:** el CDR se guarda como ZIP, tal como lo devuelve SUNAT. Es la constancia original; leerlo es tarea del 53 y el 57.
- **Sí:** humo de punta a punta en la beta real. Decisión del usuario. Se pide autorización antes de crear datos en dev.
- **Sí:** en el humo, la factura y la boleta se emiten con `ComprobantePort.emitir` desde un script temporal contra dev, no por `POST`. Decisión del usuario (2026-11-25). El tenant `humo-51c` no tiene usuarios con acceso y crearlos deja datos en `seg` sin borrado; el `POST` lo cubren las pruebas del 51. El envío sí es el real: `cpe.emitido` → `fe-envios` → worker local → beta de SUNAT → ARC.
- **Sí:** el anexo SUNAT es el de la sucursal del comprobante, no el de la principal. La prueba del emisor usa la principal; un comprobante real sale del establecimiento que vende.
- **Sí:** `observaciones` como `jsonb` en `fe.comprobante`, no la tabla `fe.comprobante_observacion` del contexto. Se leen siempre con el comprobante y no se consultan solas; sigue el patrón de `advertencias`.
- **Sí:** `fe.envio` cuenta los intentos por comprobante, no por trabajo. El 56 sigue la misma numeración.
- **Sí:** `registerEnvios` aparte de `registerPruebas`, y el mismo `adaptadoresPse`. Cada cola abre su conexión solo donde se usa; los adaptadores y el breaker no se duplican en el código.
- **No:** enviar las boletas `RESUMEN` aquí. Van en el resumen diario del 55.
- **Sí:** el procesador descarta las boletas `RESUMEN`, no el consumidor. `cpe.emitido` no trae el modo de envío y sumarlo cambiaría un esquema que ya consumen otros; el procesador ya lee el comprobante.
- **Sí:** `CATALOGO_PORT.validarItem` suma `codigoExterno` (cambio aditivo en `catalogos`). Decisión del usuario (2026-11-25, durante la implementación). FE lee de ahí el código SUNAT del tipo de documento del adquirente; la alternativa era un mapa fijo en FE que duplicaba el catálogo.
- **Sí:** la matriz de límites (`comp('fe', …, 'arc')`) y `boundaries-test` van en el paso 4, junto con el primer import de `archivos` desde `comprobantes`: sin ellos el lint del paso falla.
- **No:** permiso nuevo. El worker no tiene endpoint y el `GET` sigue con `plat.fe.emitir`.

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| Estimado de 6-7 h en el roadmap; con la carga de ARC desde el servidor, 8-10 h | Corte natural: el humo en la beta pasa a un 52b y el `GET` ampliado al 57. ARC y el procesador no se recortan. |
| El worker cae entre el `POST` a SUNAT y la transacción: el reintento da `1033` | Queda `ERROR_TECNICO` y `PENDIENTE_ENVIO` sin perderse; anotado para el 56 (`getStatusCdr`). |
| ARC falla después de la respuesta y el comprobante queda sin CDR | Se registra igual el estado, con log de error; el 56 recupera el CDR y la conciliación del 57 lo detecta. |
| Comprobantes de un emisor `VERIFICADO` van a la beta y no tienen validez tributaria | Se documenta en `supabase-ambientes.md`. El paso a `PRODUCCION` (50) es explícito y exige certificado vigente. |
| Muchos comprobantes del mismo emisor en paralelo abren el breaker | Breaker por instancia del adaptador, como el 51c; el circuito por emisor llega en el 56. |
| Firma de `upload` de `supabase-js` distinta de lo asumido | Se confirma con ctx7 al implementar; está encapsulada en el adaptador de `AlmacenArchivos`. |
| Letras de migración repetidas con specs en paralelo | Se reservan al abrir el worktree; `01w` y `01x` son la propuesta. |

## Lo que **no** entra en este spec

- Reintentos de TR-RF-060, contingencia, `getStatusCdr` y reenvío de pendientes (spec 56).
- Envío por Nubefact, `ENVIADO` y `EN_PROCESO` (spec propio, si llega).
- Resumen diario y baja (spec 55); notas (spec 54).
- PDF y QR (spec 53); entrega (spec 59); monitor, conciliación y alertas (specs 57 y 58).
- Descarga del XML y del CDR desde la API.
- Antivirus para archivos del sistema.

Cada uno, si llega, va en su propio spec.
