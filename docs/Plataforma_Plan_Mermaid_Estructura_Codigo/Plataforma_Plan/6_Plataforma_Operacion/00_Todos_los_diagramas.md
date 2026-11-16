# Plataforma de Operación · Diagramas Mermaid

## OP-01 — Mapa de la plataforma de operación

Los tres componentes se apoyan en los cimientos transversales ya definidos (organización, seguridad, eventos) y se conectan entre sí: una alerta de observabilidad abre un ticket, el ticket trae su traza, y el servicio de identidad sirve a los nueve productos. Los recuadros punteados son piezas existentes que se usan, no se construyen.

```mermaid
flowchart TB
  P["9 productos<br/>NestJS + Angular · servidor local (edge)"]:::prod
  subgraph OBS["Observabilidad"]
    O1["Instrumentación<br/>OpenTelemetry"]:::obs
    O2["Collector<br/>enmascara · muestrea"]:::obs
    O4["Observabilidad de negocio<br/>schema obs · propio"]:::obs
  end
  O3["Grafana Cloud / SigNoz<br/>logs · trazas · métricas"]:::ext
  SE["Sentry<br/>errores del frontend"]:::ext
  subgraph IDN["Identidad e interoperabilidad"]
    I1["Nivel 1 · consulta DNI/RUC<br/>caché + bitácora"]:::idn
    I3["Nivel 3 · identidad portable<br/>consentimiento del titular"]:::idn
  end
  FU["RENIEC / SUNAT<br/>vía convenio o proveedor"]:::ext
  subgraph SOP["Centro de Soporte"]
    S1["Widget en el shell Angular<br/>contexto automático"]:::sop
    S2["Tickets · SLA por plan<br/>problemas · base de conocimiento"]:::sop
  end
  GH["GitHub Issues / Projects<br/>backlog de ingeniería"]:::ext
  WA["WhatsApp Business · correo"]:::ext
  BASE["Cimientos transversales<br/>organización · seguridad · eventos (outbox)"]:::trans
  P --> O1 --> O2 --> O3
  P --> SE
  P -- "eventos de dominio" --> O4
  P -- "DNI / RUC" --> I1 --> FU
  I1 -.-> I3
  P --> S1 --> S2
  WA --> S2
  O4 -- "alerta" --> S2
  S2 -- "trace_id" --> O3
  S2 -- "problema" --> GH
  O3 ~~~ BASE
  I3 ~~~ BASE

  classDef prod fill:#e8eef9,stroke:#3c5a99,color:#123;
  classDef trans fill:#ede7f6,stroke:#5e35b1,color:#123;
  classDef obs fill:#d5f5f0,stroke:#0f766e,color:#123;
  classDef idn fill:#fde8d7,stroke:#c2410c,color:#123;
  classDef sop fill:#fff4d6,stroke:#b8860b,color:#123;
  classDef dato fill:#d9f2e3,stroke:#2e7d4f,color:#123;
  classDef ext fill:#eeeeee,stroke:#616161,color:#123,stroke-dasharray: 4 3;
  classDef no fill:#f8d7da,stroke:#a3303b,color:#123;
  classDef si fill:#d9f2e3,stroke:#2e7d4f,color:#123;
  classDef dec fill:#fff4d6,stroke:#b8860b,color:#123;
  classDef ini fill:#d9f2e3,stroke:#2e7d4f,color:#123;
  classDef fin fill:#f8d7da,stroke:#a3303b,color:#123;
  classDef tarea fill:#e8eef9,stroke:#3c5a99,color:#123;
  classDef sis fill:#ede7f6,stroke:#5e35b1,color:#123;
```

## OP-02 — Arquitectura de observabilidad: comprar el motor, construir la capa de negocio

La telemetría técnica sigue el estándar OpenTelemetry y termina en un backend existente (intercambiable). La observabilidad de negocio reutiliza los eventos de dominio del outbox: un consumidor los agrega por minuto en el schema obs, un evaluador aplica reglas y las alertas llegan al Centro de Soporte y a WhatsApp.

