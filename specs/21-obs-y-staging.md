# SPEC 21 — Observabilidad base y ambiente staging: logs JSON, trazas OpenTelemetry a Grafana Cloud, Sentry, contenedores en Railway y frontends en Vercel

> **Status:** Aprobado
> **Depends on:** SPEC 02, SPEC 11
> **Date:** 2026-11-10
> **Objective:** Crear `libs/plataforma/observabilidad` para que `apps/api` y `apps/worker` emitan logs JSON sin datos personales, trazas y métricas OpenTelemetry a Grafana Cloud y errores a Sentry, y desplegarlas en staging (Railway + proyecto Supabase propio) junto con `plataforma-admin` y `plataforma-consola` en Vercel, mediante `deploy-staging.yml` al integrar a `main`.

## Por qué existe este spec

Fila 21 de `docs/roadmap-specs.md` (E-03, E-04). Contexto de apoyo: `docs/spec-context/21-obs-y-staging.md`. Su sección 11 (ambigüedades y preguntas) queda resuelta por las Decisiones de este spec. Cierra el hito **H2** «Plataforma R1 en staging» y hace verificable el punto «probada en staging» del DoD.

El paquete de contexto quedó desactualizado en cuatro puntos. Esto es lo que hay en el código hoy (revisado al redactar):

- `apps/worker` existe (spec 11 y siguientes). No tiene HTTP: relay del outbox, consumidores, vencimientos, soporte, importaciones y verificación de auditoría.
- Ya existen los frontends `apps/plataforma-admin` y `apps/plataforma-consola`. Llaman a la API con `apiUrl: '/v1'` (proxy en local y en la configuración `subdominios`). `environment.prod.ts` está vacío.
- `traceId` ya se calcula: `libs/plataforma/seguridad/src/interface/traza.ts` lo saca del encabezado `traceparent` y `contexto-tenant.interceptor.ts` lo guarda en el ALS. `OutboxPublisher` lo escribe en `sync.outbox.trace_id`, y AUD lo copia al evento de auditoría. Si no llega `traceparent`, hoy no hay `traceId`.
- Hoy se loguea con el `Logger` de Nest (texto plano): `HttpExceptionFilter`, los módulos del worker y algunos módulos de libs. No hay logs JSON, trazas, Sentry, Dockerfile ni `deploy-staging.yml`.
- `apps/api` y `apps/worker` se empaquetan con esbuild (`esbuild.mjs`, ESM, `packages: 'external'`). `node_modules` queda fuera del bundle, lo que permite la autoinstrumentación de OpenTelemetry si se carga con `--import` antes de la app.
- `tools/migrar/cli.mjs --remoto` usa `DATABASE_MIGRATION_URL`. `plataforma:sembrar:remoto` y `manifiesto:aplicar:remoto` ya existen.
- `docs/ops/supabase-ambientes.md` tiene dev y prod, y dice que staging entra con este spec.

RF cubiertos: ninguno. E-03 tiene `rf = TR-RNF` y E-04 no tiene RF. Los criterios son de verificación operativa.

RNF propios:

- **TR-RNF-026**: logs estructurados con `trace_id`, tenant y sucursal, sin datos personales; trazas OpenTelemetry; el 100 % de las solicitudes queda trazado o muestreado.
- **TR-RNF-111**: los números de documento solo aparecen en logs como hash SHA-256 con sal de plataforma.
- **TR-RNF-011**: TLS en todos los endpoints de staging; secretos solo en GitHub Environments y en las variables de Railway y Vercel.
- **TR-RNF-113**: 0 secretos en el repo, con escaneo de secretos en CI.
- **TR-RNF-028**: api y worker en contenedor; la api no guarda estado y aguanta 2 réplicas sin errores.
- **TR-RNF-001** (instrumento): las trazas permiten medir el p95. La prueba k6 no es de este spec.
- **TR-RNF-106** (instrumento): métrica de retraso del outbox.

RNF heredados: 010, 012, 024/119 (la lib nueva respeta límites), 025.

Historias del backlog: **E-03** (4 h) y **E-04** (4 h). Estimado: 8 h. Si se pasa, se recorta en este orden: la prueba con 2 réplicas, el envío de logs a Grafana (quedan solo en Railway) y la alerta de Grafana (pasa a P-01).

## Alcance

**Área 1 · Observabilidad (E-03)**

- Lib `libs/plataforma/observabilidad` (`comp:obs`, `scope:plataforma`) con:
  - logger pino con redacción, contexto de tenant y `trace_id`;
  - arranque de OpenTelemetry y Sentry;
  - interceptor que pone tenant, sucursal y usuario como atributos del span;
  - `hashDocumento`;
  - adaptador Sentry del puerto `ReportadorErrores`.
