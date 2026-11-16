# 1 Arquitectura

## A-01 — Contexto del sistema (C4 nivel 1)

PsicoAgenda y la plataforma transversal en su entorno: quiénes los usan y con qué sistemas externos se integran. La plataforma provee identidad, organización, cobros, comprobantes, notificaciones y contenidos; PsicoAgenda aporta el dominio clínico y de agenda.

```mermaid
flowchart LR
  subgraph USR["Personas"]
    U1(["Director del centro"]):::actor
    U2(["Psicólogo"]):::actor
    U3(["Recepcionista"]):::actor
    U4(["Paciente / apoderado"]):::actor
    U5(["Visitante del sitio"]):::actor
    U6(["Equipo de plataforma<br/>soporte y operación"]):::actor
  end
  PSI["PsicoAgenda<br/>agenda, historia psicológica, sesiones,<br/>telepsicología, paquetes, portal y sitio público"]:::psi
  PLAT["Plataforma transversal<br/>organización · seguridad · catálogos · personas ·<br/>comprobantes · pagos · notificaciones · CMS · soporte"]:::trans
  subgraph EXT["Sistemas externos"]
    E1["Proveedor de identidad<br/>Supabase Auth / Keycloak"]:::ext
    E2["PSE / OSE → SUNAT"]:::ext
    E3["Pasarela de pagos<br/>tarjeta · Yape"]:::ext
    E4["WhatsApp Business API<br/>SMS · correo"]:::ext
    E5["Servicio de videollamada"]:::ext
    E6["RENIEC / SUNAT padrón<br/>vía proveedor"]:::ext
    E7["Proveedor de IA"]:::ext
  end
  U1 & U2 & U3 --> PSI
  U4 & U5 --> PSI
  U6 --> PLAT
  PSI <--> PLAT
  PLAT --> E1 & E2 & E3 & E4 & E6
  PSI --> E5 & E7

  classDef app fill:#e8eef9,stroke:#3c5a99,color:#123;
  classDef trans fill:#ede7f6,stroke:#5e35b1,color:#123;
  classDef psi fill:#d5f5f0,stroke:#0f766e,color:#123;
  classDef dato fill:#d9f2e3,stroke:#2e7d4f,color:#123;
  classDef ext fill:#eeeeee,stroke:#616161,color:#123,stroke-dasharray: 4 3;
  classDef infra fill:#fff4d6,stroke:#b8860b,color:#123;
  classDef actor fill:#fde8d7,stroke:#c2410c,color:#123;
  classDef dec fill:#fff4d6,stroke:#b8860b,color:#123;
  classDef no fill:#f8d7da,stroke:#a3303b,color:#123;
  classDef si fill:#d9f2e3,stroke:#2e7d4f,color:#123;
```

## A-02 — Arquitectura backend y stack tecnológico

Contenedores del sistema. Los frontends Angular se publican en un CDN; la API es un monolito modular NestJS que contiene los módulos de plataforma y los de PsicoAgenda; un worker separado procesa colas (outbox, notificaciones, recordatorios, comprobantes, IA). PostgreSQL de Supabase con un esquema por módulo y RLS por tenant; Redis para colas, caché de permisos y Socket.IO.