```mermaid
flowchart TB
  subgraph FUENTES["Fuentes"]
    A1["API NestJS<br/>auto-instrumentación<br/>http · pg · redis · bullmq"]:::prod
    A2["Workers BullMQ"]:::prod
    A3["Servidor local (edge)<br/>colas · restaurante · gym"]:::prod
    A4["Frontend Angular"]:::prod
  end
  subgraph TEC["Telemetría técnica (existente)"]
    C["OpenTelemetry Collector<br/>borra headers y parámetros SQL<br/>enmascara DNI, correos, tarjetas<br/>tail sampling: errores + lentas + 10 %"]:::obs
    B["Backend OTLP<br/>Grafana Cloud · o Loki + Tempo + Prometheus<br/>· o SigNoz"]:::ext
    G["Grafana<br/>tableros técnicos · exploración de trazas"]:::ext
    SN["Sentry<br/>errores de Angular con reproducción"]:::ext
  end
  subgraph NEG["Observabilidad de negocio (propia)"]
    OB["sync.outbox<br/>eventos de dominio"]:::dato
    AG["Consumidor de eventos<br/>obs.registrar por minuto"]:::obs
    MM["obs.metrica_minuto<br/>por tenant y sucursal"]:::dato
    EV["Evaluador cada minuto<br/>umbral · sin datos · caída vs línea base"]:::obs
    AL["obs.alerta<br/>deduplicada"]:::dato
    SA["Tablero de salud por cliente<br/>semáforo por sucursal"]:::obs
  end
  SOP["Centro de Soporte<br/>ticket automático"]:::sop
  WA["Aviso por WhatsApp / correo<br/>al equipo y al cliente"]:::ext
  A1 & A2 & A3 --> C
  A4 --> SN
  C --> B --> G
  A1 --> OB --> AG --> MM --> EV --> AL
  MM --> SA
  AL --> SA
  AL --> SOP
  AL --> WA

  classDef prod fill:#e8eef9,stroke:#3c5a99,color:#123;
  classDef trans fill:#ede7f6,stroke:#5e35b1,color:#123;
  classDef obs fill:#d5f5f0,stroke:#0f766e,color:#123;
  classDef idn fill:#fde8d7,stroke:#c2410c,color:#123;
  classDef sop fill:#fff4d6,stroke:#b8860b,color:#123;
  classDef dato fill:#d9f2e3,stroke:#2e7d4f,color:#123;
  classDef ext fill:#eeeeee,stroke:#616161,color:#123,stroke-dasharray: 4 3;
  classDef no fill:#f8d7da,stroke:#a3303b,color:#123;
  classDef si fill:#d9f2e3,stroke:#2e7d4f,color:#123;
  classDef dec fill:#fff4d6,stroke:#b8860b,color:#123;
  classDef ini fill:#d9f2e3,stroke:#2e7d4f,color:#123;
  classDef fin fill:#f8d7da,stroke:#a3303b,color:#123;
  classDef tarea fill:#e8eef9,stroke:#3c5a99,color:#123;
  classDef sis fill:#ede7f6,stroke:#5e35b1,color:#123;
```

## OP-03 — Secuencia: de la caída de pedidos al ticket con su traza

Ejemplo de punta a punta: la sucursal Miraflores deja de registrar pedidos a las 13:00 de un viernes. La plataforma lo detecta comparando con la línea base de las cuatro semanas anteriores, abre el ticket antes de que el cliente llame y el agente llega a la traza del error en un clic.

```mermaid
sequenceDiagram
  autonumber
  participant P as SazónPOS (API)
  participant OB as Outbox
  participant AG as Consumidor obs
  participant EV as Evaluador (cada minuto)
  participant S as Centro de Soporte
  participant N as Notificaciones
  participant AGT as Agente de soporte
  participant GR as Grafana (trazas)
  P->>OB: rest.pedido.registrado (tenant, sucursal)
  OB->>AG: lote de eventos
  AG->>AG: obs.registrar(rest.pedidos, minuto)
  Note over P: 13:00 — falla el cobro con tarjeta<br/>los pedidos caen de 20 a 3 por tramo
  EV->>EV: valor 3 vs línea base 20 → caída 85 %
  EV->>S: alerta CRÍTICA (Miraflores)
  S->>S: sop.crear_desde_alerta → ticket P1
  S->>N: aviso al equipo y al administrador del local
  AGT->>S: abre el ticket SOP-000231
  S-->>AGT: contexto: sucursal, versión, indicador
  AGT->>GR: busca trazas con error por plataforma.sucursal_id
  GR-->>AGT: span pag.cobrar → timeout de la pasarela
  AGT->>S: nota interna + problema → GitHub #214
  Note over EV: al normalizarse los pedidos<br/>la alerta se resuelve sola
```

