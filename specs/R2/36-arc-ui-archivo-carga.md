# SPEC 36 — Archivos: componentes de carga y versiones con arrastrar y soltar, progreso y resultado del análisis por SSE

> **Status:** Aprobado
> **Depends on:** SPEC 33, SPEC 35, SPEC 13, SPEC 15, SPEC 15b, SPEC 15c, SPEC 15d, SPEC 19b
> **Date:** 2026-11-20
> **Objective:** Crear `libs/plataforma/archivos-ui` con `vit-archivo-carga` (un archivo por arrastrar y soltar o elegir, validado contra su categoría, subido directo a Storage con barra de progreso y con el resultado del análisis empujado por SSE) y `vit-archivo-versiones` (lista, subir versión, marcar vigente y descargar), más las dos piezas de back que necesitan: la lista de categorías y el SSE del análisis.

## Por qué existe este spec

Fila 36 de `docs/roadmap-specs.md` (componente `<ui-archivo-carga>` de la hoja Componentes del SRS, sin RF ni historia). Contexto: `docs/spec-context/tr-arc/arc-subida-versiones-url-firmada.md`, partición D. Es la UI de TR-RF-080, 081 y 082, ya implementados en el back por los specs 33, 34 y 35.

El roadmap da 7 h. El usuario pidió el resultado del análisis empujado por el servidor (SSE, el estándar del spec 19b) en vez de sondeo, y la validación de MIME y tamaño antes de subir. Eso suma una ruta de categorías, un canal Redis del worker a la API, dos rutas SSE y mover el cliente SSE del front a `shared/auth`. Estimado: 10 h. Si se pasa, se recorta `vit-archivo-versiones` a lista y descarga, y «Subir versión» y «Marcar vigente» pasan a un 36b.

Todavía no hay pantalla de producto que suba archivos (la ficha de persona es el spec 38). Los componentes se montan en una página de prueba solo de desarrollo para verificarlos en el navegador.

Lo que hay en el código hoy (revisado al redactar):

- `libs/plataforma/archivos` (specs 33, 34 y 35): rutas `POST /v1/archivos/cargas`, `POST /{id}/confirmar`, `POST /{id}/versiones`, `POST /{id}/versiones/{numero}/confirmar`, `GET /{id}/versiones`, `PATCH /{id}/version-vigente`, `GET /{id}`, `GET /{id}/descarga`. `CargaFirmadaDto` (`url`, `token`, `expira_en`): «se sube con PUT y el Content-Type declarado; no reemplaza un objeto ya subido». `EstadoArchivoDto` con `estado`, `version_vigente`, `version_en_curso`, `rechazo_version`. `RepositorioArchivos.buscarCategoria`. No hay ruta de categorías.
- `AnalizarArchivo` (worker) guarda el resultado y publica `archivo.disponible`, `archivo.en_cuarentena` o `archivo.version_creada` por outbox; no avisa a la API.
- Spec 19b: `CanalAvanceRedis` (`publicar` con `SET ... EX` + `PUBLISH`, `ultimo`, `suscribir` con conexión duplicada) en `libs/plataforma/catalogos/src/infrastructure/redis/`; `AvisosEnEspera` en `catalogos/src/infrastructure/`; `transmitirAvisos` (SSE a mano, `: ping` cada 15 s, `X-Accel-Buffering: no`, cierre a los 15 min) en `catalogos/src/interface/importaciones.http.ts`.
- Front del 19d: `EventosImportacionCliente` (`fetch` con Bearer y `X-Sucursal-Id`, `CorteDeStream`, `StreamRechazado`) y `lectorEventos` en `libs/plataforma/consola-catalogos/src/lib/`. `ARC` (`comp:arc`) no puede importar `catalogos` y un front de plataforma no debería importar `consola-catalogos`.
- `libs/shared/auth` (`type:data-access`): `SesionService` (`token()`, `sucursalId()`, `usuarioId`), `CONFIG_AUTH.apiUrl`, `SiPermisoDirective`.
- `libs/shared/ui`: `vit-tabla`, `vit-chip-estado` con `TonoEstado`, `vit-estado-vacio`, `vit-cargando`, `AvisosService`, `PanelLateralService`, clase `vit-destructivo`.
- `apps/plataforma-admin/src/app/app.routes.ts`: `RUTAS_DE_DESARROLLO` (`dev/componentes`), solo fuera de `environment.production`.
- `libs/plataforma/admin-cliente/src/lib/utils/descarga.ts`: descarga de blobs (no sirve aquí: la descarga de ARC es una URL firmada).