- `apps/api/src/instrumentacion.ts` y `apps/worker/src/instrumentacion.ts`, cargados con `node --import`.
- Autoinstrumentación HTTP, Nest, `pg` e `ioredis`; trazas, métricas y logs por OTLP a Grafana Cloud.
- Métricas propias del outbox en el worker: pendientes, fallidos y edad del pendiente más antiguo.
- Errores 5xx de la api y fallos de trabajos del worker a Sentry. Errores 4xx no.
- `traceId` del ALS tomado del span activo; el `traceparent` queda como respaldo cuando OTel está apagado.
- Todo se apaga si faltan las variables (local y CI no exportan nada).

**Área 2 · Contenedores y pipeline (E-04)**

- `apps/api/Dockerfile`, `apps/worker/Dockerfile` y `.dockerignore`: imagen distroless de Node 24 con usuario sin privilegios.
- `.github/workflows/deploy-staging.yml`, que se dispara cuando el CI pasa en `main`, en este orden:
  1. publica las imágenes en GHCR;
  2. migra y siembra;
  3. despliega en Railway y Vercel;
  4. corre la prueba de humo.
- Job `secretos` (gitleaks) en `ci.yml`.

**Área 3 · Ambiente staging (E-04)**

- Proyecto Supabase `staging` (Free) con el checklist de `docs/ops/supabase-ambientes.md`.
- Proyecto Railway `vitrina-staging` con los servicios `api` y `worker` y Redis.
- Dos proyectos Vercel con `vercel.json`, que reenvía `/v1/*` a la api, y la configuración de build `staging` en cada app.
- Una alerta en Grafana: outbox atrasado.
- `docs/ops/staging.md`: URLs, nombres de variables (sin valores), cómo desplegar, cómo revertir, cómo reactivar Supabase pausado.

**No entra:** ver «Lo que no está en este spec».

## Base de código reutilizada

| Pieza | Se conserva | Cambia |
| --- | --- | --- |
| `seguridad/interface/traza.ts` | `traceIdDeTraceparent` como respaldo | `contexto-tenant.interceptor.ts` usa primero `traceIdActivo()` de `kernel-infra` |
| `kernel-infra/http-exception.filter.ts` | Mapeo de errores y respuesta | En 5xx llama a `ReportadorErrores.reportar(error)` (puerto nuevo en `kernel-infra`, no-op por defecto); el log pasa a pino |
| `new Logger(...)` de Nest en libs y worker | Sin cambios en las llamadas | Salen por pino porque la app usa `app.useLogger(...)` con `bufferLogs: true` |
| `apps/*/esbuild.mjs` | Bundle ESM con `packages: 'external'` | Nueva entrada `instrumentacion` |
| `apps/*/config/env.ts` | Esquema zod | Variables nuevas (abajo) |
| `tools/migrar/cli.mjs`, `plataforma:sembrar:remoto`, `manifiesto:aplicar:remoto` | Tal cual | Los corre el pipeline con los secretos de staging |
| `environment.subdominios.ts` | Patrón `apiUrl: '/v1'` | Nuevo `environment.staging.ts` por app, sin `dominioCookie` |
| `docs/ops/supabase-ambientes.md` | Checklist | Fila y evidencia de staging |
| `docs/.../codigo/` | — | No trae nada de observabilidad ni despliegue; se escribe desde cero |

## Modelo de datos

No hay tablas nuevas. Hay una función SQL para las métricas del outbox:

### Migración `db/01e_sync_metricas.sql` (+ `db/rollback/` + `db/tests/01e_sync_metricas.test.sql`)

- `sync.estado_outbox()` `RETURNS TABLE (pendientes bigint, fallidos bigint, edad_pendiente_seg integer)`.
- `SECURITY DEFINER`, dueño `sync_lector`, `SET search_path = ''` y `EXECUTE` solo para el rol de la app. Es el mismo patrón que `sync.read_events` (spec 11).
- `pendientes`: filas de `sync.outbox` con `seq` mayor que el cursor de `sync.relay_cursor`.
- `fallidos`: filas de `sync.evento_fallido` en estado `FALLIDO`.
- `edad_pendiente_seg`: `now() - created_at` del pendiente más antiguo, o 0 si no hay pendientes.
- SQL crudo permitido (regla 11): es una función de base de datos que agrega entre tenants.
- Si al implementar los nombres de columnas del cursor o de `evento_fallido` no coinciden con lo que dice esta sección, se usan los reales y se corrige este texto.

### Lib `libs/plataforma/observabilidad`