## OP-04 — ¿Se puede compartir este dato de persona entre sistemas?

Árbol de decisión que aplica el principio de finalidad de la Ley 29733 a la idea de consulta intersistémica. Solo dos caminos son legítimos sin pedir permiso a la persona: datos que vienen de una fuente pública autorizada (nivel 1) y datos dentro del mismo cliente con finalidad declarada (nivel 2). Entre clientes distintos, solo con el consentimiento del titular (nivel 3).

```mermaid
flowchart TB
  Q0(["Un negocio busca a una persona por su documento"]):::ini
  Q1{"¿El dato viene de una fuente pública autorizada<br/>RENIEC / SUNAT, vía convenio o proveedor?"}:::dec
  Q2{"¿Es un dato que registró otro negocio<br/>en la plataforma?"}:::dec
  Q3{"¿Ese negocio es del mismo cliente (tenant)<br/>y la finalidad está declarada?"}:::dec
  Q4{"¿La persona autorizó compartirlo<br/>con ESTE negocio y para ESTOS campos?"}:::dec
  Q5{"¿Es un dato sensible?<br/>salud, biométrico, creencias…"}:::dec
  N1["NIVEL 1 · permitido<br/>solo identidad mínima: nombres, razón social, estado<br/>caché central + bitácora por tenant"]:::si
  N2["NIVEL 2 · permitido<br/>persona maestra compartida entre los productos<br/>del mismo tenant"]:::si
  N3["NIVEL 3 · permitido<br/>solo los campos autorizados, con vigencia<br/>registro de cada lectura · revocable"]:::si
  X1["NO PERMITIDO<br/>el encargado usaría datos de un cliente para otro<br/>revelar 'está registrado en una clínica' ya es un dato de salud"]:::no
  X2["NO PERMITIDO<br/>nunca se comparte entre negocios por la plataforma"]:::no
  Q0 --> Q1
  Q1 -- "Sí" --> N1
  Q1 -- "No" --> Q2
  Q2 -- "Sí" --> Q3
  Q3 -- "Sí" --> N2
  Q3 -- "No" --> Q4
  Q4 -- "No" --> X1
  Q4 -- "Sí" --> Q5
  Q5 -- "No" --> N3
  Q5 -- "Sí" --> X2
  Q2 -- "No" --> Q4

  classDef prod fill:#e8eef9,stroke:#3c5a99,color:#123;
  classDef trans fill:#ede7f6,stroke:#5e35b1,color:#123;
  classDef obs fill:#d5f5f0,stroke:#0f766e,color:#123;
  classDef idn fill:#fde8d7,stroke:#c2410c,color:#123;
  classDef sop fill:#fff4d6,stroke:#b8860b,color:#123;
  classDef dato fill:#d9f2e3,stroke:#2e7d4f,color:#123;
  classDef ext fill:#eeeeee,stroke:#616161,color:#123,stroke-dasharray: 4 3;
  classDef no fill:#f8d7da,stroke:#a3303b,color:#123;
  classDef si fill:#d9f2e3,stroke:#2e7d4f,color:#123;
  classDef dec fill:#fff4d6,stroke:#b8860b,color:#123;
  classDef ini fill:#d9f2e3,stroke:#2e7d4f,color:#123;
  classDef fin fill:#f8d7da,stroke:#a3303b,color:#123;
  classDef tarea fill:#e8eef9,stroke:#3c5a99,color:#123;
  classDef sis fill:#ede7f6,stroke:#5e35b1,color:#123;
```

## OP-05 — Identidad en tres niveles