## Alcance

**Entra:**

- Back (`libs/plataforma/archivos`):
  - `GET /v1/archivos/categorias` con `plat.archivo.subir`: código, MIME permitidos y tamaño máximo de las cinco categorías.
  - Canal `CanalAnalisis` (Redis pub/sub + último resultado con TTL) que el worker publica al terminar cada análisis.
  - Dos rutas SSE: `GET /v1/archivos/{id}/eventos` (`plat.archivo.subir`) y `GET /v1/archivos/{id}/versiones/{numero}/eventos` (`plat.archivo.versionar`), solo para quien subió esa carga.
- Back compartido: `AvisosEnEspera` y el emisor SSE (`transmitirAvisos`) pasan de `catalogos` a `kernel-infra`; CAT los usa desde ahí.
- Front compartido: lector de `text/event-stream`, cliente SSE con `fetch` y Bearer, `CorteDeStream` y `StreamRechazado` pasan de `consola-catalogos` a `libs/shared/auth`; `consola-catalogos` los usa desde ahí.
- Lib nueva `libs/plataforma/archivos-ui` (`scope:plataforma`, `type:feature`):
  - `vit-archivo-carga`: un archivo por instancia; arrastrar y soltar o elegir; validación de MIME y tamaño con las categorías; PUT directo a la URL firmada con progreso; cancelar; confirmar; resultado del análisis por SSE; modo carga nueva y modo versión.
  - `vit-archivo-versiones`: lista de versiones con estado y vigente; subir versión (panel lateral con `vit-archivo-carga` en modo versión); marcar vigente con confirmación; descargar cualquier versión `DISPONIBLE`.
  - Descarga: pide la URL firmada y la abre con `attachment`.
- Página de prueba `dev/archivos` en `plataforma-admin`, solo fuera de producción.
- Verificación con Playwright en tema claro, oscuro y a 600 px.

**No entra (specs futuros):**

- Montar los componentes en pantallas de producto: ficha de persona (spec 38), evidencia de consentimientos (`per-textos-finalidad-ui` o 38), adjuntos de soporte (96), CMS (87).
- Varios archivos a la vez en una instancia.
- Seguimiento del análisis fuera del componente (servicio global con toast, como las importaciones del 19d).
- Sondeo periódico.
- Vista previa de imágenes o PDF dentro de la página.
- Liberar o borrar cuarentenas, borrar versiones.
- Retención y bloqueo legal en pantalla (spec 70).
- Nombre de usuario en «subido por» (hoy la API solo da el id).

## Base de código reutilizada

| Pieza | Qué se hace |
| --- | --- |
| `catalogos/src/infrastructure/avisos-en-espera.ts`, `transmitirAvisos` de `importaciones.http.ts` | Se mueven a `kernel-infra` como `AvisosEnEspera` y `transmitirEventosSse<T>` genéricos. `catalogos` los importa; sin cambio de comportamiento. |
| `catalogos/src/infrastructure/redis/canal-avance.redis.ts` | Molde de `CanalAnalisisRedis`. |
| `consola-catalogos/src/lib/utils/lector-eventos.ts`, `services/eventos-importacion.cliente.ts` | El lector y el `fetch` con Bearer se vuelven genéricos en `shared/auth` (`lectorEventosSse`, `EventosSseCliente`). `EventosImportacionCliente` conserva su API y delega. |
| `archivos` (`SolicitarCarga`, `ConfirmarCarga`, `SolicitarVersion`, `ConfirmarVersion`, `AnalizarArchivo`, `RepositorioArchivos`) | `AnalizarArchivo` publica en `CanalAnalisis` tras confirmar su transacción. Lo demás sin cambios. |
| `shared/ui` (`vit-tabla`, `vit-chip-estado`, `vit-estado-vacio`, `vit-cargando`, `AvisosService`, `PanelLateralService`) | Lista de versiones, chips de estado, confirmación de «marcar vigente» y panel de «Subir versión». |
| `shared/auth` (`SesionService`, `CONFIG_AUTH`, `SiPermisoDirective`) | Token y sucursal del SSE; acciones ocultas sin permiso. |
| `apps/plataforma-admin` (`RUTAS_DE_DESARROLLO`) | Ruta `dev/archivos`. |