```
src/
  domain/
    campos-redactados.ts      RUTAS_REDACTADAS (authorization, cookie, set-cookie, x-supabase-*, body, query, password, token, refresh_token)
    hash-documento.ts         hashDocumento(numero, sal): SHA-256 hex de `${sal}:${numero}`
  application/
    ports/                    (vacío: ReportadorErrores vive en kernel-infra)
  infrastructure/
    entorno-observabilidad.ts APP_ENV, LOG_LEVEL, OBS_SAL_DOCUMENTO (campos zod para las apps)
    logger.pino.ts            opcionesLogger(config): nivel, redact, serializadores (ruta sin query), mixin con trace_id/span_id
    reportador-errores.sentry.ts
    metricas-outbox.ts        registrarMetricasOutbox(lector): medidores observables con @opentelemetry/api
  interface/
    observabilidad.module.ts  ObservabilidadModule.register({ servicio, nivel, salDocumento }), global: LoggerModule de nestjs-pino y REPORTADOR_ERRORES
    usar-logger.ts            usarLoggerDeObservabilidad(app)
  index.ts
test/
```

Lib aparte `libs/plataforma/observabilidad-arranque` (`comp:obs`; ver Decisiones): `infrastructure/telemetria.ts` (`iniciarTelemetria({ servicio })`: NodeSDK con trazas, métricas y logs OTLP, y luego Sentry), `infrastructure/sentry.ts` (`iniciarSentry`, `limpiarEventoSentry`) e `infrastructure/ambiente.ts` (`esquemaAmbiente`). Cada app tiene `src/registrar-hooks.ts`, `src/instrumentacion.ts` y `src/servicio.ts`.

Los atributos `tenant.id`, `sucursal.id` y `usuario.id` del span los pone `AlsTenantContext.run` (`anotarSpanActivo` en `kernel-infra`), sin correo ni nombre.

- El mixin del logger agrega `trace_id`, `span_id`, `tenant_id`, `sucursal_id` y `usuario_id`, leídos del span activo y del `TenantContextPort`, cuando existen.
- `pino-http` loguea `metodo`, `ruta` (sin query), `estado` y `duracion_ms`. Nunca loguea body ni encabezados redactados.
- El dominio no importa NestJS, pino, OTel ni Sentry. Esos paquetes solo aparecen en `infrastructure` e `interface` (regla 2 y regla 10).

### `kernel-infra` (agregados)

- `traceIdActivo(): string | undefined` con `@opentelemetry/api`. Es solo la API: sin SDK registrado, devuelve `undefined`.
- `REPORTADOR_ERRORES` e interfaz `ReportadorErrores { reportar(error: unknown, contexto?: Record<string, string>): void }`, con implementación no-op por defecto.

### Variables de entorno (api y worker; `.env.example` sin valores)

| Variable | Quién la lee | Valor en staging |
| --- | --- | --- |
| `APP_ENV` | zod, Sentry `environment`, atributo `deployment.environment` | `staging` (`local` por defecto) |
| `LOG_LEVEL` | pino | `info` |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | SDK OTel | Gateway OTLP de Grafana Cloud. Vacío: no se inicia el SDK |
| `OTEL_EXPORTER_OTLP_HEADERS` | SDK OTel | `Authorization=Basic …` (secreto) |
| `OTEL_SERVICE_NAME` | SDK OTel | `vitrina-api` / `vitrina-worker` |
| `OTEL_TRACES_SAMPLER` / `OTEL_TRACES_SAMPLER_ARG` | SDK OTel | `parentbased_traceidratio` / `1.0` |
| `SENTRY_DSN` | Sentry | DSN del proyecto. Vacío: no se inicia |
| `OBS_SAL_DOCUMENTO` | `hashDocumento` | Secreto, mínimo 32 caracteres. Obligatoria si `APP_ENV` es `staging` o `production` |

Las `OTEL_*` las lee el SDK directamente. `iniciarTelemetria` valida con zod solo las que usa: `APP_ENV`, `SENTRY_DSN` y que el endpoint sea una URL.

### Frontends

- `apps/plataforma-admin/src/environments/environment.staging.ts` y el de consola: `supabaseUrl` y `supabasePublishableKey` de staging (públicas), `apiUrl: '/v1'`, sin `dominioCookie`. En `origenesVolverA` va la URL de Vercel de la otra app.
- Configuración `staging` en `project.json`: `production` más `fileReplacements` hacia `environment.staging.ts`.
- `apps/plataforma-admin/vercel.json` y el de consola: rewrite `/v1/:ruta*` hacia `https://<api-staging>.up.railway.app/v1/:ruta*` y fallback SPA a `index.html`.

## Plan de implementación