Reformulación de la idea "tipo PIDE intersistémico". La clínica y el gimnasio nunca se comunican entre sí: cada uno consulta la fuente pública (nivel 1) y, si la persona tiene una cuenta de plataforma, le pide autorización para recibir sus datos de contacto (nivel 3). La cuenta del titular es de la plataforma, no de un negocio.

```mermaid
flowchart TB
  subgraph TEN["Negocios clientes (cada tenant aislado; no hay conexión directa entre ellos)"]
    C1["Tenant A · ClínicaNet<br/>persona maestra propia<br/>con historia clínica"]:::prod
    G1["Tenant B · GymControl<br/>persona maestra propia"]:::prod
    PM["Tenant C · SazónPOS + LibroPOS<br/>persona maestra compartida<br/>entre sus productos (nivel 2)"]:::dato
  end
  subgraph IDN["Servicio de identidad de la plataforma"]
    N1["Nivel 1 · idn.consultar<br/>caché de fuente pública<br/>DNI → nombres · RUC → razón social y estado"]:::idn
    N3["Nivel 3 · idn.titular + idn.autorizacion<br/>la persona decide qué comparte y con quién"]:::idn
  end
  F["RENIEC (convenio) · proveedor autorizado<br/>padrón RUC de SUNAT"]:::ext
  TIT(["Titular<br/>portal 'Mis datos' · código por SMS/WhatsApp"]):::sop
  C1 -- "DNI" --> N1
  G1 -- "DNI" --> N1
  PM -- "DNI / RUC" --> N1
  N1 --> F
  G1 -- "solicita campos" --> N3
  N3 -- "solo campos autorizados" --> G1
  TIT -- "autoriza / revoca" --> N3

  classDef prod fill:#e8eef9,stroke:#3c5a99,color:#123;
  classDef trans fill:#ede7f6,stroke:#5e35b1,color:#123;
  classDef obs fill:#d5f5f0,stroke:#0f766e,color:#123;
  classDef idn fill:#fde8d7,stroke:#c2410c,color:#123;
  classDef sop fill:#fff4d6,stroke:#b8860b,color:#123;
  classDef dato fill:#d9f2e3,stroke:#2e7d4f,color:#123;
  classDef ext fill:#eeeeee,stroke:#616161,color:#123,stroke-dasharray: 4 3;
  classDef no fill:#f8d7da,stroke:#a3303b,color:#123;
  classDef si fill:#d9f2e3,stroke:#2e7d4f,color:#123;
  classDef dec fill:#fff4d6,stroke:#b8860b,color:#123;
  classDef ini fill:#d9f2e3,stroke:#2e7d4f,color:#123;
  classDef fin fill:#f8d7da,stroke:#a3303b,color:#123;
  classDef tarea fill:#e8eef9,stroke:#3c5a99,color:#123;
  classDef sis fill:#ede7f6,stroke:#5e35b1,color:#123;
```

## OP-06 — Secuencia: consulta de DNI o RUC (nivel 1)

El servicio de identidad valida el formato (incluido el dígito verificador del RUC) antes de gastar una consulta, responde desde la caché si está vigente y, si no, reserva cuota y llama al proveedor principal con respaldo. Cada consulta queda en la bitácora del tenant con el número en hash.

```mermaid
sequenceDiagram
  autonumber
  actor U as Recepción (GymControl)
  participant API as Módulo idn (NestJS)
  participant DB as PostgreSQL (schema idn)
  participant P1 as Proveedor principal
  participant P2 as Proveedor de respaldo
  U->>API: GET /identidad/DNI/45678912?motivo=REGISTRO_CLIENTE
  API->>DB: idn.consultar(tenant, usuario, GYM, DNI, número)
  alt formato inválido
    DB-->>API: INVALIDO (no consume cuota)
  else en caché y vigente
    DB-->>API: CACHE + datos mínimos
  else cuota agotada
    DB-->>API: CUOTA_AGOTADA → registro manual
  else hay que consultar
    DB-->>API: CONSULTAR_PROVEEDOR (cuota reservada)
    API->>P1: consulta (timeout 3 s, circuit breaker)
    alt responde
      P1-->>API: nombres y apellidos
    else falla o no responde
      API->>P2: consulta de respaldo
      P2-->>API: nombres y apellidos
    end
    API->>DB: idn.guardar_resultado (caché + bitácora)
  end
  API-->>U: nombres (el usuario completa el resto)
```

