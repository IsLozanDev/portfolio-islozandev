# Plan de implementación de la plataforma transversal

## PL-01 — Hoja de ruta de releases

Cada release termina en producción con un consumidor real. R1 pone a SazónPOS sobre la seguridad y los datos de referencia de la plataforma; R2 agrega facturación electrónica para que SazónPOS sea vendible; R3 deja lista la plataforma para PsicoAgenda; R4 queda como backlog priorizable.

```mermaid
flowchart LR
  R0["R0 · Fundaciones<br/>monorepo Nx · CI · Supabase<br/>kernel · kernel-infra"]:::infra
  R1["R1 · Seguridad y organización<br/>TR-ORG · TR-SEG (Supabase Auth)<br/>TR-CFG · TR-SEQ · TR-CAT<br/>TR-AUD · TR-EVT · TR-OBS base<br/>SazónPOS CC-01..CC-08, CC-10"]:::trans
  R2["R2 · Facturación y personas<br/>TR-PER · TR-IDN · TR-ARC<br/>TR-FE · TR-NOT · ARCO<br/>SazónPOS CC-06, CC-09"]:::trans
  R3["R3 · Plataforma para PsicoAgenda<br/>TR-PAG · TR-REP · TR-CMS<br/>TR-POR · TR-SOP · TR-OBS negocio<br/>WhatsApp"]:::trans
  R4["R4 · Backlog 2028<br/>TR-IA · TR-INT · TR-EDGE<br/>identidad portable · conciliación<br/>cobro de suscripciones"]:::ext
  R0 --> R1 --> R2 --> R3 --> R4
  H1(["06/04/27<br/>producción R1"]):::hito
  H2(["30/06/27<br/>producción R2"]):::hito
  H3(["05/10/27<br/>producción R3"]):::hito
  R1 -.- H1
  R2 -.- H2
  R3 -.- H3

  classDef app fill:#e8eef9,stroke:#3c5a99,color:#123;
  classDef trans fill:#ede7f6,stroke:#5e35b1,color:#123;
  classDef rest fill:#fde8d7,stroke:#c2410c,color:#123;
  classDef dato fill:#d9f2e3,stroke:#2e7d4f,color:#123;
  classDef ext fill:#eeeeee,stroke:#616161,color:#123,stroke-dasharray: 4 3;
  classDef infra fill:#fff4d6,stroke:#b8860b,color:#123;
  classDef hito fill:#d5f5f0,stroke:#0f766e,color:#123;
```

## PL-02 — Cronograma de sprints e hitos

Sprints de dos semanas desde el 19/10/26, con 11 horas por semana. Los sprints de fin de año y Semana Santa tienen capacidad reducida. En rojo, los sprints de pase a producción.