```mermaid
flowchart TB
  subgraph CLI["Clientes"]
    direction LR
    B1["psi-backoffice<br/>Angular 19 SPA"]:::app
    B2["psi-web<br/>Angular 19 SSR"]:::app
    B3["psi-profesional<br/>Angular 19 PWA"]:::app
    B4["plataforma-consola<br/>Angular 19 SPA"]:::app
  end
  CDN["CDN / hosting de frontends<br/>Vercel · SSR en Node para psi-web"]:::infra
  subgraph RUN["Contenedores de aplicación (Railway / Render / Fly.io)"]
    API["api · NestJS 11 · Node 22<br/>monolito modular hexagonal<br/>REST /v1 + OpenAPI · Socket.IO<br/>guard de contexto y permisos"]:::trans
    WRK["worker · NestJS 11<br/>BullMQ: outbox relay, notificaciones,<br/>recordatorios, comprobantes, IA"]:::trans
  end
  subgraph DATA["Datos (Supabase)"]
    PG[("PostgreSQL 16<br/>esquemas: org · seg · cat · cfg · seq · per · idn ·<br/>fe · pag · not · arc · aud · sync · cms · sop · obs ·<br/>agd · psi<br/>RLS por tenant · pgvector")]:::dato
    ST[("Supabase Storage<br/>adjuntos clínicos cifrados,<br/>consentimientos, PDF, media del CMS")]:::dato
    RD[("Redis<br/>colas BullMQ · caché de permisos ·<br/>bloqueos de horario · adaptador Socket.IO")]:::dato
  end
  IDP["IdP · Supabase Auth o Keycloak<br/>OIDC · MFA · Google"]:::ext
  subgraph EXT["Integraciones"]
    direction LR
    X1["PSE/OSE"]:::ext
    X2["Pasarela de pagos"]:::ext
    X3["WhatsApp BSP · SMS · SMTP"]:::ext
    X4["Videollamada"]:::ext
    X5["Proveedor IA"]:::ext
    X6["RENIEC / SUNAT"]:::ext
  end
  OBS["OpenTelemetry Collector →<br/>Grafana Cloud · Sentry"]:::infra
  CLI --> CDN
  CLI -- "HTTPS · JWT · X-Sucursal-Id" --> API
  CLI -. login OIDC .-> IDP
  API -- valida JWT --> IDP
  API --> PG & ST & RD
  WRK --> PG & RD & ST
  API -- webhooks firmados --> X2
  WRK --> X1 & X3 & X5
  API --> X4 & X6
  API & WRK -. trazas · logs · métricas .-> OBS

  classDef app fill:#e8eef9,stroke:#3c5a99,color:#123;
  classDef trans fill:#ede7f6,stroke:#5e35b1,color:#123;
  classDef psi fill:#d5f5f0,stroke:#0f766e,color:#123;
  classDef dato fill:#d9f2e3,stroke:#2e7d4f,color:#123;
  classDef ext fill:#eeeeee,stroke:#616161,color:#123,stroke-dasharray: 4 3;
  classDef infra fill:#fff4d6,stroke:#b8860b,color:#123;
  classDef actor fill:#fde8d7,stroke:#c2410c,color:#123;
  classDef dec fill:#fff4d6,stroke:#b8860b,color:#123;
  classDef no fill:#f8d7da,stroke:#a3303b,color:#123;
  classDef si fill:#d9f2e3,stroke:#2e7d4f,color:#123;
```

## A-03 — Backend: módulos del monolito y reglas de dependencia

Dentro de la API, cada módulo es una librería Nx con arquitectura hexagonal (dominio, aplicación, infraestructura, interfaz). Los módulos de PsicoAgenda dependen de los de plataforma solo a través de sus puertos públicos (API de aplicación o eventos), nunca de sus tablas. Las reglas se verifican con enforce-module-boundaries en CI.

```mermaid
flowchart LR
  subgraph APPS["apps (deployables)"]
    direction LR
    A1["apps/api<br/>main.ts · AppModule<br/>compone módulos"]:::app
    A2["apps/worker<br/>procesadores BullMQ"]:::app
  end
  subgraph PSIM["libs/psi · dominio PsicoAgenda"]
    direction LR
    P1["psi-agenda<br/>servicios, horarios, citas,<br/>reserva en línea, lista de espera"]:::psi
    P2["psi-clinica<br/>pacientes, consentimientos, historia,<br/>notas, planes, evaluaciones, derivaciones"]:::psi
    P3["psi-cobros<br/>cobros, paquetes, saldo, reembolsos"]:::psi
    P4["psi-tele<br/>salas virtuales y conexiones"]:::psi
    P5["psi-portal<br/>API del portal del paciente"]:::psi
    P6["psi-ia<br/>casos de IA clínica"]:::psi
  end
  subgraph NUC["libs/nucleo"]
    N1["nucleo-agenda (NU-AGE)<br/>recursos, disponibilidad, reservas"]:::trans
  end
  subgraph PLAT["libs/plataforma · componentes transversales"]
    direction LR
    T1["org · seg · cat · cfg · seq"]:::trans
    T2["per · idn · arc · aud"]:::trans
    T3["fe · pag · not"]:::trans
    T4["evt (outbox) · cms · sop · obs · ia"]:::trans
  end
  K["libs/plataforma/kernel<br/>AggregateRoot · DomainEvent · UnitOfWork ·<br/>TenantContext · Clock · IdGenerator"]:::dato
  A1 --> PSIM & PLAT
  A2 --> PSIM & PLAT
  PSIM -- "puertos públicos /<br/>eventos" --> PLAT
  P1 --> N1
  PSIM --> K
  NUC --> K
  PLAT --> K
  PLAT -. "prohibido: plataforma → psi" .-x PSIM

  classDef app fill:#e8eef9,stroke:#3c5a99,color:#123;
  classDef trans fill:#ede7f6,stroke:#5e35b1,color:#123;
  classDef psi fill:#d5f5f0,stroke:#0f766e,color:#123;
  classDef dato fill:#d9f2e3,stroke:#2e7d4f,color:#123;
  classDef ext fill:#eeeeee,stroke:#616161,color:#123,stroke-dasharray: 4 3;
  classDef infra fill:#fff4d6,stroke:#b8860b,color:#123;
  classDef actor fill:#fde8d7,stroke:#c2410c,color:#123;
  classDef dec fill:#fff4d6,stroke:#b8860b,color:#123;
  classDef no fill:#f8d7da,stroke:#a3303b,color:#123;
  classDef si fill:#d9f2e3,stroke:#2e7d4f,color:#123;
```