1. **Lib `observabilidad` vacía y dependencias.**
   - Estructura copiada de `correlativos`, alias `@vitrina/plataforma/observabilidad`, etiqueta `comp:obs`.
   - Paquetes con versión exacta, fijada tras consultar su documentación con ctx7: `nestjs-pino`, `pino`, `pino-http`, `@opentelemetry/sdk-node`, `@opentelemetry/auto-instrumentations-node` (o las instrumentaciones sueltas http, nestjs-core, pg, ioredis, pino), los exportadores OTLP http, `@opentelemetry/api` y `@sentry/nestjs`.
   - Verificar: `pnpm nx run observabilidad:lint observabilidad:build` y `pnpm nx test boundaries-test`.
2. **Dominio: redacción y hash.**
   - `RUTAS_REDACTADAS` y `hashDocumento`.
   - Pruebas: el mismo número y la misma sal dan el mismo hash; con otra sal cambia; el resultado no contiene el número.
   - Verificar: `pnpm nx test observabilidad` con cobertura de `src/domain/**` ≥ 70 %.
3. **Logger pino en api y worker.**
   - `ObservabilidadModule` en `AppModule` y `WorkerModule`.
   - `bufferLogs: true` y `app.useLogger(app.get(Logger))` en los dos `main.ts`.
   - `HttpExceptionFilter` loguea por el logger inyectado.
   - Prueba (TR-RNF-026, TR-RNF-111): el logger escribe en un stream en memoria y se le pasan:
     - una solicitud con `Authorization`, cookie, `?correo=ana@ejemplo.pe`, body con `dni: 45678912` y `password`;
     - un log manual con un objeto que lleva `numeroDocumento`.
   - La salida es JSON por línea y no contiene `45678912`, `ana@ejemplo.pe`, el token ni la contraseña.
   - Dentro de un contexto de tenant, la salida lleva `tenant_id` y `sucursal_id`.
   - Verificar: `pnpm nx test observabilidad api worker` y `nx serve api` en local (sale JSON).
4. **OpenTelemetry y Sentry.**
   - `iniciarTelemetria` sigue el orden de la documentación de Sentry para un pipeline OTel propio:
     1. `NodeSDK.start()`;
     2. `Sentry.init({ dsn, environment, enableOpenTelemetrySetup: false, integrations: [Sentry.openTelemetryIntegration()] })`, sin `tracesSampleRate`.
   - `instrumentacion.ts` en api y worker, como entrada nueva de esbuild. `serve`, Dockerfile y CLI: `node --import ./dist/instrumentacion.js dist/main.js`.
   - `traceIdActivo()` en `kernel-infra`; `contexto-tenant.interceptor.ts` lo usa antes que `traceparent`.
   - `ReportadorErrores` Sentry, que reciben el filtro (5xx) y el `Worker` de BullMQ en `failed`. Los dos respetan el `beforeSend` que borra `request.data`, `request.cookies` y `request.headers.authorization`.
   - Pruebas:
     - sin `OTEL_EXPORTER_OTLP_ENDPOINT` ni `SENTRY_DSN`, `iniciarTelemetria` no lanza y no registra nada;
     - con un exportador en memoria, una solicitud a `/v1/salud` con `traceparent` produce un span con ese `trace_id`;
     - en una ruta autenticada de prueba el span lleva `tenant.id` y el log, el mismo `trace_id`;
     - un error 500 llama a `ReportadorErrores` y un 404 no.
   - Verificar: `pnpm nx test observabilidad api kernel-infra seguridad`.
5. **Métricas del outbox.**
   - Migración `01e_sync_metricas.sql` con inverso y prueba SQL: pendientes y edad con dos tenants; un rol sin `EXECUTE` no puede llamarla.
   - `LectorEstadoOutbox` en `eventos` (adaptador TypeORM que llama a la función) y `registrarMetricasOutbox` en el worker. Medidores `vitrina_outbox_pendientes`, `vitrina_outbox_fallidos` y `vitrina_outbox_edad_pendiente_seg`.
   - Verificar: `pnpm nx test migrar eventos worker`, y `db:up` / `db:down` / `db:up` en CI.
6. **Imágenes.**
   - Dockerfile en varias etapas:
     1. `node:24-slim` con corepack y pnpm;
     2. `pnpm install --frozen-lockfile` y `nx build <app>`;
     3. etapa de dependencias de producción (`pnpm install --prod --frozen-lockfile`);
     4. ejecución en `gcr.io/distroless/nodejs24-debian12:nonroot` con `dist/` y `node_modules`.
   - `.dockerignore` excluye `.env*`, `node_modules`, `.nx`, `docs`, `dist` y `.playwright-mcp`.
   - Verificar:
     - `docker build` de las dos imágenes;
     - `docker run` de la api con `.env` de dev responde `GET /v1/salud` 200;
     - `docker run --entrypoint` no está disponible (distroless) y el proceso corre con un uid distinto de 0;
     - `docker history` no muestra secretos.