```mermaid
%%{init: {'gantt': {'leftPadding': 330, 'rightPadding': 30, 'barHeight': 20, 'barGap': 5, 'fontSize': 12, 'sectionFontSize': 13, 'topPadding': 40}}}%%
gantt
  todayMarker off
  dateFormat YYYY-MM-DD
  axisFormat %m/%Y
  tickInterval 1month
  section R0 Fundaciones
  S00 Fundaciones :s0, 2026-10-19, 14d
  section R1 Seguridad, organización y SazónPOS
  S01 Autenticación Supabase y MFA :s1, 2026-11-02, 14d
  S02 Organización y consola :s2, 2026-11-16, 14d
  S03 Autorización y membresías :s3, 2026-11-30, 14d
  S04 Frontend de seguridad :s4, 2026-12-14, 14d
  S05 Roles · sucursales · app Administración :s5, 2026-12-28, 14d
  S06 Parámetros · correlativos · catálogos :s6, 2027-01-11, 14d
  S07 Admin de datos · auditoría · eventos :s7, 2027-01-25, 14d
  S08 Observabilidad · staging · CC-01 CC-03 CC-05 :s8, 2027-02-08, 14d
  S09 SazónPOS · Supabase Auth · modo sombra :s9, 2027-02-22, 14d
  S10 SazónPOS · catálogos · shell · E2E :s10, 2027-03-08, 14d
  S11 UAT y preparación de producción :s11, 2027-03-22, 14d
  S12 Pase a producción R1 :crit, s12, 2027-04-05, 14d
  section R2 Facturación electrónica y personas
  S13 Personas · DNI/RUC · archivos :s13, 2027-04-19, 14d
  S14 FE I · emisor · boleta · factura :s14, 2027-05-03, 14d
  S15 FE II · notas · resumen · baja :s15, 2027-05-17, 14d
  S16 Notificaciones · admin FE · CC-06 :s16, 2027-05-31, 14d
  S17 SazónPOS · FE en caja · homologación :s17, 2027-06-14, 14d
  S18 Pase a producción R2 :crit, s18, 2027-06-28, 14d
  section R3 Plataforma para PsicoAgenda
  S19 Pagos en línea · Yape/Plin :s19, 2027-07-12, 14d
  S20 Pagos II · reportes :s20, 2027-07-26, 14d
  S21 CMS · páginas · SEO :s21, 2027-08-09, 14d
  S22 CMS II · portal del cliente :s22, 2027-08-23, 14d
  S23 Centro de soporte :s23, 2027-09-06, 14d
  S24 Observabilidad de negocio · WhatsApp :s24, 2027-09-20, 14d
  S25 Pase a producción R3 :crit, s25, 2027-10-04, 14d
  section Hitos
  H0 Entornos listos 01/11/26 :milestone, H0, 2026-11-01, 0d
  H1 Seguridad completa 10/01/27 :milestone, H1, 2027-01-10, 0d
  H2 R1 en staging 21/02/27 :milestone, H2, 2027-02-21, 0d
  H3 Producción R1 06/04/27 :milestone, H3, 2027-04-06, 0d
  H4 Producción R2 30/06/27 :milestone, H4, 2027-06-30, 0d
  H5 Producción R3 05/10/27 :milestone, H5, 2027-10-05, 0d
```

## PL-03 — Autenticación con Supabase Auth y autorización propia

Supabase Auth autentica (correo y clave, Google, Microsoft, MFA TOTP) y emite un JWT firmado con llave asimétrica. El hook agrega el tenant activo. La API NestJS verifica la firma con el JWKS público, sin llamar a Supabase en cada solicitud, y autoriza con los permisos efectivos de seg por sucursal, guardados en Redis. SazónPOS lee las mismas tablas de la plataforma.

```mermaid
flowchart LR
  subgraph FE["Frontends Angular 22"]
    A1["plataforma-consola"]:::app
    A2["plataforma-admin"]:::app
    A3["SazónPOS frontend"]:::rest
    A4["psi-backoffice (R3)"]:::app
  end
  subgraph SB["Supabase"]
    AUTH["Supabase Auth<br/>login · OAuth · MFA TOTP<br/>refresh · invitaciones"]:::ext
    HOOK["Hook de token<br/>seg.custom_access_token_hook<br/>+ tenant_id · tipo_usuario"]:::dato
    JWKS["/auth/v1/.well-known/jwks.json<br/>llave pública ES256"]:::ext
    DB[("PostgreSQL<br/>org · seg · cfg · cat · seq · aud · sync")]:::dato
  end
  subgraph API["apps/api · NestJS 12"]
    G1["AutenticacionGuard<br/>verifica firma, iss, aud, exp"]:::trans
    G2["PermisoGuard<br/>tenant + X-Sucursal-Id + permiso + aal2"]:::trans
    RP["ResolverPermisosUseCase"]:::trans
  end
  RD[("Redis<br/>caché de permisos")]:::infra
  subgraph REST["SazónPOS backend (repo propio)"]
    SP["src/plataforma<br/>guard @Permiso · contexto"]:::rest
  end
  FE -- "1. credenciales / OAuth / código TOTP" --> AUTH
  AUTH -- "2. invoca" --> HOOK
  HOOK -. lee .-> DB
  AUTH -- "3. access token (JWT) + refresh" --> FE
  A1 & A2 & A4 -- "4. Bearer + X-Sucursal-Id" --> G1
  G1 -. "llaves en caché 10 min" .-> JWKS
  G1 --> G2 --> RP
  RP <--> RD
  RP -- "seg.permisos_efectivos()" --> DB
  A3 -- Bearer --> SP
  SP -. JWKS .-> JWKS
  SP -- "mismas funciones seg" --> DB

  classDef app fill:#e8eef9,stroke:#3c5a99,color:#123;
  classDef trans fill:#ede7f6,stroke:#5e35b1,color:#123;
  classDef rest fill:#fde8d7,stroke:#c2410c,color:#123;
  classDef dato fill:#d9f2e3,stroke:#2e7d4f,color:#123;
  classDef ext fill:#eeeeee,stroke:#616161,color:#123,stroke-dasharray: 4 3;
  classDef infra fill:#fff4d6,stroke:#b8860b,color:#123;
  classDef hito fill:#d5f5f0,stroke:#0f766e,color:#123;
```

