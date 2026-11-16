# Diagramas de staging y observabilidad (spec 21)

Fuente: `specs/21-obs-y-staging.md`, `docs/ops/staging.md`, `.github/workflows/deploy-staging.yml`. Cada diagrama tiene su `.mmd` en esta carpeta.

## ST-01 — Despliegue de staging (spec 21 · E-04)

```mermaid
flowchart LR
  U["Navegador<br/>usuario de staging"]:::app

  subgraph VER["Vercel · Hobby"]
    ADM["vitrina-admin-staging<br/>plataforma-admin · Angular 21<br/>vercel.json: /v1/* a la api + fallback SPA"]:::app
    CON["vitrina-consola-staging<br/>plataforma-consola · Angular 21<br/>vercel.json: /v1/* a la api + fallback SPA"]:::app
  end

  subgraph RWY["Railway · proyecto vitrina-staging"]
    API["Servicio api<br/>imagen GHCR api:staging · distroless Node 24<br/>puerto 3000 · healthcheck /v1/salud · 2 réplicas"]:::rest
    WRK["Servicio worker<br/>imagen GHCR worker:staging<br/>sin dominio público"]:::rest
    RDS[("Redis<br/>caché de permisos · BullMQ<br/>bloqueo de ingreso")]:::dato
  end

  subgraph SUP["Supabase staging · us-east-2"]
    PG[("PostgreSQL 16<br/>org · seg · cfg · seq · sync · cat · aud<br/>pooler transaccional 6543")]:::dato
    AUTH["Supabase Auth<br/>JWT ES256 · JWKS · hook de token<br/>Data API solo public"]:::ext
  end

  subgraph OBS["Observabilidad"]
    GRA["Grafana Cloud · US<br/>Tempo · Prometheus · Loki<br/>alerta outbox atrasado"]:::ext
    SEN["Sentry<br/>vitrina-api · vitrina-worker"]:::ext
  end

  RES["Resend · SMTP<br/>invitaciones y recuperación"]:::ext

  U -->|HTTPS| ADM & CON
  U -->|login · MFA| AUTH
  ADM & CON -->|"rewrite /v1 · mismo origen, sin CORS"| API
  API -->|"SQL · SET LOCAL app.tenant_id"| PG
  API -->|JWKS| AUTH
  API --> RDS
  WRK -->|"relay outbox · tareas"| PG
  WRK --> RDS
  AUTH -->|correo| RES
  API & WRK -->|"OTLP: trazas, métricas, logs"| GRA
  API & WRK -->|"errores 5xx y trabajos fallidos"| SEN

  classDef app fill:#e8eef9,stroke:#3c5a99,color:#123;
  classDef rest fill:#fde8d7,stroke:#c2410c,color:#123;
  classDef dato fill:#d9f2e3,stroke:#2e7d4f,color:#123;
  classDef ext fill:#eeeeee,stroke:#616161,color:#123,stroke-dasharray: 4 3;
```

## ST-02 — Componentes de observabilidad en api y worker (spec 21 · E-03)

```mermaid
flowchart TB
  subgraph ARR["Arranque del proceso: node --import registrar-hooks.js --import instrumentacion.js dist/main.js"]
    HK["registrar-hooks.ts<br/>hook ESM de OpenTelemetry<br/>solo si hay OTEL_EXPORTER_OTLP_ENDPOINT"]:::infra
    INS["instrumentacion.ts<br/>iniciarTelemetria({ servicio })"]:::infra
    HK --> INS
  end

  subgraph LARR["libs/plataforma/observabilidad-arranque · comp:obs"]
    TEL["telemetria.ts<br/>NodeSDK: trazas, métricas y logs OTLP<br/>autoinstrumentación http · nestjs-core · pg · ioredis · pino"]:::trans
    SNT["sentry.ts<br/>iniciarSentry · enableOpenTelemetrySetup: false<br/>limpiarEventoSentry: sin body, cookies ni Authorization"]:::trans
    AMB["ambiente.ts<br/>esquemaAmbiente (zod)"]:::trans
  end

  subgraph LOBS["libs/plataforma/observabilidad · comp:obs"]
    subgraph DOM["domain"]
      RED["campos-redactados.ts<br/>RUTAS_REDACTADAS"]:::dom
      HAS["hash-documento.ts<br/>hashDocumento(numero, sal)"]:::dom
    end
    subgraph INF["infrastructure"]
      LOG["logger.pino.ts<br/>redact · ruta sin query<br/>mixin trace_id, span_id, tenant, sucursal, usuario"]:::trans
      REP["reportador-errores.sentry.ts"]:::trans
      MET["metricas-outbox.ts<br/>vitrina_outbox_pendientes · fallidos · edad_pendiente_seg"]:::trans
      ENT["entorno-observabilidad.ts<br/>APP_ENV · LOG_LEVEL · OBS_SAL_DOCUMENTO"]:::trans
    end
    subgraph INT["interface"]
      MOD["ObservabilidadModule.register<br/>LoggerModule nestjs-pino + REPORTADOR_ERRORES"]:::trans
    end
  end

  subgraph KI["libs/plataforma/kernel-infra"]
    PRT["Puerto ReportadorErrores<br/>no-op por defecto"]:::infra
    FIL["HttpExceptionFilter<br/>5xx: reportar(error)"]:::infra
    ALS["AlsTenantContext.run<br/>anotarSpanActivo: tenant.id, sucursal.id, usuario.id<br/>traceIdActivo()"]:::infra
  end

  subgraph APPS["Aplicaciones"]
    API["apps/api<br/>AppModule"]:::app
    WRK["apps/worker<br/>WorkerModule · relay · auditoría · importaciones<br/>vencimientos · soporte"]:::app
  end

  DB[("sync.estado_outbox()<br/>SECURITY DEFINER<br/>db/01h_obs_estado_outbox.sql")]:::dato

  INS --> TEL --> SNT
  TEL --> AMB
  ENT -. usa .-> AMB
  API & WRK --> MOD
  MOD --> LOG & REP
  LOG --> RED
  REP -. implementa .-> PRT
  FIL --> PRT
  API --> FIL
  WRK -->|"Worker BullMQ failed"| REP
  WRK --> MET --> DB
  LOG -. lee .-> ALS

  classDef app fill:#e8eef9,stroke:#3c5a99,color:#123;
  classDef trans fill:#ede7f6,stroke:#5e35b1,color:#123;
  classDef dom fill:#d5f5f0,stroke:#0f766e,color:#123;
  classDef infra fill:#fff4d6,stroke:#b8860b,color:#123;
  classDef dato fill:#d9f2e3,stroke:#2e7d4f,color:#123;
```