## A-04 — Backend: capas hexagonales de un módulo (psi-agenda)

Estructura interna de un módulo de PsicoAgenda. El dominio no depende de NestJS ni de TypeORM. Los casos de uso orquestan agregados y usan puertos; la infraestructura implementa los puertos (repositorios TypeORM, adaptadores a plataforma) y la interfaz expone controladores y consumidores de eventos.

```mermaid
flowchart TB
  subgraph IF["interface"]
    C1["CitasController<br/>@Permiso('psi.cita.crear')"]:::app
    C2["ReservaPublicaController<br/>@Public · rate limit"]:::app
    C3["PagoConfirmadoHandler<br/>(evento pag.pago.confirmado)"]:::app
  end
  subgraph AP["application"]
    U1["ReservarCitaUseCase"]:::psi
    U2["CancelarCitaUseCase"]:::psi
    U3["ConfirmarPagoReservaUseCase"]:::psi
    PT1["CitaRepository (puerto)"]:::psi
    PT2["DisponibilidadPort"]:::psi
    PT3["CobroPort · NotificacionPort"]:::psi
  end
  subgraph DM["domain"]
    D1["Cita (agregado)<br/>reservar · confirmar · reprogramar ·<br/>cancelar · marcarAtendida · marcarInasistencia"]:::dato
    D2["Servicio · Profesional ·<br/>PoliticaCancelacion"]:::dato
    D3["RangoHorario · Dinero ·<br/>EstadoCita (VO)"]:::dato
    D4["CitaReservada · CitaCancelada<br/>(eventos de dominio)"]:::dato
  end
  subgraph IN["infrastructure"]
    I1["TypeOrmCitaRepository<br/>esquema psi · EXCLUDE gist"]:::trans
    I2["NucleoAgendaAdapter → NU-AGE"]:::trans
    I3["PagosAdapter → TR-PAG<br/>NotificacionesAdapter → TR-NOT"]:::trans
    I4["OutboxEventPublisher → sync.outbox"]:::trans
  end
  C1 & C2 --> U1
  C3 --> U3
  U1 & U2 & U3 --> DM
  U1 --> PT1 & PT2 & PT3
  I1 -. implementa .-> PT1
  I2 -. implementa .-> PT2
  I3 -. implementa .-> PT3
  U1 --> I4

  classDef app fill:#e8eef9,stroke:#3c5a99,color:#123;
  classDef trans fill:#ede7f6,stroke:#5e35b1,color:#123;
  classDef psi fill:#d5f5f0,stroke:#0f766e,color:#123;
  classDef dato fill:#d9f2e3,stroke:#2e7d4f,color:#123;
  classDef ext fill:#eeeeee,stroke:#616161,color:#123,stroke-dasharray: 4 3;
  classDef infra fill:#fff4d6,stroke:#b8860b,color:#123;
  classDef actor fill:#fde8d7,stroke:#c2410c,color:#123;
  classDef dec fill:#fff4d6,stroke:#b8860b,color:#123;
  classDef no fill:#f8d7da,stroke:#a3303b,color:#123;
  classDef si fill:#d9f2e3,stroke:#2e7d4f,color:#123;
```