## OP-07 — Secuencia: autorización del titular (nivel 3)

El gimnasio pide campos concretos con una finalidad. El código de un solo uso llega a la persona, nunca al negocio. Al confirmar, el gimnasio recibe solo lo autorizado; cada lectura queda registrada y la persona puede revocar desde su portal. La respuesta al negocio es la misma exista o no la cuenta, para no revelar quién está registrado. Es la aplicación práctica del derecho de portabilidad que incorpora el reglamento vigente de la Ley 29733.

```mermaid
sequenceDiagram
  autonumber
  actor R as Recepción del gimnasio
  participant API as Módulo idn
  participant DB as PostgreSQL (idn)
  participant N as Notificaciones
  actor T as Titular (cliente)
  R->>API: solicitar [nombres, celular] para DNI 45678912 · finalidad "Inscripción como socio"
  API-->>R: "Si la persona tiene cuenta, recibirá un código" (no se confirma si existe)
  API->>DB: idn.solicitar_autorizacion (código con hash, vence en 10 min)
  API->>N: enviar código al celular del titular
  N->>T: "Gimnasio Fuerza solicita tus nombres y celular para inscripción. Código 482913"
  T->>R: dicta el código (o aprueba en su portal)
  R->>API: confirmar(solicitud, 482913)
  API->>DB: idn.confirmar_autorizacion → APROBADA (vigencia 1 año)
  R->>API: obtener datos
  API->>DB: idn.datos_autorizados (registra el acceso)
  DB-->>R: { nombres, celular } — sin dirección, sin fecha de nacimiento
  T->>API: revocar (desde "Mis datos")
  API->>DB: idn.revocar → el gimnasio ya no recibe datos nuevos
```

## OP-08 — Módulo de identidad en arquitectura hexagonal

El dominio no conoce a RENIEC ni a ningún proveedor: depende del puerto ProveedorIdentidad. Cada proveedor es un adaptador intercambiable; cambiar de proveedor o agregar uno de respaldo no toca los casos de uso. Sigue la misma estructura de la Guía de Arquitectura de Código Backend.

```mermaid
flowchart TB
  subgraph INT["interface"]
    direction LR
    C1["IdentidadController<br/>GET /identidad/:tipo/:numero"]:::prod
    C2["AutorizacionController<br/>solicitar · confirmar · revocar"]:::prod
    C3["PortalTitularController<br/>'Mis datos'"]:::prod
  end
  subgraph APP["application"]
    direction LR
    U1["ConsultarDocumentoUseCase"]:::trans
    U2["SolicitarAutorizacionUseCase"]:::trans
    U3["ObtenerDatosAutorizadosUseCase"]:::trans
    P1["puerto ProveedorIdentidad<br/>consultar(tipo, número)"]:::idn
    P2["puerto CacheIdentidadRepository"]:::idn
    P3["puerto EnviadorCodigo"]:::idn
  end
  subgraph DOM["domain"]
    direction LR
    D1["DocumentoIdentidad<br/>DNI · RUC con dígito verificador · CE"]:::dato
    D2["Autorizacion<br/>campos · vigencia · revocar()"]:::dato
    D3["CampoPortable<br/>lista cerrada sin datos sensibles"]:::dato
  end
  subgraph INF["infrastructure"]
    direction LR
    A1["ReniecConvenioAdapter"]:::ext
    A2["ProveedorPrivadoAdapter"]:::ext
    A3["SunatPadronAdapter<br/>carga diaria del padrón"]:::ext
    A4["ProveedorConRespaldo<br/>decorador: principal → respaldo<br/>circuit breaker"]:::ext
    A5["TypeOrmCacheIdentidadRepository"]:::ext
    A6["NotificacionesEnviadorCodigo"]:::ext
  end
  C1 --> U1
  C2 --> U2
  C3 --> U3
  U1 --> P1
  U1 --> P2
  U2 --> P3
  U1 & U2 & U3 --> DOM
  A4 -. implementa .-> P1
  A4 --> A1
  A4 --> A2
  A4 --> A3
  A5 -. implementa .-> P2
  A6 -. implementa .-> P3

  classDef prod fill:#e8eef9,stroke:#3c5a99,color:#123;
  classDef trans fill:#ede7f6,stroke:#5e35b1,color:#123;
  classDef obs fill:#d5f5f0,stroke:#0f766e,color:#123;
  classDef idn fill:#fde8d7,stroke:#c2410c,color:#123;
  classDef sop fill:#fff4d6,stroke:#b8860b,color:#123;
  classDef dato fill:#d9f2e3,stroke:#2e7d4f,color:#123;
  classDef ext fill:#eeeeee,stroke:#616161,color:#123,stroke-dasharray: 4 3;
  classDef no fill:#f8d7da,stroke:#a3303b,color:#123;
  classDef si fill:#d9f2e3,stroke:#2e7d4f,color:#123;
  classDef dec fill:#fff4d6,stroke:#b8860b,color:#123;
  classDef ini fill:#d9f2e3,stroke:#2e7d4f,color:#123;
  classDef fin fill:#f8d7da,stroke:#a3303b,color:#123;
  classDef tarea fill:#e8eef9,stroke:#3c5a99,color:#123;
  classDef sis fill:#ede7f6,stroke:#5e35b1,color:#123;
```