## Modelo de datos

Sin migraciones ni tablas nuevas. Lo nuevo vive en Redis y en el front.

### Back: categorías

`GET /v1/archivos/categorias` → 200 `[{ codigo, mimes_permitidos, tamano_max_bytes }]`. Sin `sensible`. Caso de uso `ListarCategorias` sobre `RepositorioArchivos.listarCategorias()` (nuevo, `getRepository` de la entidad de `arc.categoria`). La API sigue validando al pedir la carga.

### Back: canal del análisis (`application/ports/canal-analisis.ts`, `infrastructure/redis/canal-analisis.redis.ts`)

```ts
export const RESULTADOS_SEGUIMIENTO = ['DISPONIBLE', 'CUARENTENA', 'RECHAZADO'] as const;

/** Lo que el worker publica al terminar el análisis de una carga (versión 1) o de una versión (n > 1). */
export interface ResultadoAnalisis {
  archivoId: string;
  numero: number;
  resultado: (typeof RESULTADOS_SEGUIMIENTO)[number];
  motivoRechazo?: MotivoRechazo | MotivoRechazoVersion;
  versionCoincidente?: number;
  mensaje?: string;              // mensajeRechazoVersion o el texto del motivo de la primera carga
  subidoPor: string;             // solo para autorizar el SSE; no sale al cliente
}

export interface CanalAnalisis {
  publicar(resultado: ResultadoAnalisis): Promise<void>;
  ultimo(archivoId: string, numero: number): Promise<ResultadoAnalisis | null>;
  suscribir(archivoId: string, numero: number, senal: AbortSignal): AsyncGenerator<ResultadoAnalisis>;
}
```

- Canal `arc:analisis:{archivoId}-{numero}`; clave del último resultado `arc:analisis:{archivoId}-{numero}:resultado`, TTL 1 h.
- `AnalizarArchivo` publica después de confirmar la transacción (no dentro: un mensaje de una transacción revertida mentiría). Si Redis falla, registra un aviso y no relanza: el resultado ya está en la base y el SSE lo lee al conectar.
- Un intento de versión rechazado borra su fila (spec 35); su resultado solo queda en el canal y en `arc.archivo.motivo_rechazo_version`.

### Back: SSE (`application/seguir-analisis.ts`)

`SeguirAnalisis.ejecutar({ archivoId, numero, usuarioId, senal })` → `AsyncIterable<AvisoAnalisis>`:

1. Archivo del tenant (si no, `ArchivoNoEncontradoError` → 404).
2. Se suscribe al canal antes de leer el estado, para no perder un resultado que llegue en medio.
3. Lee `ultimo(archivoId, numero)`. Si existe: `subidoPor` distinto del usuario → 404; si no, emite `fin` y termina.
4. Si no hay último, lee la versión en la base. No existe → 404 `VERSION_NO_ENCONTRADA`. `subido_por` distinto → 404. Ya en `DISPONIBLE` o `CUARENTENA` (o archivo `RECHAZADO`) → emite `fin` con ese estado y termina. `PENDIENTE_CARGA` → 409 `ANALISIS_NO_INICIADO` (falta confirmar).
5. `EN_ANALISIS` → emite `estado` y espera el `fin` del canal.

```ts
type AvisoAnalisis =
  | { tipo: 'estado'; numero: number; estado: 'EN_ANALISIS' }
  | { tipo: 'fin'; numero: number; resultado: 'DISPONIBLE' | 'CUARENTENA' | 'RECHAZADO';
      motivo?: string; version_coincidente?: number; mensaje?: string };
```

| Método y ruta | Permiso | Respuesta |
| --- | --- | --- |
| `GET /v1/archivos/categorias` | `plat.archivo.subir` | 200 lista |
| `GET /v1/archivos/{id}/eventos` | `plat.archivo.subir` | `text/event-stream`: `estado` y `fin` de la versión 1 |
| `GET /v1/archivos/{id}/versiones/{numero}/eventos` | `plat.archivo.versionar` | `text/event-stream`: `estado` y `fin` de esa versión |

- `: ping` cada 15 s, `X-Accel-Buffering: no`, cierre con el `fin` o a los 15 min (emisor de `kernel-infra`).
- Errores antes de abrir el stream: 404 `NO_ENCONTRADO`, 404 `VERSION_NO_ENCONTRADA`, 409 `ANALISIS_NO_INICIADO`. OpenAPI con `@ApiProduces('text/event-stream')`.