## A-05 — Frontend de PsicoAgenda: aplicaciones y librerías

Tres aplicaciones Angular del monorepo, cada una compilada y desplegada por separado, que comparten librerías: el sistema de diseño, el shell autenticado, la seguridad cliente, el acceso a datos generado desde OpenAPI y los módulos de administración de plataforma que se embeben en el backoffice.

```mermaid
flowchart TB
  subgraph APPS["Aplicaciones Angular 19 (Nx)"]
    direction LR
    A1["psi-backoffice · SPA<br/>director · recepción · editor<br/>agenda, pacientes, cobros, reportes,<br/>configuración, CMS, seguridad"]:::app
    A2["psi-web · SSR + hidratación<br/>sitio público (SEO) · reserva en línea ·<br/>portal del paciente/apoderado"]:::app
    A3["psi-profesional · PWA<br/>mi agenda · historia · notas ·<br/>evaluaciones · sala virtual"]:::app
  end
  subgraph FPSI["libs/psi (feature + data-access)"]
    direction LR
    F1["psi/feature-agenda"]:::psi
    F2["psi/feature-pacientes"]:::psi
    F3["psi/feature-historia"]:::psi
    F4["psi/feature-cobros"]:::psi
    F5["psi/feature-reserva-publica"]:::psi
    F6["psi/feature-portal"]:::psi
    F7["psi/data-access<br/>cliente OpenAPI generado"]:::psi
  end
  subgraph FPLAT["libs/plataforma (embebibles)"]
    direction LR
    G1["plataforma/admin-cliente<br/>usuarios · roles · sucursales ·<br/>parámetros · catálogos propios"]:::trans
    G2["plataforma/cms-editor<br/>páginas · bloques · menús · SEO"]:::trans
    G3["plataforma/cms-render<br/>componentes de bloques para SSR"]:::trans
    G4["plataforma/portal-cuenta<br/>registro, acceso, consentimientos"]:::trans
    G5["plataforma/soporte-widget"]:::trans
  end
  subgraph SH["libs/shared"]
    direction LR
    S1["shared/ui · sistema de diseño<br/>Angular Material + tokens"]:::dato
    S2["shared/shell<br/>layout · menú dinámico · selector de sucursal"]:::dato
    S3["shared/auth<br/>OIDC · interceptor JWT + X-Sucursal-Id ·<br/>directiva *siPermiso · guards de ruta"]:::dato
    S4["shared/util<br/>formatos es-PE · validadores DNI/RUC"]:::dato
  end
  API["api /v1 (NestJS)"]:::ext
  A1 --> F1 & F2 & F4 & G1 & G2 & G5
  A2 --> F5 & F6 & G3 & G4
  A3 --> F1 & F3
  F1 & F2 & F3 & F4 & F5 & F6 --> F7
  FPSI & FPLAT --> SH
  F7 --> API
  G1 & G2 & G4 --> API

  classDef app fill:#e8eef9,stroke:#3c5a99,color:#123;
  classDef trans fill:#ede7f6,stroke:#5e35b1,color:#123;
  classDef psi fill:#d5f5f0,stroke:#0f766e,color:#123;
  classDef dato fill:#d9f2e3,stroke:#2e7d4f,color:#123;
  classDef ext fill:#eeeeee,stroke:#616161,color:#123,stroke-dasharray: 4 3;
  classDef infra fill:#fff4d6,stroke:#b8860b,color:#123;
  classDef actor fill:#fde8d7,stroke:#c2410c,color:#123;
  classDef dec fill:#fff4d6,stroke:#b8860b,color:#123;
  classDef no fill:#f8d7da,stroke:#a3303b,color:#123;
  classDef si fill:#d9f2e3,stroke:#2e7d4f,color:#123;
```

## A-06 — Frontend de la plataforma transversal

La consola de plataforma es la aplicación del equipo dueño del producto (tenants, suscripciones, catálogos globales, soporte, observabilidad). La administración que usa cada cliente no es una aplicación aparte: son librerías que se embeben en el backoffice de cada producto, para que el cliente no cambie de sistema.