## OP-09 — Modelo de datos del servicio de identidad (schema idn)

La caché y el titular son globales (sin tenant) y solo se acceden por funciones; la bitácora, las solicitudes y las autorizaciones llevan tenant y RLS. Las restricciones CHECK impiden guardar en caché más que la identidad mínima y en la identidad portable cualquier dato sensible.

```mermaid
erDiagram
  PROVEEDOR ||--o{ CACHE_DOCUMENTO : "alimenta"
  PROVEEDOR {
    varchar codigo PK
    varchar_arr tipos_doc
    int prioridad
    int ttl_dias
  }
  CACHE_DOCUMENTO {
    varchar tipo_doc PK
    varchar numero PK
    jsonb datos "solo identidad mínima"
    timestamptz expira_en
  }
  CONSULTA_LOG {
    bigint id PK
    uuid tenant_id "RLS"
    uuid usuario_id
    char numero_hash "SHA-256 con sal"
    varchar resultado
    varchar motivo
  }
  CUOTA {
    uuid tenant_id PK
    char periodo PK
    int incluidas
    int consumidas
  }
  TITULAR ||--o{ SOLICITUD_AUTORIZACION : "recibe"
  TITULAR ||--o{ AUTORIZACION : "otorga"
  SOLICITUD_AUTORIZACION ||--o| AUTORIZACION : "genera"
  AUTORIZACION ||--o{ ACCESO_TITULAR : "registra"
  CAMPO_PORTABLE ||--o{ AUTORIZACION : "limita"
  TITULAR {
    uuid id PK
    varchar tipo_doc
    varchar numero
    varchar celular
    jsonb datos_portables "sin datos sensibles"
  }
  SOLICITUD_AUTORIZACION {
    uuid id PK
    uuid tenant_id "RLS"
    varchar_arr campos
    varchar finalidad
    char codigo_hash
    int intentos
    varchar estado
  }
  AUTORIZACION {
    uuid id PK
    uuid tenant_id "RLS"
    varchar_arr campos
    timestamptz vigente_hasta
    timestamptz revocada_en
  }
  ACCESO_TITULAR {
    bigint id PK
    uuid usuario_id
    timestamptz creado_en
  }
  CAMPO_PORTABLE {
    varchar codigo PK
  }
```

## OP-10 — Proceso de atención de incidencias

Proceso con cuatro carriles. El primer nivel (N1, funcional) lo puede atender el socio comercial con la base de conocimiento; el segundo nivel (N2, técnico) lo atiende el desarrollador con la traza a mano. Las causas comunes se agrupan en un problema que vive en GitHub, y al publicarse la corrección se resuelven todos los tickets enlazados.