7. **Escaneo de secretos.**
   - Job `secretos` en `ci.yml` con gitleaks sobre el diff del PR y sobre todo el historial en `main`.
   - Verificar: el job pasa en el PR. Una rama de prueba con una clave falsa con formato de Supabase falla (se borra sin merge).
8. **Ambiente staging (pasos manuales, evidencia en `docs/ops/`).**
   - Supabase: el usuario crea el proyecto `staging` y entrega `project_ref` y credenciales por canal privado. Se aplica el checklist (ES256, Data API sin esquemas, SMTP Resend, plantillas). En la allowlist de redirect van las URLs de Vercel y `SEG_URL_INVITACION` de staging.
   - Railway: proyecto `vitrina-staging` con:
     - servicio `api` (imagen GHCR, healthcheck `/v1/salud`, variables);
     - servicio `worker` (imagen GHCR, sin dominio público);
     - Redis del proveedor, con `REDIS_URL` privada.
   - Grafana Cloud: stack, token OTLP y una alerta `vitrina_outbox_edad_pendiente_seg > 60` durante 5 min, con aviso por correo.
   - Sentry: proyectos `vitrina-api` y `vitrina-worker`.
   - Vercel: proyectos `vitrina-admin-staging` y `vitrina-consola-staging`.
   - GitHub: Environment `staging` con los secretos y variables (lista en `docs/ops/staging.md`).
   - Verificar: `curl` de cada URL por HTTPS; `curl {SUPABASE_URL}/auth/v1/.well-known/jwks.json` de staging devuelve ES256.
9. **Frontends para staging.**
   - `environment.staging.ts`, configuración `staging` en `project.json` y `vercel.json` en las dos apps.
   - Verificar: `pnpm nx build plataforma-admin -c staging` y `pnpm nx build plataforma-consola -c staging`.
10. **`deploy-staging.yml`.**
    - Disparo: `workflow_run` del CI en `main` con `conclusion == success`, más `workflow_dispatch`. Concurrencia `deploy-staging` sin cancelar en curso.
    - Environment `staging` y permisos `packages: write`.
    - Jobs:
      1. `imagenes`: build y push a `ghcr.io/<repo>/api` y `/worker`, con etiquetas `sha` y `staging`.
      2. `migrar`: `pnpm db:up:supabase:remoto`, `pnpm db:up:remoto`, `pnpm manifiesto:aplicar:remoto` y `pnpm plataforma:sembrar:remoto ${{ vars.STAGING_ADMIN_CORREO }}`. Si falla, no se despliega.
      3. `desplegar`: Railway CLI con `RAILWAY_TOKEN`, que despliega la imagen `sha` en `api` y `worker`. El comando exacto se fija tras consultar la documentación de Railway.
      4. `frontends`: `vercel pull`, `vercel build --prod` y `vercel deploy --prebuilt --prod` en cada proyecto, con `VERCEL_TOKEN`, `VERCEL_ORG_ID` y el `VERCEL_PROJECT_ID` de cada uno.
      5. `humo`:
         - `GET https://<api>/v1/salud` 200 con reintentos hasta 2 min;
         - `GET https://<admin>.vercel.app/v1/salud` 200 (prueba el rewrite);
         - `GET` de la raíz de cada app 200 con `text/html`.
    - Verificar: un merge a `main` deja el workflow en verde.
11. **Verificación en staging y documentación.**
    - Criterios de «Staging» y «Observabilidad en staging» de abajo, con evidencia (capturas de Grafana y Sentry) en `docs/ops/staging.md`.
    - Prueba de 2 réplicas de la api.
    - MCP Playwright sobre las dos URLs de Vercel.
    - `code-simplifier` sobre los archivos modificados.

## Criterios de aceptación

**Logs (TR-RNF-026, TR-RNF-111):**

- [ ] La api y el worker escriben una línea JSON por log con `level`, `time`, `msg` y, cuando existen, `trace_id`, `tenant_id`, `sucursal_id` y `usuario_id`.
- [ ] La prueba del paso 3 pasa: ni DNI, ni correo, ni token, ni contraseña, ni cookie aparecen en claro.
- [ ] El log de una solicitud lleva la ruta sin query string.
- [ ] `hashDocumento` con la misma sal es determinista, y su salida no contiene el número.
- [ ] Los `new Logger(...)` existentes salen en JSON sin cambiar sus llamadas.

**Trazas, métricas y errores:**