## ST-03 — Pipeline de entrega a staging (deploy-staging.yml · spec 21)

```mermaid
flowchart LR
  PR["PR a main"]:::ini --> CI["ci.yml<br/>lint · test · build<br/>secretos: gitleaks"]:::tarea
  CI -->|"workflow_run success en main<br/>o workflow_dispatch"| REV

  subgraph DEP["deploy-staging.yml · Environment staging · concurrencia sin cancelar"]
    REV["revisar<br/>falla si queda PENDIENTE en<br/>environment.staging.ts o vercel.json"]:::dec
    IMG["imagenes<br/>docker build multietapa<br/>push GHCR api y worker<br/>etiquetas sha y staging"]:::tarea
    MIG["migrar<br/>db:up:supabase:remoto · db:up:remoto<br/>manifiesto:aplicar:remoto<br/>plataforma:sembrar:remoto"]:::tarea
    DES["desplegar<br/>Railway CLI redeploy<br/>api y worker"]:::tarea
    FRO["frontends<br/>vercel pull · build --prod<br/>deploy --prebuilt --prod<br/>admin y consola"]:::tarea
    HUM["humo<br/>api /v1/salud 200<br/>admin /v1/salud 200 por rewrite<br/>raíz de cada app text/html"]:::fin
    REV --> IMG --> MIG
    MIG --> DES & FRO
    DES & FRO --> HUM
  end

  IMG -.-> GHCR[("GHCR")]:::ext
  MIG -.->|"Session pooler 5432"| SUP[("Supabase staging")]:::ext
  DES -.-> RWY["Railway"]:::ext
  GHCR -.->|"pull imagen"| RWY
  FRO -.-> VER["Vercel"]:::ext

  classDef ini fill:#d9f2e3,stroke:#2e7d4f,color:#123;
  classDef tarea fill:#e8eef9,stroke:#3c5a99,color:#123;
  classDef dec fill:#fff4d6,stroke:#b8860b,color:#123;
  classDef fin fill:#f8d7da,stroke:#a3303b,color:#123;
  classDef ext fill:#eeeeee,stroke:#616161,color:#123,stroke-dasharray: 4 3;
```

## ST-04 — Secuencia: solicitud trazada de punta a punta en staging (spec 21)

```mermaid
sequenceDiagram
  autonumber
  actor U as Usuario
  participant V as Vercel (admin)
  participant A as api (Railway)
  participant R as Redis
  participant P as PostgreSQL (Supabase)
  participant G as Grafana Cloud
  participant S as Sentry

  U->>V: GET /v1/seg/roles + Bearer
  V->>A: rewrite a https://api…railway.app/v1/seg/roles
  Note over A: autoinstrumentación http abre el span raíz<br/>AlsTenantContext.run anota tenant.id, sucursal.id, usuario.id
  A->>R: get permisos efectivos (span ioredis)
  R-->>A: hit o miss
  A->>P: START · SET LOCAL app.tenant_id · SELECT · COMMIT (spans pg)
  P-->>A: filas
  A-->>V: 200 JSON
  V-->>U: 200
  A--)G: span y métricas http_server_request_duration por OTLP
  A--)G: log pino "request completed" con trace_id (Loki)
  alt error 5xx
    A->>A: HttpExceptionFilter llama ReportadorErrores.reportar
    A--)S: issue con environment=staging y trace_id, sin body, cookies ni Authorization
  end

  Note over G: Worker: cada lectura de sync.estado_outbox() publica<br/>vitrina_outbox_edad_pendiente_seg. Alerta si > 60 s por 5 min o sin datos
```