### Front compartido (`libs/shared/auth`)

- `utils/lector-eventos-sse.ts`: `lectorEventosSse(pendiente, fragmento) → { eventos: { evento: string; datos: string }[]; pendiente }`. Descarta comentarios.
- `models/errores-sse.ts`: `CorteDeStream`, `StreamRechazado` (con `estado` HTTP).
- `services/eventos-sse.cliente.ts`: `EventosSseCliente.abrir(ruta, esFin)` → `Observable<{ evento, datos }>`; `fetch` a `apiUrl + ruta` con `Accept`, `Authorization` y `X-Sucursal-Id`; completa al primer evento que cumple `esFin`; desuscribirse aborta.
- `index.ts` los exporta.

### Front: `libs/plataforma/archivos-ui`

```
src/lib/
  models/      archivo.ts (DTO, mapeos), categoria.ts, estado-carga.ts, tonos-archivo.ts
  services/    archivos.cliente.ts, subida-storage.cliente.ts, eventos-analisis.cliente.ts, categorias.service.ts
  utils/       validar-archivo.ts, formato-bytes.ts
  components/  archivo-carga/, archivo-versiones/
```

- `archivos.cliente.ts`: `HttpClient` contra las rutas de ARC (carga, confirmar, versión, confirmar versión, versiones, vigente, estado, descarga, categorías).
- `subida-storage.cliente.ts`: `HttpClient` construido sobre `HttpBackend` (sin interceptores: el Bearer de la API no viaja a Storage); `PUT` a `carga.url` con el `File` como cuerpo, `Content-Type` = MIME declarado, `reportProgress: true`, `observe: 'events'`. Emite `{ tipo: 'progreso', porcentaje }` y `{ tipo: 'terminado' }`.
- `eventos-analisis.cliente.ts`: abre `/archivos/{id}/eventos` o `/archivos/{id}/versiones/{n}/eventos` con `EventosSseCliente` y mapea a `AvisoAnalisis`.
- `categorias.service.ts`: pide `GET /v1/archivos/categorias` una vez por sesión y la guarda en un signal.
- `validar-archivo.ts`: `validarArchivo(file, categoria)` → `null` o `{ motivo: 'MIME' | 'TAMANO' | 'VACIO', mensaje }`. Textos en constantes.
- `estado-carga.ts`: `EtapaCarga = 'ESPERA' | 'SUBIENDO' | 'CONFIRMANDO' | 'ANALIZANDO' | 'DISPONIBLE' | 'CUARENTENA' | 'RECHAZADO' | 'ERROR'`.
- `tonos-archivo.ts`: `TonoEstado` de `DISPONIBLE` (`exito`), `EN_ANALISIS` y `PENDIENTE_CARGA` (`info`), `CUARENTENA` y `RECHAZADO` (`error`).

### Diseño de referencia