```mermaid
flowchart TB
  subgraph L1["Cliente"]
    a1(["Detecta un problema<br/>o tiene una consulta"]):::ini
    a2["Reporta desde el botón<br/>'Ayuda' o por WhatsApp"]:::tarea
    a3["Responde lo que se le pide"]:::tarea
    a4["Confirma la solución"]:::tarea
    a5(["Ticket cerrado<br/>encuesta de 1 clic"]):::fin
  end
  subgraph L2["Plataforma"]
    s1["Adjunta contexto: tenant, sucursal,<br/>producto, versión, ruta, trace_id"]:::sis
    s2["Sugiere artículos de la base<br/>de conocimiento (IA)"]:::sis
    s3["Calcula prioridad y plazos<br/>según plan y horario"]:::sis
    s0["Alerta de observabilidad<br/>crea ticket automático"]:::sis
  end
  subgraph L3["Soporte N1 · funcional"]
    n1["Clasifica y responde<br/>dentro del plazo"]:::tarea
    d1{"¿Se resuelve<br/>con configuración<br/>o capacitación?"}:::dec
    n2["Resuelve y documenta<br/>en la base de conocimiento"]:::tarea
  end
  subgraph L4["Soporte N2 · técnico"]
    t1["Analiza la traza<br/>y los logs"]:::tarea
    d2{"¿Es un defecto<br/>del producto?"}:::dec
    t2["Agrupa en un problema<br/>y crea el issue en GitHub"]:::tarea
    t3["Publica la corrección<br/>resuelve los tickets enlazados"]:::tarea
    t4["Corrige datos o<br/>configuración del cliente"]:::tarea
  end
  a1 --> a2 --> s1 --> s2 --> s3 --> n1 --> d1
  s0 --> s3
  d1 -- "Sí" --> n2 --> a4
  d1 -- "No" --> t1 --> d2
  n1 -. "falta información" .-> a3 -.-> n1
  d2 -- "Sí" --> t2 --> t3 --> a4
  d2 -- "No" --> t4 --> a4
  a4 --> a5

  classDef prod fill:#e8eef9,stroke:#3c5a99,color:#123;
  classDef trans fill:#ede7f6,stroke:#5e35b1,color:#123;
  classDef obs fill:#d5f5f0,stroke:#0f766e,color:#123;
  classDef idn fill:#fde8d7,stroke:#c2410c,color:#123;
  classDef sop fill:#fff4d6,stroke:#b8860b,color:#123;
  classDef dato fill:#d9f2e3,stroke:#2e7d4f,color:#123;
  classDef ext fill:#eeeeee,stroke:#616161,color:#123,stroke-dasharray: 4 3;
  classDef no fill:#f8d7da,stroke:#a3303b,color:#123;
  classDef si fill:#d9f2e3,stroke:#2e7d4f,color:#123;
  classDef dec fill:#fff4d6,stroke:#b8860b,color:#123;
  classDef ini fill:#d9f2e3,stroke:#2e7d4f,color:#123;
  classDef fin fill:#f8d7da,stroke:#a3303b,color:#123;
  classDef tarea fill:#e8eef9,stroke:#3c5a99,color:#123;
  classDef sis fill:#ede7f6,stroke:#5e35b1,color:#123;
```

## OP-11 — Ciclo de vida del ticket

Estados y transiciones validados en la base de datos (tabla sop.transicion). Mientras el ticket espera al cliente el plazo se pausa; al escalar pasa a nivel N2; un ticket resuelto puede reabrirse dentro de su ventana de confirmación.

```mermaid
stateDiagram-v2
  [*] --> NUEVO
  NUEVO --> EN_ANALISIS : primera respuesta
  NUEVO --> RESUELTO : resuelto con artículo
  EN_ANALISIS --> ESPERA_CLIENTE : se pide información (SLA en pausa)
  ESPERA_CLIENTE --> EN_ANALISIS : el cliente responde
  ESPERA_CLIENTE --> CERRADO : sin respuesta en 5 días
  EN_ANALISIS --> ESCALADO_N2 : requiere análisis técnico
  ESCALADO_N2 --> EN_ANALISIS : vuelve a N1
  ESCALADO_N2 --> RESUELTO : corrección publicada
  EN_ANALISIS --> RESUELTO
  RESUELTO --> CERRADO : el cliente confirma o pasan 3 días
  RESUELTO --> REABIERTO : el cliente rechaza
  REABIERTO --> EN_ANALISIS
  CERRADO --> [*]
```