```mermaid
flowchart TB
  C["plataforma-consola · SPA<br/>(equipo de plataforma)"]:::app
  subgraph CF["libs/plataforma/consola-*"]
    direction LR
    c1["tenants y suscripciones<br/>alta asistida, planes, estado"]:::trans
    c2["catálogos globales y<br/>tablas maestras"]:::trans
    c3["centro de soporte<br/>bandeja, SLA, problemas"]:::trans
    c4["salud por cliente<br/>alertas · observabilidad de negocio"]:::trans
    c5["eventos fallidos ·<br/>integridad de auditoría"]:::trans
  end
  subgraph EMB["libs/plataforma embebibles (en cada <producto>-backoffice)"]
    direction LR
    e1["admin-cliente"]:::trans
    e2["cms-editor"]:::trans
    e3["comprobantes · series"]:::trans
    e4["notificaciones · plantillas"]:::trans
    e5["soporte-widget"]:::trans
  end
  B1["psi-backoffice"]:::psi
  B2["rest-backoffice"]:::app
  B3["… otros backoffice"]:::app
  SH["libs/shared · ui · shell · auth · util"]:::dato
  API["api /v1 · módulos de plataforma"]:::ext
  C --> CF
  B1 & B2 & B3 --> EMB
  CF & EMB --> SH
  CF & EMB --> API

  classDef app fill:#e8eef9,stroke:#3c5a99,color:#123;
  classDef trans fill:#ede7f6,stroke:#5e35b1,color:#123;
  classDef psi fill:#d5f5f0,stroke:#0f766e,color:#123;
  classDef dato fill:#d9f2e3,stroke:#2e7d4f,color:#123;
  classDef ext fill:#eeeeee,stroke:#616161,color:#123,stroke-dasharray: 4 3;
  classDef infra fill:#fff4d6,stroke:#b8860b,color:#123;
  classDef actor fill:#fde8d7,stroke:#c2410c,color:#123;
  classDef dec fill:#fff4d6,stroke:#b8860b,color:#123;
  classDef no fill:#f8d7da,stroke:#a3303b,color:#123;
  classDef si fill:#d9f2e3,stroke:#2e7d4f,color:#123;
```

## A-07 — ¿Monorepo o microfrontends?

Un monorepo no implica microfrontends. Monorepo es dónde vive el código (un solo repositorio con muchas aplicaciones y librerías); microfrontends es cómo se compone la interfaz en tiempo de ejecución (varias aplicaciones desplegadas por separado que se cargan dentro de otra). Para un equipo de una o dos personas se recomienda monorepo con aplicaciones independientes y librerías compartidas, sin federación en tiempo de ejecución.

```mermaid
flowchart TB
  Q1{"¿Hay varios equipos que necesitan<br/>desplegar partes de UNA misma pantalla<br/>con ciclos de versión distintos?"}:::dec
  Q2{"¿Una aplicación crece a un tamaño<br/>que hace lenta la compilación<br/>aun con caché de Nx?"}:::dec
  R1["Monorepo Nx con aplicaciones independientes<br/>+ librerías compartidas (RECOMENDADO HOY)<br/>· cada app se compila y despliega sola<br/>· el código común se comparte en compilación<br/>· nx affected solo construye lo que cambió"]:::si
  R2["Microfrontends con Module Federation /<br/>Native Federation (Nx lo soporta)<br/>· remotos cargados en tiempo de ejecución<br/>· versionado y contratos entre remotos<br/>· más complejidad de despliegue y pruebas"]:::no
  R3["Partir en lazy loading y librerías buildables;<br/>evaluar federación solo si persiste"]:::dec
  Q1 -- "No (equipo de 1–2)" --> Q2
  Q1 -- "Sí" --> R2
  Q2 -- "No" --> R1
  Q2 -- "Sí" --> R3
  R3 -.-> R2

  classDef app fill:#e8eef9,stroke:#3c5a99,color:#123;
  classDef trans fill:#ede7f6,stroke:#5e35b1,color:#123;
  classDef psi fill:#d5f5f0,stroke:#0f766e,color:#123;
  classDef dato fill:#d9f2e3,stroke:#2e7d4f,color:#123;
  classDef ext fill:#eeeeee,stroke:#616161,color:#123,stroke-dasharray: 4 3;
  classDef infra fill:#fff4d6,stroke:#b8860b,color:#123;
  classDef actor fill:#fde8d7,stroke:#c2410c,color:#123;
  classDef dec fill:#fff4d6,stroke:#b8860b,color:#123;
  classDef no fill:#f8d7da,stroke:#a3303b,color:#123;
  classDef si fill:#d9f2e3,stroke:#2e7d4f,color:#123;
```