## PL-04 — Secuencia: ingreso con MFA y token con tenant activo

El segundo factor se pide solo si el usuario lo tiene enrolado; para administradores de plataforma y permisos sensibles es obligatorio. El token que sale de Supabase ya trae el tenant activo; los permisos no viajan en el token.

```mermaid
sequenceDiagram
  autonumber
  actor U as Usuario
  participant W as App Angular<br/>(shared/auth)
  participant A as Supabase Auth
  participant H as Hook seg.custom_access_token_hook
  participant DB as PostgreSQL (seg, org)
  participant API as API NestJS
  U->>W: correo y clave (o Google / Microsoft)
  W->>A: signInWithPassword / signInWithOAuth (PKCE)
  A->>H: event {user_id, claims}
  H->>DB: usuario activo · membresía activa · tenant preferido
  H-->>A: claims + tenant_id + tipo_usuario
  A-->>W: access token (aal1) + refresh token en cookie del dominio
  W->>A: mfa.getAuthenticatorAssuranceLevel()
  alt tiene factor TOTP (nextLevel = aal2)
    W->>U: pide código de 6 dígitos
    U->>W: código
    W->>A: mfa.challenge + mfa.verify
    A->>H: nuevo token
    A-->>W: access token aal2
  end
  W->>API: GET /v1/seg/mi-contexto (Bearer)
  API-->>W: sucursales accesibles, menú y permisos de la sucursal elegida
  W->>U: selector de sucursal (si tiene más de una) y menú
```

## PL-05 — Secuencia: solicitud autorizada en la API

Dos guards globales. El primero valida el token localmente con el JWKS. El segundo exige tenant, sucursal asignada, el permiso del endpoint y, si el permiso es sensible, una sesión aal2. Las denegaciones se registran en seg.evento_seguridad.

```mermaid
sequenceDiagram
  autonumber
  participant W as App Angular
  participant G1 as AutenticacionGuard
  participant G2 as PermisoGuard
  participant UC as ResolverPermisosUseCase
  participant R as Redis
  participant DB as PostgreSQL
  participant C as Controlador / caso de uso
  W->>G1: POST /v1/seg/usuarios/invitar<br/>Bearer · X-Sucursal-Id
  G1->>G1: jwtVerify(ES256, iss, aud, exp) con JWKS en memoria
  alt token inválido
    G1-->>W: 401
  end
  G1->>G2: principal {usuario, tenant, aal}
  G2->>G2: ¿tenant? ¿cabecera de sucursal? ¿MFA si el permiso es sensible?
  G2->>UC: permisos(usuario, tenant, sucursal)
  UC->>R: GET perm:tenant:usuario:sucursal
  alt no está en caché
    UC->>DB: seg.sucursales_accesibles · seg.permisos_efectivos
    UC->>R: SET (60 s) + índice del tenant
  end
  alt sin permiso
    G2->>DB: evento_seguridad ACCESO_DENEGADO
    G2-->>W: 403 {codigo: SIN_PERMISO}
  else permitido
    G2->>C: req.contexto {tenant, sucursal, permisos}
    C->>DB: SET LOCAL app.tenant_id → RLS · transacción + outbox
    C-->>W: 201
  end
  Note over R,DB: Al cambiar roles o asignaciones, el evento<br/>seg.asignacion.* invalida las claves del tenant
```

## PL-06 — Secuencia: invitación de un usuario al tenant

La invitación la crea el backend con la Admin API de Supabase (secret key solo en el servidor). El trigger sobre auth.users crea seg.usuario; la membresía nace INVITADO y pasa a ACTIVO cuando el invitado acepta.