## OP-12 — Modelo de datos del Centro de Soporte y de la observabilidad de negocio

Los tickets llevan tenant, empresa y sucursal del modelo organizacional, el plan contratado (para los plazos) y, opcionalmente, la alerta que los originó y el problema al que pertenecen. Las notas internas nunca son visibles al cliente (CHECK y política RLS).

```mermaid
erDiagram
  SUSCRIPCION ||--o{ TICKET : "plan define plazos"
  POLITICA_SLA ||--o{ TICKET : "aplica"
  TICKET ||--o{ TICKET_EVENTO : "historial"
  PROBLEMA ||--o{ TICKET : "agrupa"
  ALERTA |o--o| TICKET : "origina"
  REGLA_ALERTA ||--o{ ALERTA : "dispara"
  INDICADOR_DEF ||--o{ REGLA_ALERTA : "evalúa"
  INDICADOR_DEF ||--o{ METRICA_MINUTO : "serie"
  SUSCRIPCION {
    uuid tenant_id PK
    varchar producto_codigo PK
    varchar plan
  }
  POLITICA_SLA {
    varchar plan PK
    varchar prioridad PK
    int primera_respuesta_min
    int resolucion_min
    varchar horario
  }
  TICKET {
    uuid id PK
    varchar numero "SOP-000231"
    uuid tenant_id "RLS"
    uuid sucursal_id
    varchar producto_codigo
    smallint impacto
    smallint urgencia
    varchar prioridad "calculada"
    varchar estado
    varchar nivel "N1 o N2"
    jsonb contexto "sin datos personales"
    timestamptz resolucion_vence
  }
  TICKET_EVENTO {
    bigint id PK
    varchar tipo
    boolean visible_cliente
    boolean es_agente
  }
  PROBLEMA {
    uuid id PK
    varchar github_issue
    varchar version_correccion
  }
  INDICADOR_DEF {
    varchar codigo PK
    varchar producto_codigo
    varchar agregacion
  }
  METRICA_MINUTO {
    uuid tenant_id PK
    uuid sucursal_id PK
    varchar indicador PK
    timestamptz minuto PK
    numeric suma
    int conteo
  }
  REGLA_ALERTA {
    uuid id PK
    varchar condicion
    numeric umbral
    int ventana_min
    boolean crea_ticket
  }
  ALERTA {
    uuid id PK
    uuid sucursal_id
    varchar severidad
    varchar estado
  }
```

## OP-13 — Hoja de ruta de la plataforma de operación

Secuencia alineada con la prioridad de productos. Las fechas son relativas al lanzamiento de SazónPOS y suponen dedicación a tiempo parcial; lo importante es el orden y los disparadores, no el calendario exacto.

```mermaid
%%{init: {'gantt': {'leftPadding': 390, 'rightPadding': 40, 'barHeight': 26, 'fontSize': 14, 'sectionFontSize': 14}}}%%
gantt
  todayMarker off
  dateFormat YYYY-MM-DD
  axisFormat %b %Y
  section Fase 0 · con SazónPOS
  OpenTelemetry + logs con trace_id + Sentry      :f0a, 2026-11-02, 7d
  Collector + Grafana Cloud + alertas técnicas     :f0b, after f0a, 5d
  Mesa de ayuda existente + botón Ayuda + WhatsApp :f0c, after f0a, 5d
  section Fase 1 · con PsicoAgenda
  Servicio de identidad nivel 1 (DNI / RUC)        :f1a, 2027-01-11, 14d
  Observabilidad de negocio (obs) + tablero salud  :f1b, after f1a, 14d
  section Fase 2 · 3 productos o 20–30 clientes
  Centro de Soporte propio (sop) + widget          :f2a, 2027-04-05, 28d
  Problemas + GitHub + base de conocimiento        :f2b, after f2a, 14d
  section Fase 3 · demanda comprobada
  Identidad portable nivel 3 + portal Mis datos    :f3a, 2027-07-05, 28d
  IA en soporte: clasificación y sugerencias       :f3b, after f3a, 14d
```