## A-08 — Reglas de dependencia entre proyectos del monorepo

Etiquetas de Nx que controla enforce-module-boundaries: por tipo (app → feature → ui / data-access → util) y por alcance (psi solo usa psi, nucleo, plataforma y shared; plataforma nunca usa psi). Así el piloto deja lista la base que reutilizarán los otros ocho productos.

```mermaid
flowchart LR
  subgraph TIPO["type:*"]
    direction TB
    t1["type:app"]:::app --> t2["type:feature"]:::psi
    t2 --> t3["type:ui"]:::dato
    t2 --> t4["type:data-access"]:::trans
    t3 --> t5["type:util"]:::infra
    t4 --> t5
    t2 --> t6["type:domain (backend)"]:::dato
    t4 --> t6
  end
  subgraph SCOPE["scope:*"]
    direction TB
    s1["scope:psi"]:::psi --> s2["scope:nucleo"]:::trans
    s1 --> s3["scope:plataforma"]:::trans
    s2 --> s4["scope:shared"]:::dato
    s3 --> s4
    s1 --> s4
    s3 -. prohibido .-x s1
  end

  classDef app fill:#e8eef9,stroke:#3c5a99,color:#123;
  classDef trans fill:#ede7f6,stroke:#5e35b1,color:#123;
  classDef psi fill:#d5f5f0,stroke:#0f766e,color:#123;
  classDef dato fill:#d9f2e3,stroke:#2e7d4f,color:#123;
  classDef ext fill:#eeeeee,stroke:#616161,color:#123,stroke-dasharray: 4 3;
  classDef infra fill:#fff4d6,stroke:#b8860b,color:#123;
  classDef actor fill:#fde8d7,stroke:#c2410c,color:#123;
  classDef dec fill:#fff4d6,stroke:#b8860b,color:#123;
  classDef no fill:#f8d7da,stroke:#a3303b,color:#123;
  classDef si fill:#d9f2e3,stroke:#2e7d4f,color:#123;
```

## A-09 — Despliegue y entornos

Tres entornos con la misma topología. GitHub Actions ejecuta nx affected (lint, pruebas, build, límites de módulos), publica las imágenes de api y worker y despliega los frontends. Las migraciones de base de datos se aplican en el pipeline con verificación previa en staging.

```mermaid
flowchart LR
  DEV["Desarrollador<br/>rama feature/*"]:::actor --> GH["GitHub<br/>pull request"]:::ext
  GH --> CI["GitHub Actions<br/>nx affected: lint · test · build ·<br/>enforce-module-boundaries · OpenAPI diff"]:::infra
  CI --> IMG["Imágenes Docker<br/>api · worker"]:::infra
  CI --> FE["Build de frontends<br/>psi-backoffice · psi-web · psi-profesional ·<br/>plataforma-consola"]:::infra
  subgraph STG["staging"]
    S1["api + worker"]:::trans
    S2["Supabase staging"]:::dato
    S3["Vercel preview"]:::app
  end
  subgraph PRD["producción"]
    P1["api + worker (2+ instancias)"]:::trans
    P2["Supabase producción<br/>respaldos diarios · PITR"]:::dato
    P3["Vercel producción<br/>dominios por tenant"]:::app
  end
  IMG --> S1
  FE --> S3
  CI -- "migraciones" --> S2
  S1 -- "aprobación manual" --> P1
  S2 -- "migraciones verificadas" --> P2
  S3 --> P3

  classDef app fill:#e8eef9,stroke:#3c5a99,color:#123;
  classDef trans fill:#ede7f6,stroke:#5e35b1,color:#123;
  classDef psi fill:#d5f5f0,stroke:#0f766e,color:#123;
  classDef dato fill:#d9f2e3,stroke:#2e7d4f,color:#123;
  classDef ext fill:#eeeeee,stroke:#616161,color:#123,stroke-dasharray: 4 3;
  classDef infra fill:#fff4d6,stroke:#b8860b,color:#123;
  classDef actor fill:#fde8d7,stroke:#c2410c,color:#123;
  classDef dec fill:#fff4d6,stroke:#b8860b,color:#123;
  classDef no fill:#f8d7da,stroke:#a3303b,color:#123;
  classDef si fill:#d9f2e3,stroke:#2e7d4f,color:#123;
```