- [ ] Sin `OTEL_EXPORTER_OTLP_ENDPOINT` ni `SENTRY_DSN`, api, worker, pruebas y CI arrancan igual que hoy y no intentan exportar.
- [ ] Una solicitud con `traceparent` produce un span con ese `trace_id`, y el log y la fila de `sync.outbox` que genera llevan el mismo `trace_id`.
- [ ] Sin `traceparent`, con OTel activo, el `traceId` del ALS es el del span (ya no queda vacío).
- [ ] Los spans de una ruta autenticada llevan `tenant.id` y `usuario.id`, y no llevan correo, nombre ni encabezados.
- [ ] Un 500 llega a `ReportadorErrores`; un 4xx no. Un trabajo BullMQ que falla también llega.
- [ ] `sync.estado_outbox()` devuelve pendientes, fallidos y edad entre tenants; un rol sin `EXECUTE` recibe error. Migración reversible probada en CI.

**Contenedores y pipeline (TR-RNF-028, TR-RNF-113):**

- [ ] Las imágenes de api y worker corren sobre distroless con un usuario distinto de root y sin `.env` dentro.
- [ ] El job `secretos` corre en todo PR y en `main`; con una clave falsa falla.
- [ ] Un merge a `main` con CI verde dispara `deploy-staging.yml`: imágenes con etiqueta `sha`, migraciones y siembra, deploy de api, worker y los dos frontends, y humo en verde.
- [ ] Si `migrar` falla, no se ejecutan `desplegar` ni `frontends`.
- [ ] Ningún secreto está en el repo ni en los logs del workflow. Los valores viven en el Environment `staging`, Railway y Vercel.

**Staging (TR-RNF-011):**

- [ ] `docs/ops/supabase-ambientes.md` tiene la fila de staging y su checklist marcado con evidencia: ES256, Data API (`406 PGRST106` sobre `sync`), SMTP y plantillas.
- [ ] api, admin y consola responden por HTTPS en sus dominios del proveedor. El worker no tiene dominio público.
- [ ] `GET https://<admin>.vercel.app/v1/salud` responde 200 por el rewrite.
- [ ] El administrador sembrado recibe la invitación, ingresa a `plataforma-admin` y a `plataforma-consola` de staging (un ingreso en cada una) y ve su menú.
- [ ] Con la api en 2 réplicas, 50 solicitudes seguidas a `/v1/salud` y a una ruta autenticada responden sin errores.
- [ ] `docs/ops/staging.md` dice cómo desplegar a mano, cómo volver a la imagen anterior, cómo revertir una migración (`db:down:remoto`) y cómo reactivar el proyecto Supabase si se pausó.

**Observabilidad en staging:**

- [ ] En Grafana Cloud se ve una traza de una solicitud autenticada de staging, con spans HTTP y `pg`, y su log correlacionado por `trace_id`. Los spans de Nest quedan pendientes de upstream (ver Riesgos).
- [ ] En Grafana se ven las métricas HTTP y las tres `vitrina_outbox_*`.
- [ ] Con el worker detenido y un evento publicado, la alerta de outbox atrasado se dispara y llega el correo; al arrancar el worker se resuelve.
- [ ] Un error 500 forzado en staging aparece en Sentry con `environment = staging`, el `trace_id` y sin body, cookies ni `Authorization`.

**UI (MCP Playwright):**

- [ ] Las dos apps de staging cargan, el ingreso funciona y la consola del navegador no tiene errores. Hay capturas de las pantallas de inicio de las dos.

**General:**

- [ ] `nx affected -t lint test build` en verde; `boundaries-test` en verde (`observabilidad` solo expone `index.ts` y no importa productos).
- [ ] El código nuevo sigue «Código limpio» de `CLAUDE.md`: nombres en español sin abreviaturas, funciones pequeñas, constantes con nombre, sin código muerto. `code-simplifier` pasado y diff revisado.
- [ ] Horas reales registradas.

## Decisiones