Canvas «Vitrina · Diseño UI», página «36 · Archivos» (https://claude.ai/artifact/UGvcmiWUiBsMuWerqMiWxh). La implementación sigue estos artboards:

| Artboard | Qué fija |
| --- | --- |
| `ARC-Zona` (base editable) | `vit-archivo-carga`: textos, íconos, chips, barra de progreso y botones de cada etapa. |
| `ARC-Estados` y `ARC-Estados-oscuro` | Las diez etapas: espera, arrastrando, rechazado antes de subir, subiendo, en análisis, disponible, cuarentena, rechazado por el análisis, versión idéntica y error de subida. |
| `ARC-Carga` (base editable) | Página `dev/archivos`: carga, lista de versiones y confirmación de «Marcar vigente». |
| `ARC-Versiones-panel` y `ARC-Versiones-identica` | Panel lateral «Subir versión»: subiendo y contenido idéntico a la vigente. |
| `ARC-Carga-oscuro` | Versión en análisis en la lista y «Subir versión» deshabilitado, tema oscuro. |
| `ARC-Carga-600` y `ARC-Carga-600-oscuro` | 600 px: lista de celular y panel a ancho completo. |

`vit-archivo-carga`:

| Entrada | Tipo | Uso |
| --- | --- | --- |
| `categoria` | `string` | Obligatoria en modo carga |
| `entidadTipo`, `entidadId` | `string` | Obligatorias en modo carga |
| `archivoId` | `string \| undefined` | Con valor: modo versión (sube una versión de ese archivo) |
| `etiqueta` | `string` | Texto de la zona («Arrastra el documento aquí») |
| `deshabilitado` | `boolean` | |

| Salida | Carga útil |
| --- | --- |
| `disponible` | `{ archivoId, numero }` |
| `rechazado` | `{ archivoId, numero, resultado: 'CUARENTENA' \| 'RECHAZADO', mensaje }` |

- Zona de carga con borde punteado de tokens, ícono `upload_file`, botón «Elegir archivo», `accept` con los MIME de la categoría, `dragover` resaltado, accesible por teclado (Enter o Espacio abren el selector) y con `aria-live` para el estado.
- Flujo: validar → pedir carga (o versión) → PUT con barra de progreso y botón «Cancelar» → confirmar → abrir SSE → `fin`.
- `DISPONIBLE`: chip de éxito, nombre, tamaño y «Descargar». `CUARENTENA`: chip de error, «El archivo no pasó el antivirus» y «Elegir otro archivo». `RECHAZADO`: chip de error con el `mensaje` de la API (tipo no permitido, tamaño, «El archivo es idéntico a la versión vigente») y «Elegir otro archivo». `ERROR`: mensaje y «Reintentar». «Elegir otro archivo» y «Reintentar» empiezan una carga nueva.
- Rechazo antes de subir (MIME o tamaño): la zona sigue en espera y muestra el mensaje debajo.
- Al iniciar con `archivoId` en modo carga (pantalla que vuelve a mostrar un archivo ya subido) consulta `GET /v1/archivos/{id}` una vez; si sigue `EN_ANALISIS` reabre el SSE; si el SSE responde 404 (lo subió otro usuario) muestra «En análisis» sin seguimiento.
- Al destruirse, aborta el PUT y cierra el SSE.

`vit-archivo-versiones` (entrada `archivoId`; salida `vigenteCambiada`):

- `vit-tabla` con columnas versión, estado (chip), vigente (ícono `check_circle`), tamaño, subida (fecha y hora de Lima) y acciones. `ColumnaTabla.movil` muestra versión, estado y vigente.
- Acciones por fila: «Descargar» (`plat.archivo.descargar`, solo `DISPONIBLE`) y «Marcar vigente» (`plat.archivo.versionar`, solo `DISPONIBLE` no vigente, confirmación con `AvisosService`).
- Encabezado: «Subir versión» (`plat.archivo.versionar`) abre el panel lateral de `shared/ui` con `vit-archivo-carga` en modo versión; al `disponible` cierra el panel y recarga la lista; al `rechazado` deja el mensaje en el panel.
- `version_en_curso` en la respuesta: fila con chip `EN_ANALISIS` y «Subir versión» deshabilitado con el aviso «Hay una versión en análisis».
- Vacío: `vit-estado-vacio`. Cargando: `vit-cargando`.

### Página de prueba `apps/plataforma-admin/src/app/pages/archivos-prueba/`

- Ruta `dev/archivos` en `RUTAS_DE_DESARROLLO`.
- Selector de categoría (de `GET /v1/archivos/categorias`), `entidadTipo` fijo `PRUEBA_DEV` y `entidadId` uuid generado y guardado en `?entidad=`, para recargar la página sin perderlo.
- `vit-archivo-carga` y, cuando emite `disponible`, `vit-archivo-versiones` de ese archivo.
- Chip de advertencia «Solo desarrollo» junto al título. La ruta no aparece en el menú.
- Pantalla tipo: formulario (carga) y lista (versiones), según el artboard `ARC-Carga`.

## Plan de implementación

1. **Emisor SSE y espera compartidos.** Mover `AvisosEnEspera` y `transmitirAvisos` a `kernel-infra` (genéricos) y ajustar `catalogos`. Las pruebas del SSE de importaciones siguen verdes.
2. **Categorías.** `RepositorioArchivos.listarCategorias`, `ListarCategorias`, `GET /v1/archivos/categorias`, DTO y OpenAPI, con e2e.
3. **Canal del análisis.** `CanalAnalisis`, `CanalAnalisisRedis`, publicación en `AnalizarArchivo` después de confirmar, con un canal en memoria en las pruebas del 33 y 35 (siguen verdes). Composición en `ArchivosModule` (api y worker).
4. **SSE del análisis.** `SeguirAnalisis`, las dos rutas, e2e: `estado` y `fin`, `fin` inmediato si ya terminó, 404 a otro usuario, 409 sin confirmar, resultado publicado entre la suscripción y la lectura.
5. **Cliente SSE en `shared/auth`.** Mover lector, cliente y errores; `EventosImportacionCliente` delega. Pruebas de `consola-catalogos` y `shared/auth` verdes.
6. **Lib `archivos-ui`: modelos, clientes y validación.** Proyecto, etiquetas, alias; `archivos.cliente.ts`, `subida-storage.cliente.ts` (progreso con `HttpTestingController`), `eventos-analisis.cliente.ts`, `categorias.service.ts`, `validarArchivo`, `formatoBytes`.
7. **`vit-archivo-carga`.** Componente con sus etapas, arrastrar y soltar, cancelar, modos carga y versión, con pruebas de componente.
8. **`vit-archivo-versiones`.** Lista, marcar vigente, descarga, panel de «Subir versión», con pruebas.
9. **Página de prueba y verificación.** Ruta `dev/archivos`; con api y worker locales contra Supabase dev, recorrido con Playwright de los criterios de UI en claro, oscuro y 600 px, consola sin errores y capturas.
10. **Cierre.** `code-simplifier` sobre los archivos tocados; `npx nx run-many -t lint test -p archivos archivos-ui catalogos plataforma-consola-catalogos kernel-infra shared-auth plataforma-admin api worker`.

## Criterios de aceptación

**Back:**

- [ ] `GET /v1/archivos/categorias` devuelve las cinco categorías con `mimes_permitidos` y `tamano_max_bytes`, sin `sensible`; sin `plat.archivo.subir` → 403.
- [ ] Tras confirmar una carga, `GET /v1/archivos/{id}/eventos` de quien la subió entrega `estado` (`EN_ANALISIS`) y después `fin` con `DISPONIBLE`, y cierra.
- [ ] Si el análisis ya terminó al abrir el stream, entrega solo `fin` y cierra; un resultado publicado entre la suscripción y la lectura del estado no se pierde.
- [ ] Un intento de versión rechazado por `IDENTICA` entrega `fin` con `RECHAZADO`, `motivo`, `version_coincidente` y el `mensaje` «El archivo es idéntico a la versión vigente», aunque su fila ya no exista.
- [ ] La firma EICAR entrega `fin` con `CUARENTENA`.
- [ ] Otro usuario del tenant → 404; archivo de otro tenant → 404 `NO_ENCONTRADO`; versión inexistente → 404 `VERSION_NO_ENCONTRADA`; carga sin confirmar → 409 `ANALISIS_NO_INICIADO`. Sin `plat.archivo.subir` o `plat.archivo.versionar` según la ruta → 403.
- [ ] El stream manda `: ping` cada 15 s y cierra a los 15 min sin `fin`.
- [ ] Si Redis no está al publicar, el análisis no falla y el SSE abierto después entrega el `fin` leído de la base.
- [ ] Ningún aviso SSE, mensaje de Redis ni log contiene `nombre_original`, URL firmada ni token; `subidoPor` no sale al cliente.
- [ ] El SSE de importaciones del 19b sigue pasando sus pruebas con el emisor de `kernel-infra`.

**Front (pruebas unitarias y de componente):**

- [ ] `validarArchivo` rechaza un MIME fuera de la categoría, un archivo vacío y uno mayor que `tamano_max_bytes`, con su mensaje, sin llamar a la API.
- [ ] La subida a Storage no lleva `Authorization` ni `X-Sucursal-Id` y sí el `Content-Type` declarado; emite progreso creciente hasta 100.
- [ ] Cancelar durante la subida aborta el PUT y deja el componente en `ESPERA`.
- [ ] Destruir el componente aborta el PUT y cierra el SSE.
- [ ] `consola-catalogos` sigue usando su seguimiento de importaciones con el cliente de `shared/auth` y sus pruebas siguen verdes.

**UI (Playwright en `dev/archivos`, api y worker locales contra Supabase dev):**

- [ ] Arrastrar un PDF de 1,2 MB a la zona con categoría `DOCUMENTO`: barra de progreso, «Analizando», chip `DISPONIBLE` y «Descargar» abre la descarga con el nombre original (TR-CA-199 en pantalla).
- [ ] Elegir con el botón (sin arrastrar) funciona igual; con teclado, Enter sobre la zona abre el selector.
- [ ] Un `.exe` en `DOCUMENTO`: el selector no lo ofrece por `accept`; forzado por arrastre, el componente lo rechaza antes de subir con «Tipo de archivo no permitido».
- [ ] Un archivo de 11 MB en `IMAGEN`: rechazado antes de subir con el máximo de la categoría.
- [ ] Un `.exe` renombrado a `.pdf`: sube, y el SSE trae `RECHAZADO` con el motivo de tipo no permitido (TR-CA-200 en pantalla).
- [ ] Un archivo con la firma EICAR: chip `CUARENTENA` y sin «Descargar» (TR-CA-201 en pantalla).
- [ ] La red del navegador muestra un solo `GET .../eventos` por análisis y ningún sondeo de `GET /v1/archivos/{id}`.
- [ ] `vit-archivo-versiones`: subir una versión desde el panel lateral la deja vigente y en la lista; subir el mismo contenido muestra «El archivo es idéntico a la versión vigente» en el panel; marcar vigente una anterior pide confirmación y mueve el ícono de vigente; descargar una versión anterior baja esa versión (TR-CA-202 y 203 en pantalla).
- [ ] Con una versión en análisis, «Subir versión» está deshabilitado con su aviso.
- [ ] Sin `plat.archivo.versionar`, no se ven «Subir versión» ni «Marcar vigente»; sin `plat.archivo.descargar`, no se ve «Descargar».
- [ ] Tema claro y oscuro: zona, barra, chips y tabla solo con tokens; capturas de los dos.
- [ ] Las capturas de Playwright coinciden con los artboards de la página «36 · Archivos» del canvas (textos, íconos, tonos de chip, orden de columnas y ubicación de las acciones). Una diferencia se corrige en el código o se actualiza el canvas antes de cerrar el spec.
- [ ] A 600 px: la zona ocupa el ancho, la tabla usa la vista de celular y no hay scroll horizontal.
- [ ] Consola del navegador sin errores en todo el recorrido.
- [ ] `dev/archivos` no existe en el build de producción de `plataforma-admin`.

**General:**

- [ ] El código nuevo sigue «Código limpio» y «Estructura de libs Angular» de `CLAUDE.md` (un artefacto por archivo, `templateUrl` y `styleUrl`, `.css` solo si hay estilos propios, `index.ts` con exportaciones explícitas).
- [ ] `archivos-ui` solo importa de `shared/*` y no de `consola-catalogos` ni de otra lib feature; `archivos` no importa de `catalogos`.
- [ ] `npx nx run-many -t lint test -p archivos archivos-ui catalogos plataforma-consola-catalogos kernel-infra shared-auth plataforma-admin api worker` verde; `nx affected` verde en el CI del PR.

## Decisiones

- **Sí:** dos componentes, `vit-archivo-carga` y `vit-archivo-versiones`, con prefijo `vit-` como el resto de las libs. Decisión del usuario. El SRS lo llama `<ui-archivo-carga>`; el prefijo del repo manda.
- **Sí:** un archivo por instancia. Decisión del usuario. Coincide con RF-080 (un archivo por entidad y categoría).
- **Sí:** arrastrar y soltar además de elegir con el botón. Pedido del usuario.
- **Sí:** PUT con `HttpClient` sobre `HttpBackend` y `reportProgress`. Decisión del usuario. Da progreso real y la lib no depende de `supabase-js`; sin interceptores el Bearer de la API no llega a Storage.
- **No:** `uploadToSignedUrl` de `supabase-js`. Decisión del usuario. No da progreso real.
- **Sí:** `GET /v1/archivos/categorias` y validación de MIME y tamaño en el front antes de pedir la URL. Decisión del usuario. La API sigue siendo la que decide.
- **No:** copiar la tabla de categorías en el front ni validar solo con la respuesta de la API. Decisión del usuario.
- **Sí:** el resultado del análisis empujado por SSE desde el worker, con Redis pub/sub y el último resultado con TTL. Decisión del usuario: sin peticiones periódicas, el estándar del 19b.
- **No:** sondeo de `GET /v1/archivos/{id}`. Decisión del usuario.
- **Sí:** dos rutas SSE, una por carga y otra por versión, con el permiso de su confirmación, y solo para quien subió. Decisión del usuario. `@Permiso` admite un código; quien solo versiona no tiene `plat.archivo.subir`.
- **Sí:** el seguimiento vive mientras vive el componente. Decisión del usuario. El análisis tarda segundos; al volver, el componente consulta una vez y reabre el SSE si hace falta.
- **No:** servicio global con toast. Decisión del usuario.
- **Sí:** mover el cliente SSE, el lector y sus errores a `shared/auth`. Decisión del usuario. Evita duplicar código; `shared/auth` ya tiene el token y la sucursal que el cliente necesita.
- **Sí:** mover `AvisosEnEspera` y el emisor SSE a `kernel-infra`. ARC no puede importar `catalogos` (`comp:arc`) y copiarlos duplicaría el ping, las cabeceras y el cierre de 15 min.
- **Sí:** el worker publica en el canal después de confirmar su transacción, y una falla de Redis no hace fallar el análisis. El estado ya está en la base y el SSE lo lee al conectar.
- **Sí:** el SSE se suscribe antes de leer el estado. Si el resultado llega en medio, la lectura lo encuentra o el canal lo entrega.
- **Sí:** el último resultado en Redis con `subidoPor`. Un intento de versión rechazado ya no tiene fila de la que leer quién lo subió.
- **Sí:** `archivos-ui` con `type:feature`. Llama a la API y usa `shared/auth` (`type:data-access`), que una lib `type:ui` no puede importar. `catalogos-ui` es `type:ui` porque no llama a la API.
- **Sí:** página de prueba `dev/archivos` en `plataforma-admin`, solo fuera de producción. Decisión del usuario. Ninguna pantalla de producto sube archivos todavía y la verificación con Playwright es obligatoria.
- **No:** pantalla de negocio «Archivos» en `admin-cliente`. Decisión del usuario. Nadie la pidió.
- **Sí:** «Subir versión» en el panel lateral de `shared/ui`. Regla de diseño de `CLAUDE.md` para diálogos con formulario.
- **Sí:** la lista no muestra «subido por». La API solo da el id del usuario y mostrar un uuid no ayuda; se agrega cuando haya un servicio de nombres de usuario.
- **Sí:** descargar abre la URL firmada con `attachment` (por defecto del 33). Sin vista previa en la página.
- **Sí:** diseño previo en el canvas, página «36 · Archivos». Decisión del usuario. La zona de carga, la barra de progreso y los estados de cuarentena y rechazo no existían en ninguna pantalla tipo (regla de diseño de `CLAUDE.md`).
- **Sí:** «Elegir otro archivo» tras cuarentena o rechazo, y confirmación de «Marcar vigente» como diálogo de `AvisosService`. Salieron del diseño en el canvas.
- **Sí:** «Reintentar» tras un error de subida empieza una carga nueva. No hay ruta para volver a firmar una carga pendiente; la anterior la borra la limpieza diaria.

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| Storage rechaza el PUT del navegador por CORS | Se comprueba primero en el paso 9 contra Supabase dev. Si falla, se documenta la configuración de CORS del proyecto en `docs/ops/supabase-ambientes.md` antes de seguir. |
| El `Content-Type` que manda el navegador no coincide con el MIME detectado | El análisis decide por `mime_real` (spec 33); el componente muestra el rechazo que trae el `fin`. |
| Un proxy corta el SSE | `: ping` cada 15 s y `X-Accel-Buffering: no`; si el stream se corta, el componente consulta `GET /v1/archivos/{id}` una vez y reabre. |
| Mover el emisor SSE y el cliente rompe el seguimiento de importaciones | Sus pruebas del 19b y 19d son criterio de este spec. |
| Redis caído durante el análisis | El análisis no falla; el SSE abierto después lee la base. Si estaba abierto, el usuario ve «Analizando» hasta el cierre de 15 min; al cortarse, el componente consulta una vez. |
| La URL de carga vence (2 h) antes de terminar el PUT | Storage responde error; el componente muestra el error y «Reintentar» pide una carga nueva. |
| El antivirus real (ClamAV) no corre en local | En local el análisis usa `eicar`, que detecta la firma de prueba; ClamAV queda para staging (pendiente del 34). |

## Lo que **no** entra en este spec

- Montar los componentes en pantallas de producto (specs 38, 87, 96 y otros).
- Varios archivos a la vez y seguimiento global con toast.
- Sondeo periódico.
- Vista previa, liberar o borrar cuarentenas, borrar versiones.
- Retención en pantalla (spec 70).
- Nombre del usuario que subió cada versión.

Cada uno, si llega, va en su propio spec.