```mermaid
sequenceDiagram
  autonumber
  actor AD as Administrador del cliente
  participant API as API NestJS (seg)
  participant SA as Supabase Admin API
  participant DB as PostgreSQL
  actor I as Invitado
  participant W as App Angular
  AD->>API: invitar(correo, rol, alcance sucursal)  @Permiso plat.usuario.invitar
  API->>SA: inviteUserByEmail(correo, app_metadata.tipo_usuario = INTERNO)
  SA->>DB: INSERT auth.users
  DB->>DB: trigger → seg.usuario
  API->>DB: membresía INVITADO + asignación con vigencia + evento seg.membresia.invitada
  SA-->>I: correo con enlace
  I->>W: abre el enlace, define clave (o usa Google/Microsoft)
  W->>API: POST /v1/seg/invitaciones/aceptar
  API->>DB: membresía ACTIVO · usuario.tenant_preferido
  W->>W: refreshSession() → token con tenant_id
  Note over AD,I: Si el correo ya existe en Supabase (usuario de otro tenant),<br/>no se crea otra cuenta: solo se agrega la membresía.
```

## PL-07 — Secuencia: migración de usuarios de SazónPOS a Supabase Auth (CC-10)

Se conservan los UUID y los hash bcrypt, así que nadie cambia de clave. Durante la transición el backend de SazónPOS acepta su token actual y el de Supabase; el corte retira el emisor antiguo.

```mermaid
sequenceDiagram
  autonumber
  participant OP as Script de migración
  participant OLD as BD SazónPOS (users)
  participant SA as Supabase Admin API
  participant DB as PostgreSQL (seg)
  participant BE as Backend SazónPOS
  participant W as Frontend SazónPOS
  OP->>OLD: usuarios activos (id, correo, hash bcrypt, proveedor OAuth)
  loop por usuario
    OP->>SA: admin.createUser(id, email, password_hash, email_confirm, app_metadata)
    SA->>DB: auth.users → trigger seg.usuario
    OP->>DB: membresía ACTIVO + asignaciones (mapeo rol → rol de plataforma)
  end
  OP->>OP: informe: migrados, omitidos, OAuth a re-vincular
  Note over BE: Transición: guard acepta JWT propio (HS256 actual)<br/>y JWT de Supabase (ES256 por JWKS)
  W->>W: nuevo login con Supabase Auth (feature flag)
  W->>BE: Bearer (Supabase)
  BE-->>W: 200
  Note over BE,W: Corte: se retira el emisor propio y /auth/login.<br/>las sesiones antiguas expiran y piden ingresar de nuevo
```

## PL-08 — Integración de SazónPOS con la plataforma

SazónPOS no cambia de repositorio ni de arquitectura. Comparte el proyecto Supabase (Auth y base de datos), lee las tablas de plataforma con su módulo src/plataforma y abre la app de Administración para usuarios, roles y parámetros. La cookie en el dominio padre evita volver a ingresar.

```mermaid
flowchart TB
  subgraph R1["Repositorio vitrina (monorepo Nx)"]
    API["apps/api<br/>NestJS 12 · plataforma"]:::trans
    WK["apps/worker<br/>outbox · tareas"]:::trans
    CON["apps/plataforma-consola<br/>consola.dominio.pe"]:::app
    ADM["apps/plataforma-admin<br/>admin.dominio.pe"]:::app
  end
  subgraph R2["Repositorio SazónPOS (sin cambio de arquitectura)"]
    RB["backend NestJS 11<br/>+ src/plataforma"]:::rest
    RF["frontend Angular<br/>pos.dominio.pe"]:::rest
  end
  subgraph S["Supabase (un proyecto por ambiente)"]
    AU["Auth"]:::ext
    PG[("PostgreSQL<br/>esquemas de plataforma + esquema de SazónPOS")]:::dato
    ST["Storage"]:::ext
  end
  RF -- "menú Administración<br/>(misma cookie .dominio.pe)" --> ADM
  RF & ADM & CON -- login --> AU
  ADM & CON --> API
  RF --> RB
  API & WK --> PG
  RB -- "lee seg/org/cfg/cat/seq<br/>escribe sync.outbox" --> PG
  WK -- "eventos de SazónPOS" --> PG

  classDef app fill:#e8eef9,stroke:#3c5a99,color:#123;
  classDef trans fill:#ede7f6,stroke:#5e35b1,color:#123;
  classDef rest fill:#fde8d7,stroke:#c2410c,color:#123;
  classDef dato fill:#d9f2e3,stroke:#2e7d4f,color:#123;
  classDef ext fill:#eeeeee,stroke:#616161,color:#123,stroke-dasharray: 4 3;
  classDef infra fill:#fff4d6,stroke:#b8860b,color:#123;
  classDef hito fill:#d5f5f0,stroke:#0f766e,color:#123;
```