- **Sí:** un solo spec para E-03 y E-04, como dice el roadmap. Decisión del usuario. Si se pasa de 8 h, se recorta en el orden indicado arriba.
- **Sí:** OpenTelemetry a Grafana Cloud + Sentry + pino (plan completo). Decisión del usuario.
- **Sí:** OTel y Sentry se cargan con `node --import ./dist/instrumentacion.js`, no con `import './tracing'` en `main.ts`. En ESM los imports se evalúan antes que el cuerpo del módulo, y la autoinstrumentación necesita registrarse antes de cargar `pg`, `ioredis` y Nest. Es lo que recomiendan OTel y Sentry para ESM.
- **Sí:** Sentry sobre el pipeline OTel propio (`enableOpenTelemetrySetup: false`, sin `tracesSampleRate`): las trazas van solo a Grafana y Sentry solo recibe errores, asociados al span activo. Así no hay spans duplicados ni dos proveedores.
- **Sí:** Sentry solo en api y worker. Decisión del usuario. El front ya avisa errores con el interceptor de `shared/shell`.
- **Sí:** muestreo del 100 % en staging (`parentbased_traceidratio`, `1.0`). Decisión del usuario. Se baja por variable en prod.
- **Sí:** logs a stdout (Railway los guarda) y a Grafana por el puente OTel de pino, para correlacionar con la traza. Si el puente da problemas, se queda solo stdout (primer recorte).
- **Sí:** `ReportadorErrores` como puerto en `kernel-infra`, con no-op por defecto, para que `HttpExceptionFilter` no importe Sentry (regla 10).
- **Sí:** `HttpExceptionFilter` pasa a ser filtro global de la api (`APP_FILTER` en `AppModule`). Decisión del usuario, tomada en el paso 4: antes no estaba registrado y los errores sin filtro propio caían en el de Nest, que escribe el stack completo. Cambia el cuerpo del 500 a `{ code: 'internal_error' }`, y los `DomainError` de controladores sin filtro propio responden su 4xx. Los filtros de cada lib siguen mandando primero.
- **Sí:** el arranque de OpenTelemetry y Sentry vive en una lib aparte, `libs/plataforma/observabilidad-arranque` (`comp:obs`). Decisión del usuario, tomada en el paso 4. esbuild sube al principio del bundle los imports de todo el `index.ts` de `observabilidad`, que trae Nest y pino; así se cargarían antes que el SDK y quedarían sin instrumentar. La lib de arranque solo importa OTel, Sentry y zod. `observabilidad` toma de ella `esquemaAmbiente`.
- **Sí:** dos `--import` en cada app: `registrar-hooks.js`, que registra el hook ESM de OTel (`@opentelemetry/instrumentation/hook.mjs`) solo si hay endpoint, y después `instrumentacion.js`. El hook tiene que existir antes de los imports estáticos de `instrumentacion.js`. Lo prueba un proceso real en `observabilidad-arranque/test/instrumentacion.e2e.spec.ts`.
- **Sí:** `tenant.id`, `sucursal.id` y `usuario.id` se anotan en el span activo dentro de `AlsTenantContext.run` (`anotarSpanActivo` en `kernel-infra`) y no con un interceptor en `observabilidad`. Es el único punto donde nace el alcance, para HTTP y para tareas del worker, y no depende del orden de los interceptores globales.
- **Sí:** las tareas del worker y los consumidores de eventos reportan solo el intento final de un trabajo que falla: BullMQ avisa `failed` en cada intento.
- **Sí:** `pg` e `ioredis` se instrumentan con `requireParentSpan: true`: el relay y BullMQ consultan cada segundo sin solicitud de origen y llenarían la cuota.
- **Sí:** `traceIdActivo()` en `kernel-infra` y no en `observabilidad`: `seguridad` lo necesita, y OBS va después de SEG en PL-10. Usa solo `@opentelemetry/api`, que sin SDK es no-op.
- **Sí:** las métricas del outbox se leen con una función `SECURITY DEFINER` (`sync.estado_outbox`), por el mismo motivo que `read_events`: `FORCE RLS` impide contar entre tenants con el rol de la app.
- **Sí:** solo métricas técnicas y una alerta (outbox atrasado). Decisión del usuario. Las reglas de producción son de P-01; TR-RF-106 a 110 (indicadores de negocio, reglas, salud por tenant) son de R3.
- **Sí:** Railway para api, worker y Redis. Decisión del usuario. Un solo proveedor y despliega imágenes; el Dockerfile no depende de Railway.
- **Sí:** tercer proyecto Supabase `staging` en Free. Decisión del usuario. Es un proyecto por ambiente (CLAUDE.md, PL-09). Se pausa tras una semana sin uso; se reactiva a mano desde el panel, documentado en `docs/ops/staging.md`. Sin ping automático.
- **Sí:** dominios del proveedor (`*.up.railway.app`, `*.vercel.app`). Decisión del usuario. La cookie de sesión no se comparte entre admin y consola, así que en staging cada app pide su propio ingreso. El SSO entre apps se prueba en prod con dominio propio.
- **Sí:** rewrite de `/v1` en Vercel hacia Railway. Decisión del usuario. Mismo origen, sin CORS, y el mismo `apiUrl: '/v1'` que en local; `ORIGENES_PERMITIDOS` queda vacío en staging.
- **Sí:** GitHub Actions controla el orden (imágenes, migraciones, deploy, humo). Decisión del usuario. Así ninguna versión nueva arranca antes de su migración. Railway y Vercel no hacen autodeploy desde Git.
- **Sí:** el pipeline corre `manifiesto:aplicar:remoto` y `plataforma:sembrar:remoto`, que son idempotentes. Decisión del usuario. El correo del administrador va en la variable `STAGING_ADMIN_CORREO` del Environment.
- **Sí:** se despliega después de que el CI pasa (`workflow_run`), no en paralelo con él.
- **Sí:** gitleaks para TR-RNF-113. No requiere cuenta y corre en el runner.
- **No:** `deploy-prod.yml`, Supabase Pro, respaldos ni runbook de producción. Son de P-01.
- **No:** copia anonimizada de SazónPOS en staging. Va con el ensayo de migración (CC-10).
- **No:** escaneo semanal por regex de TR-RNF-111 como tarea programada. Por ahora lo cubre la prueba del paso 3; el job programado va con P-01.
- **No:** separar staging en dos specs. Se propuso, y el usuario prefirió uno.

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| La autoinstrumentación no engancha `pg` o Nest en ESM y las trazas salen sin spans de base | Se carga con `--import`, con el hook ESM que pida la versión de OTel. La prueba del paso 4 exige el span HTTP; la verificación en staging exige el de `pg`. Si falta, se agrega `import-in-the-middle` según la documentación. |
| `@opentelemetry/instrumentation-nestjs-core` 0.72 solo admite `@nestjs/core` < 12 (visto al implementar el paso 4): con Nest 12 no hay spans de controlador | Decisión del usuario: queda registrada y se activa sola cuando upstream admita Nest 12. Mientras tanto el span HTTP lleva la ruta, el estado y `tenant.id`. Al subir la versión de la instrumentación se revisa que aparezcan. |
| TypeORM o el pooler de Supabase generan spans de `pg` muy ruidosos (`SET LOCAL`, `set_config`) | Se acepta en staging. Si molesta, se filtran con `requestHook` o `ignoreSpan` de la instrumentación de `pg`. |
| El bundle de esbuild rompe la instrumentación de algún paquete | `packages: 'external'` deja `node_modules` fuera. Si un paquete instrumentado entra al bundle por alias, se declara externo. |
| La cuota gratuita de Grafana Cloud o Sentry se agota con el 100 % de muestreo | Staging tiene poco tráfico. Se revisa el uso al cerrar el spec y se baja `OTEL_TRACES_SAMPLER_ARG` si hace falta. |
| Railway no puede descargar imágenes privadas de GHCR | Se configuran credenciales de registro en Railway. Si no se puede, se publica el paquete como público: no lleva secretos, porque el `.dockerignore` excluye `.env*` y `docker history` se revisa en el paso 6. |
| Supabase Free pausa staging y el deploy o el ensayo fallan | El humo falla de forma visible. `docs/ops/staging.md` explica cómo reactivarlo. El plan del usuario decide si pasa a pago. |
| Dev y staging en Free, más prod en Pro, superan el límite de 2 proyectos Free de la organización | Se confirma en supabase.com/pricing al crear staging. Si no entra, el usuario decide entre otra organización o pagar staging. |
| `sembrar-plataforma` invita al administrador en cada deploy | Al ser idempotente, no reinvita si el usuario ya existe. Se verifica en el segundo deploy; si reinvita, el paso de siembra se corre solo con `workflow_dispatch`. |
| `onboarding@resend.dev` solo entrega a la cuenta dueña de Resend | El administrador de staging usa ese correo. Para más personas, dominio verificado (fuera de alcance). |
| Una migración rompe staging a mitad del pipeline | No se despliega (el job `desplegar` depende de `migrar`). Se revierte con `db:down:remoto` según `docs/ops/staging.md`. |
| Logs de librerías de terceros con datos personales (por ejemplo, errores de `pg` con valores de parámetros) | La redacción cubre los campos conocidos. La instrumentación de `pg` no registra parámetros (opción por defecto, se confirma). La verificación en staging revisa una muestra de logs. |

## Lo que **no** está en este spec

- Observabilidad de negocio TR-OBS (TR-RF-106 a 110, TR-RNF-126/127, esquema `obs.*`): R3.
- Alertas de producción, Supabase Pro, respaldos, `deploy-prod.yml` y runbook de producción: P-01.
- Sentry y RUM en los frontends.
- Dominio propio, DNS y SSO por cookie compartida entre apps en staging.
- Pruebas k6 de TR-RNF-001 y monitoreo sintético por minuto de TR-RNF-005.
- E2E en staging (Q-01) y copia anonimizada para el ensayo de migración (CC-10, spec 23).
- Purga del outbox y de procesados.