## PL-09 — Ambientes y flujo de entrega

Tres ambientes con un proyecto Supabase cada uno. Cada cambio pasa por pull request y CI con nx affected; staging se despliega al integrar a main y producción con una etiqueta de versión y aprobación manual.

```mermaid
flowchart LR
  DEV["Local<br/>docker-compose PG16 + Redis<br/>Supabase CLI"]:::infra
  PR["Pull request<br/>lint · test · build · boundaries<br/>(nx affected)"]:::app
  STG["Staging<br/>Supabase dev/staging (Free)<br/>api + worker · Vercel preview"]:::trans
  PRD["Producción<br/>Supabase Pro · respaldos<br/>api + worker · Vercel"]:::dato
  DEV --> PR -- "merge a main" --> STG -- "tag vX.Y.Z +<br/>aprobación manual" --> PRD
  PRD -. "migración reversible<br/>+ runbook de reversión" .-> STG

  classDef app fill:#e8eef9,stroke:#3c5a99,color:#123;
  classDef trans fill:#ede7f6,stroke:#5e35b1,color:#123;
  classDef rest fill:#fde8d7,stroke:#c2410c,color:#123;
  classDef dato fill:#d9f2e3,stroke:#2e7d4f,color:#123;
  classDef ext fill:#eeeeee,stroke:#616161,color:#123,stroke-dasharray: 4 3;
  classDef infra fill:#fff4d6,stroke:#b8860b,color:#123;
  classDef hito fill:#d5f5f0,stroke:#0f766e,color:#123;
```

## PL-10 — Dependencias entre componentes transversales

Orden de construcción. Nada se construye antes que aquello de lo que depende; por eso seguridad y organización van primero y la facturación electrónica espera a personas, correlativos y catálogos.

```mermaid
flowchart LR
  K["kernel<br/>kernel-infra"]:::infra
  ORG["TR-ORG"]:::trans
  SEG["TR-SEG<br/>Supabase Auth"]:::trans
  CFG["TR-CFG"]:::trans
  SEQ["TR-SEQ"]:::trans
  CAT["TR-CAT"]:::trans
  AUD["TR-AUD"]:::trans
  EVT["TR-EVT"]:::trans
  PER["TR-PER"]:::trans
  IDN["TR-IDN"]:::trans
  ARC["TR-ARC"]:::trans
  FE["TR-FE"]:::trans
  NOT["TR-NOT"]:::trans
  PAG["TR-PAG"]:::trans
  CMS["TR-CMS"]:::trans
  POR["TR-POR"]:::trans
  SOP["TR-SOP"]:::trans
  OBS["TR-OBS"]:::trans
  K --> ORG --> SEG
  K --> EVT
  SEG --> CFG & SEQ & CAT & AUD
  EVT --> AUD
  CAT --> PER --> IDN
  SEQ & CAT & PER --> FE
  ARC --> FE
  EVT --> NOT
  FE --> PAG
  NOT --> PAG
  ARC --> CMS --> POR
  PER --> POR
  NOT --> SOP
  EVT --> OBS --> SOP

  classDef app fill:#e8eef9,stroke:#3c5a99,color:#123;
  classDef trans fill:#ede7f6,stroke:#5e35b1,color:#123;
  classDef rest fill:#fde8d7,stroke:#c2410c,color:#123;
  classDef dato fill:#d9f2e3,stroke:#2e7d4f,color:#123;
  classDef ext fill:#eeeeee,stroke:#616161,color:#123,stroke-dasharray: 4 3;
  classDef infra fill:#fff4d6,stroke:#b8860b,color:#123;
  classDef hito fill:#d5f5f0,stroke:#0f766e,color:#123;
```
