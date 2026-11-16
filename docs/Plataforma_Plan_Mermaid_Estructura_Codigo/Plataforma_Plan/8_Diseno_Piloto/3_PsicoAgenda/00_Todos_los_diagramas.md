# 3 PsicoAgenda

## P-01 — PsicoAgenda: mapa de contextos acotados

PsicoAgenda se divide en cinco contextos. Agenda se apoya en el núcleo NU-AGE (compartido con TurnoFácil, GymControl, ClínicaNet y JurisFlujo). Clínica es el corazón y el único contexto con datos de salud: los demás solo conocen identificadores. Cobros, Portal y Contenidos consumen servicios de la plataforma mediante adaptadores.

```mermaid
flowchart LR
  subgraph PSI["PsicoAgenda"]
    AG["Agenda<br/>servicios · profesionales · horarios ·<br/>citas · reserva en línea · lista de espera"]:::ctx
    CL["Clínica<br/>pacientes · consentimientos · historia ·<br/>notas · planes · evaluaciones · derivaciones"]:::ctx
    CO["Cobros<br/>cobros · paquetes · saldo · reembolsos"]:::ctx
    TE["Telepsicología<br/>salas · enlaces · conexiones"]:::ctx
    PO["Portal del paciente<br/>citas · pagos · tareas · documentos"]:::ctx
  end
  NU["Núcleo Agenda (NU-AGE)<br/>recursos · disponibilidad · reservas"]:::plat
  subgraph PLAT["Plataforma"]
    direction TB
    P1["Organización · Seguridad"]:::plat
    P2["Personas · Identidad"]:::plat
    P3["Pagos · Comprobantes"]:::plat
    P4["Notificaciones · Archivos ·<br/>Auditoría · Eventos"]:::plat
    P5["CMS · Portal del cliente"]:::plat
  end
  IA["Proveedor IA"]:::ext
  VC["Videollamada"]:::ext
  AG -- "Customer/Supplier" --> NU
  AG -- "cita atendida (evento)" --> CL
  AG -- "cita atendida/inasistencia (evento)" --> CO
  AG -- "cita virtual" --> TE
  TE --> VC
  CL -- "IA con consentimiento (ACL)" --> IA
  CO -- "ACL" --> P3
  PO --> AG & CO & CL
  PO --> P5
  PSI --> P1 & P2 & P4

  classDef ctx fill:#d5f5f0,stroke:#0f766e,color:#123;
  classDef plat fill:#ede7f6,stroke:#5e35b1,color:#123;
  classDef ext fill:#eeeeee,stroke:#616161,color:#123,stroke-dasharray: 4 3;
```

## P-02 — Modelo de dominio · Agenda

El profesional (un usuario del tenant con colegiatura) atiende servicios en sedes y consultorios según horarios semanales y excepciones. La cita es el agregado central: reserva un rango del profesional y, si es presencial, de un consultorio; puede venir de una reserva en línea con bloqueo temporal y alimentar la lista de espera al liberarse.

```mermaid
classDiagram
  direction LR
  class Profesional {
    <<Aggregate>>
    +uuid id
    +uuid usuarioId
    +uuid personaId
    +string colegiaturaCpsp
    +string[] especialidades
    +bool publicadoEnSitio
  }
  class Servicio {
    <<Aggregate>>
    +uuid id
    +string nombre
    +Modalidad modalidad
    +int duracionMin
    +Dinero precioBase
    +bool requierePagoAdelantado
    +string afectacionIgv
  }
  class TarifaProfesional {
    <<Entity>>
    +Dinero precio
  }
  class Horario {
    <<Entity>>
    +DiaSemana dia
    +time inicio
    +time fin
    +uuid sucursalId
    +uuid consultorioId
  }
  class Excepcion {
    <<Entity>>
    +RangoHorario rango
    +TipoExcepcion tipo
    +string motivo
  }
  class Cita {
    <<Aggregate>>
    +uuid id
    +string codigo
    +RangoHorario rango
    +Modalidad modalidad
    +EstadoCita estado
    +Canal canalReserva
    +Dinero precio
    +reservar()
    +confirmar()
    +reprogramar(rango)
    +cancelar(motivo, porPaciente)
    +marcarAtendida()
    +marcarInasistencia()
  }
  class ReservaTemporal {
    <<Entity>>
    +RangoHorario rango
    +datetime expiraEn
    +string celularVerificado
  }
  class ListaEspera {
    <<Entity>>
    +date desde
    +date hasta
    +int orden
    +EstadoEspera estado
  }
  class PoliticaReserva {
    <<ValueObject>>
    +int anticipacionCancelacionH
    +int bloqueoTemporalMin
    +int maxReprogramaciones
  }
  class RangoHorario {
    <<ValueObject>>
    +datetime inicio
    +datetime fin
    +bool seCruzaCon(otro)
  }
  class EstadoCita {
    <<Enumeration>>
    PENDIENTE_PAGO
    RESERVADA
    CONFIRMADA
    EN_CURSO
    ATENDIDA
    CANCELADA
    INASISTENCIA
    REPROGRAMADA
  }
  Profesional "1" *-- "1..*" Horario : atiende
  Profesional "1" *-- "0..*" Excepcion : vacaciones, bloqueos
  Profesional "0..*" --> "1..*" Servicio : ofrece
  Profesional "1" *-- "0..*" TarifaProfesional
  TarifaProfesional "0..*" --> "1" Servicio
  Horario "0..*" --> "1" Sucursal : sede
  Horario "0..*" --> "0..1" UnidadOperativa : consultorio
  Cita "0..*" --> "1" Profesional
  Cita "0..*" --> "1" Servicio
  Cita "0..*" --> "1" Paciente
  Cita "0..*" --> "0..1" UnidadOperativa : consultorio (presencial)
  Cita "0..1" <-- "0..1" ReservaTemporal : origina
  Cita "0..1" --> "0..1" Cita : reprogramada desde
  ListaEspera "0..*" --> "1" Paciente
  ListaEspera "0..*" --> "1" Servicio
  ListaEspera "0..*" --> "0..1" Profesional
  Servicio *-- PoliticaReserva
  Cita *-- RangoHorario
  Cita --> EstadoCita
  class Paciente:::ext
  class Sucursal:::ext
  class UnidadOperativa:::ext
  class Profesional:::agg
  class Servicio:::agg
  class Cita:::agg
  class TarifaProfesional:::ent
  class Horario:::ent
  class Excepcion:::ent
  class ReservaTemporal:::ent
  class ListaEspera:::ent
  class PoliticaReserva:::vo
  class RangoHorario:::vo
  class EstadoCita:::vo

  classDef agg fill:#d5f5f0,stroke:#0f766e,color:#123
  classDef ent fill:#e8eef9,stroke:#3c5a99,color:#123
  classDef vo fill:#d9f2e3,stroke:#2e7d4f,color:#123
  classDef ext fill:#eeeeee,stroke:#616161,color:#123,stroke-dasharray: 4 3
```

## P-03 — Modelo de dominio · Clínica (historia psicológica)

El paciente es una Persona del tenant con datos clínicos en PsicoAgenda; si es menor, tiene uno o más apoderados. La historia psicológica (una por paciente y empresa, numerada HP-AAAA-NNNNNN) agrupa anamnesis, impresiones diagnósticas CIE-10, notas de sesión firmadas e inmutables con adendas, planes de tratamiento, evaluaciones con plantillas versionadas y derivaciones. El acceso lo concede el profesional tratante y cada lectura se audita.

```mermaid
classDiagram
  direction LR
  class Paciente {
    <<Aggregate>>
    +uuid id
    +uuid personaId
    +bool esMenor
    +string ocupacion
    +EstadoPaciente estado
  }
  class Apoderado {
    <<Entity>>
    +uuid personaId
    +string parentesco
    +bool firmaConsentimientos
  }
  class ConsentimientoInformado {
    <<Entity>>
    +TipoConsentimiento tipo
    +int versionPlantilla
    +datetime firmadoEn
    +uuid firmadoPorPersonaId
    +datetime revocadoEn
    +uuid archivoId
  }
  class HistoriaPsicologica {
    <<Aggregate>>
    +string numero
    +uuid profesionalTratanteId
    +datetime abiertaEn
    +EstadoHistoria estado
    +autorizarAcceso(usuario)
    +accesoEmergencia(motivo)
  }
  class Anamnesis {
    <<Entity>>
    +string motivoConsulta
    +string antecedentes
    +string historiaFamiliar
  }
  class ImpresionDiagnostica {
    <<Entity>>
    +string cie10
    +Certeza certeza
    +date desde
  }
  class NotaSesion {
    <<Aggregate>>
    +uuid citaId
    +FormatoNota formato
    +json contenido
    +EstadoNota estado
    +datetime firmadaEn
    +bool generadaConIa
    +firmar()
    +agregarAdenda(texto, motivo)
  }
  class Adenda {
    <<Entity>>
    +string texto
    +string motivo
    +uuid autorId
  }
  class PlanTratamiento {
    <<Aggregate>>
    +string enfoque
    +date inicio
    +EstadoPlan estado
  }
  class Objetivo {
    <<Entity>>
    +string descripcion
    +int progreso
  }
  class TareaPaciente {
    <<Entity>>
    +string instruccion
    +date vence
    +EstadoTarea estado
  }
  class Evaluacion {
    <<Aggregate>>
    +EstadoEvaluacion estado
    +json puntajes
    +string interpretacion
  }
  class PlantillaTest {
    <<Aggregate>>
    +string codigo
    +int version
    +json escalas
  }
  class ItemTest {
    <<Entity>>
    +int orden
    +string texto
    +bool critico
    +int umbralCritico
  }
  class Respuesta {
    <<Entity>>
    +int valor
  }
  class AlertaRiesgo {
    <<Entity>>
    +NivelRiesgo nivel
    +string origen
    +datetime atendidaEn
  }
  class Derivacion {
    <<Entity>>
    +TipoDerivacion tipo
    +string destino
    +string motivo
    +uuid consentimientoId
  }
  class AccesoHistoria {
    <<Entity>>
    +uuid usuarioId
    +TipoAcceso tipo
    +datetime hasta
    +string motivo
  }
  Paciente "1" --> "1" Persona : es
  Paciente "1" *-- "0..*" Apoderado
  Paciente "1" *-- "1..*" ConsentimientoInformado
  Paciente "1" -- "0..1" HistoriaPsicologica : por empresa
  HistoriaPsicologica "1" *-- "0..1" Anamnesis
  HistoriaPsicologica "1" *-- "0..*" ImpresionDiagnostica
  HistoriaPsicologica "1" *-- "0..*" NotaSesion
  HistoriaPsicologica "1" *-- "0..*" PlanTratamiento
  HistoriaPsicologica "1" *-- "0..*" Evaluacion
  HistoriaPsicologica "1" *-- "0..*" Derivacion
  HistoriaPsicologica "1" *-- "0..*" AccesoHistoria : autorizaciones y emergencias
  HistoriaPsicologica "1" *-- "0..*" AlertaRiesgo
  NotaSesion "0..1" --> "1" Cita : de la sesión
  NotaSesion "1" *-- "0..*" Adenda
  PlanTratamiento "1" *-- "1..*" Objetivo
  Objetivo "1" *-- "0..*" TareaPaciente
  Evaluacion "0..*" --> "1" PlantillaTest : versión aplicada
  PlantillaTest "1" *-- "1..*" ItemTest
  Evaluacion "1" *-- "0..*" Respuesta
  Respuesta "0..*" --> "1" ItemTest
  Evaluacion "0..1" --> "0..*" AlertaRiesgo : ítem crítico
  class Persona:::ext
  class Cita:::ext
  class Paciente:::agg
  class HistoriaPsicologica:::agg
  class NotaSesion:::agg
  class PlanTratamiento:::agg
  class Evaluacion:::agg
  class PlantillaTest:::agg
  class Apoderado:::ent
  class ConsentimientoInformado:::ent
  class Anamnesis:::ent
  class ImpresionDiagnostica:::ent
  class Adenda:::ent
  class Objetivo:::ent
  class TareaPaciente:::ent
  class ItemTest:::ent
  class Respuesta:::ent
  class AlertaRiesgo:::ent
  class Derivacion:::ent
  class AccesoHistoria:::ent

  classDef agg fill:#d5f5f0,stroke:#0f766e,color:#123
  classDef ent fill:#e8eef9,stroke:#3c5a99,color:#123
  classDef vo fill:#d9f2e3,stroke:#2e7d4f,color:#123
  classDef ext fill:#eeeeee,stroke:#616161,color:#123,stroke-dasharray: 4 3
```

## P-04 — Modelo de dominio · Cobros, paquetes y telepsicología

Un cobro corresponde a una cita o a la compra de un paquete y se salda con una intención de pago de la plataforma (en línea) o con pagos en caja; genera un comprobante electrónico o, para psicólogos independientes, el registro del recibo por honorarios emitido en SUNAT. El paquete lleva el saldo de sesiones con sus consumos. Una cita virtual tiene una sala con un enlace único por participante y su registro de conexiones.

```mermaid
classDiagram
  direction LR
  class Cobro {
    <<Aggregate>>
    +uuid id
    +ConceptoCobro concepto
    +Dinero total
    +EstadoCobro estado
    +registrarPago(medio, monto)
    +reembolsar(monto, motivo)
  }
  class PagoCaja {
    <<Entity>>
    +MedioPago medio
    +Dinero monto
    +string referencia
  }
  class Paquete {
    <<Aggregate>>
    +string nombre
    +int sesiones
    +Dinero precio
    +int vigenciaDias
  }
  class CompraPaquete {
    <<Aggregate>>
    +int compradas
    +int consumidas
    +int penalizadas
    +int reintegradas
    +date vence
    +int saldo()
    +consumir(citaId)
  }
  class ConsumoSesion {
    <<Entity>>
    +uuid citaId
    +TipoConsumo tipo
    +datetime en
  }
  class CreditoAFavor {
    <<Entity>>
    +Dinero monto
    +string origen
  }
  class ReciboHonorarios {
    <<Entity>>
    +string serieNumero
    +Dinero monto
    +bool retencion
    +uuid archivoId
  }
  class SalaVirtual {
    <<Aggregate>>
    +uuid citaId
    +string proveedorSalaId
    +datetime habilitaEn
    +datetime expiraEn
  }
  class EnlaceParticipante {
    <<Entity>>
    +RolParticipante rol
    +string tokenHash
    +bool usado
  }
  class RegistroConexion {
    <<Entity>>
    +datetime entro
    +datetime salio
    +string calidad
  }
  Cobro "0..*" --> "0..1" Cita : por sesión
  Cobro "0..1" --> "0..1" CompraPaquete : por paquete
  Cobro "1" *-- "0..*" PagoCaja
  Cobro "1" ..> "0..*" IntencionPago : pago en línea
  Cobro "1" ..> "0..*" Comprobante : boleta, factura o nota
  Cobro "1" --> "0..1" ReciboHonorarios : psicólogo independiente
  CompraPaquete "0..*" --> "1" Paquete
  CompraPaquete "0..*" --> "1" Paciente
  CompraPaquete "1" *-- "0..*" ConsumoSesion
  ConsumoSesion "0..1" --> "1" Cita
  Paciente "1" *-- "0..*" CreditoAFavor
  SalaVirtual "0..1" --> "1" Cita
  SalaVirtual "1" *-- "2..*" EnlaceParticipante
  EnlaceParticipante "1" *-- "0..*" RegistroConexion
  class Cita:::ext
  class Paciente:::ext
  class IntencionPago:::ext
  class Comprobante:::ext
  class Cobro:::agg
  class Paquete:::agg
  class CompraPaquete:::agg
  class SalaVirtual:::agg
  class PagoCaja:::ent
  class ConsumoSesion:::ent
  class CreditoAFavor:::ent
  class ReciboHonorarios:::ent
  class EnlaceParticipante:::ent
  class RegistroConexion:::ent

  classDef agg fill:#d5f5f0,stroke:#0f766e,color:#123
  classDef ent fill:#e8eef9,stroke:#3c5a99,color:#123
  classDef vo fill:#d9f2e3,stroke:#2e7d4f,color:#123
  classDef ext fill:#eeeeee,stroke:#616161,color:#123,stroke-dasharray: 4 3
```

## P-05 — Estados de la cita

Ciclo de vida del agregado Cita con las reglas de negocio que gobiernan cada transición (PSI-RN-005, 007, 008, 013, 036).

```mermaid
stateDiagram-v2
  [*] --> PENDIENTE_PAGO : reserva en línea con pago adelantado
  [*] --> RESERVADA : recepción o reserva sin adelanto
  PENDIENTE_PAGO --> RESERVADA : pago confirmado (webhook)
  PENDIENTE_PAGO --> CANCELADA : pago no confirmado en el plazo (liberación automática)
  RESERVADA --> CONFIRMADA : el paciente confirma (WhatsApp / portal)
  RESERVADA --> REPROGRAMADA : cambio de horario
  CONFIRMADA --> REPROGRAMADA : cambio de horario dentro de plazo
  REPROGRAMADA --> [*] : nace una nueva cita enlazada
  RESERVADA --> CANCELADA
  CONFIRMADA --> CANCELADA : dentro de plazo → reembolso o crédito
  CONFIRMADA --> EN_CURSO : inicio de la sesión / ingreso a la sala
  EN_CURSO --> ATENDIDA : fin de la sesión → consume paquete
  CONFIRMADA --> INASISTENCIA : no se presentó → penalidad según política
  ATENDIDA --> [*]
  CANCELADA --> [*] : horario ofrecido a la lista de espera
  INASISTENCIA --> [*]
```

## P-06 — Estados de la nota de sesión

La nota pasa de borrador a firmada; una vez firmada es inmutable y solo admite adendas (PSI-RN-011). Si no se firma en 72 horas se marca como atrasada (PSI-RN-012). El borrador generado con IA se identifica como tal y requiere revisión del profesional (PSI-RN-022).

```mermaid
stateDiagram-v2
  [*] --> BORRADOR : el profesional escribe
  [*] --> BORRADOR_IA : borrador generado con IA (con consentimiento)
  BORRADOR_IA --> BORRADOR : el profesional revisa y edita
  BORRADOR --> ATRASADA : 72 h sin firmar
  ATRASADA --> FIRMADA : firma tardía (queda marcada)
  BORRADOR --> FIRMADA : firma con MFA reciente
  FIRMADA --> FIRMADA : agregar adenda (texto, motivo, autor)
  FIRMADA --> [*]
```

## P-S1 — Secuencia · Reserva en línea con pago adelantado

El paciente reserva desde el sitio público: el horario se bloquea temporalmente en Redis y en la base (restricción de exclusión), se verifica el celular, se crea la cita en PENDIENTE_PAGO y se cobra con la plataforma. La confirmación llega por evento del webhook; si el pago no llega a tiempo, un trabajo libera el horario.

```mermaid
sequenceDiagram
  autonumber
  actor P as Paciente
  participant WEB as psi-web (SSR)
  participant API as api · psi-agenda
  participant NU as NU-AGE
  participant R as Redis
  participant DB as PostgreSQL (psi)
  participant PAG as Plataforma · Pagos
  participant NOT as Plataforma · Notificaciones
  P->>WEB: Elige servicio "Terapia individual", Dra. Rojas, 14/10 10:00
  WEB->>API: GET /v1/public/psi/disponibilidad
  API->>NU: disponibilidad(profesional, servicio, semana)
  NU-->>API: horarios libres
  WEB->>API: POST /v1/public/psi/reservas/bloqueo
  API->>R: SET bloqueo:prof:2026-10-14T10:00 NX EX 600
  API-->>WEB: bloqueo 10 min + OTP enviado al celular
  P->>WEB: ingresa OTP y datos (DNI, nombre, consentimiento de datos)
  WEB->>API: POST /v1/public/psi/reservas (Idempotency-Key)
  API->>DB: Persona/Paciente (si no existe) · Cita PENDIENTE_PAGO (EXCLUDE gist evita cruce)
  API->>PAG: crear intención de pago S/ 120,00 (origen cita)
  PAG-->>API: checkout
  API-->>WEB: redirigir a pago
  P->>PAG: paga con Yape
  PAG-->>API: evento pag.pago.confirmado
  API->>DB: Cita RESERVADA · outbox psi.cita.reservada
  API->>R: DEL bloqueo
  API->>NOT: confirmación por WhatsApp y correo (datos administrativos)
  Note over API,DB: Si no hay pago en el plazo, el trabajo psi.liberar-reservas pasa la cita a CANCELADA y ofrece el horario a la lista de espera
```

## P-S2 — Secuencia · Admisión y apertura de historia psicológica

En la primera sesión, recepción registra al paciente (con consulta de DNI) y su apoderado si es menor; el paciente firma los consentimientos vigentes y el profesional abre la historia con número correlativo de la empresa. Sin consentimiento firmado no se abre historia.

```mermaid
sequenceDiagram
  autonumber
  actor RC as Recepcionista
  participant BO as psi-backoffice
  participant API as api · psi-clinica
  participant IDN as Plataforma · Identidad
  participant PER as Plataforma · Personas
  participant ARC as Plataforma · Archivos
  participant SEQ as Plataforma · Correlativos
  participant DB as PostgreSQL
  actor PR as Psicóloga tratante
  RC->>BO: Registrar paciente DNI 74512369
  BO->>API: POST /v1/psi/pacientes
  API->>IDN: consultar DNI (motivo REGISTRO_PACIENTE)
  IDN-->>API: nombres y apellidos
  API->>PER: crear o vincular Persona del tenant
  API->>DB: Paciente (esMenor = false)
  RC->>BO: Firma de consentimientos (tablet)
  BO->>API: POST /v1/psi/pacientes/:id/consentimientos (atención, datos sensibles, telepsicología)
  API->>ARC: guardar PDF firmado con hash
  API->>DB: ConsentimientoInformado ×3 (versión de plantilla)
  PR->>API: POST /v1/psi/historias (paciente) · @Permiso('psi.historia.crear')
  API->>DB: ¿consentimiento de atención y datos sensibles vigentes?
  alt vigentes
    API->>SEQ: siguiente(empresa, HISTORIA, HP-2026)
    SEQ-->>API: 000124
    API->>DB: HistoriaPsicologica HP-2026-000124 · tratante = Psicóloga · aud.registro
    API-->>PR: historia abierta
  else falta consentimiento
    API-->>PR: 422 "Falta consentimiento de tratamiento de datos sensibles"
  end
```

## P-S3 — Secuencia · Sesión virtual, nota y firma

La sala se habilita 15 minutos antes con enlaces únicos por participante. Al terminar, la cita pasa a ATENDIDA (consume paquete) y el profesional escribe o revisa la nota; la firma exige MFA reciente y vuelve la nota inmutable.

```mermaid
sequenceDiagram
  autonumber
  actor PR as Psicóloga
  participant APP as psi-profesional
  participant API as api · psi-tele / psi-clinica
  participant VC as Servicio de videollamada
  actor PA as Paciente
  participant OB as sync.outbox
  Note over API: T-15 min: trabajo habilita la sala y envía el enlace del paciente
  API->>VC: crear sala (cita C-889, expira +60 min)
  VC-->>API: sala y tokens
  PA->>API: abre enlace único (token de un solo uso)
  API->>API: ¿consentimiento de telepsicología vigente?
  API-->>PA: sala de espera
  PR->>APP: Iniciar sesión C-889
  APP->>API: POST /v1/psi/citas/C-889/iniciar
  API->>VC: admitir paciente · RegistroConexion
  PR->>APP: Finalizar
  APP->>API: POST /v1/psi/citas/C-889/finalizar
  API->>OB: psi.cita.atendida
  OB-->>API: psi-cobros consume sesión del paquete (saldo 7 → 6)
  PR->>APP: escribe nota SOAP
  APP->>API: PUT /v1/psi/notas/:id (borrador)
  PR->>APP: Firmar
  APP->>API: POST /v1/psi/notas/:id/firmar · @Permiso('psi.nota.firmar') (sensible)
  API->>API: ¿MFA en los últimos 15 min? (claim amr/auth_time)
  API->>API: NotaSesion.firmar() → FIRMADA, hash del contenido
  API-->>APP: nota firmada e inmutable
```

## P-S4 — Secuencia · Venta de paquete en caja y comprobante

La recepcionista vende un paquete de 8 sesiones. El cobro se registra en PsicoAgenda; el comprobante lo emite la plataforma a partir del evento. Si el centro es un psicólogo independiente, en lugar del comprobante se registra el recibo por honorarios emitido en SUNAT.

```mermaid
sequenceDiagram
  autonumber
  actor RC as Recepcionista
  participant BO as psi-backoffice
  participant API as api · psi-cobros
  participant DB as PostgreSQL
  participant OB as sync.outbox
  participant FE as worker · Comprobantes
  RC->>BO: Vender paquete "8 sesiones" a paciente 74512369
  BO->>API: POST /v1/psi/paquetes/compras · @Permiso('psi.paquete.vender')
  API->>DB: CompraPaquete (8 sesiones, vence 90 días) · Cobro S/ 800,00 PENDIENTE
  RC->>BO: Registrar pago: Yape S/ 500 + efectivo S/ 300
  BO->>API: POST /v1/psi/cobros/:id/pagos
  API->>DB: PagoCaja ×2 · Cobro PAGADO
  API->>OB: psi.cobro.registrado (adquirente, ítems, afectación)
  alt centro con RUC
    OB-->>FE: emitir boleta B001
    FE-->>OB: fe.comprobante.aceptado
    OB-->>API: enlazar comprobante al cobro
  else psicólogo independiente
    RC->>BO: registrar recibo por honorarios E001-58 (PDF)
    BO->>API: POST /v1/psi/cobros/:id/recibo-honorarios
  end
  API-->>BO: estado de cuenta actualizado (saldo 8 sesiones)
```

## P-S5 — Secuencia · Evaluación en línea con ítem crítico

El profesional asigna un test al paciente, que lo responde en el portal. La calificación usa la versión de plantilla vigente al aplicarla; un ítem crítico en el umbral genera una alerta solo para el profesional tratante, sin mensajes automáticos al paciente (PSI-RN-024, 033, 034).

```mermaid
sequenceDiagram
  autonumber
  actor PR as Psicóloga
  participant APP as psi-profesional
  participant API as api · psi-clinica
  participant DB as PostgreSQL
  actor PA as Paciente
  participant POR as psi-web · portal
  participant NOT as Notificaciones
  PR->>APP: Asignar "Escala de depresión (v3)" a paciente
  APP->>API: POST /v1/psi/evaluaciones (plantilla v3)
  API->>DB: Evaluacion ASIGNADA
  API->>NOT: aviso al paciente "tienes un cuestionario pendiente" (sin detalle clínico)
  PA->>POR: responde el cuestionario
  POR->>API: POST /v1/portal/psi/evaluaciones/:id/respuestas
  API->>DB: Respuestas · calcula puntajes con la versión v3
  alt ítem crítico en el umbral
    API->>DB: AlertaRiesgo ALTA en la historia
    API->>NOT: notificación interna push/correo solo a la psicóloga tratante
  end
  API-->>POR: "Gracias, tu profesional revisará tus respuestas"
  PR->>APP: revisa resultado e interpretación
```

## P-S6 — Secuencia · Acceso de emergencia a una historia

Un profesional sin autorización necesita leer una historia (por ejemplo, reemplazo urgente). Solo el director puede activar el acceso de emergencia, con motivo y vigencia limitada; queda auditado y el tratante recibe aviso (PSI-RN-002, 040).

```mermaid
sequenceDiagram
  autonumber
  actor RE as Psicólogo de reemplazo
  participant APP as psi-profesional
  participant API as api · psi-clinica
  actor DI as Director
  participant BO as psi-backoffice
  participant DB as PostgreSQL
  participant NOT as Notificaciones
  RE->>APP: abrir historia HP-2026-000124
  APP->>API: GET /v1/psi/historias/HP-2026-000124
  API->>DB: ¿tratante o AccesoHistoria vigente?
  API-->>APP: 403 "Sin autorización sobre esta historia"
  RE->>DI: solicita acceso por urgencia
  DI->>BO: Acceso de emergencia (motivo, 4 h)
  BO->>API: POST /v1/psi/historias/:id/accesos-emergencia · @Permiso('psi.historia.acceso_emergencia') + MFA
  API->>DB: AccesoHistoria EMERGENCIA (hasta +4 h) · aud.registro
  API->>NOT: aviso a la psicóloga tratante
  RE->>APP: reintenta
  APP->>API: GET /v1/psi/historias/HP-2026-000124
  API->>DB: acceso vigente ✔ · aud.registro (lectura)
  API-->>APP: 200 historia (marca "acceso de emergencia")
```

## P-S7 — Secuencia · Cancelación por el paciente, reembolso y lista de espera

El paciente cancela desde el portal. Dentro del plazo de anticipación se reembolsa al medio original o se da crédito a favor; el horario liberado se ofrece al primero de la lista de espera, que tiene 30 minutos para aceptar (PSI-RN-007, 032, 036).

```mermaid
sequenceDiagram
  autonumber
  actor PA as Paciente
  participant POR as psi-web · portal
  participant API as api · psi-agenda / psi-cobros
  participant PAG as Plataforma · Pagos
  participant FE as Plataforma · Comprobantes
  participant DB as PostgreSQL
  participant NOT as Notificaciones
  actor P2 as Paciente en lista de espera
  PA->>POR: Cancelar cita del 14/10 10:00
  POR->>API: POST /v1/portal/psi/citas/C-889/cancelar
  API->>DB: ¿anticipación ≥ 24 h? → sí
  API->>DB: Cita CANCELADA · outbox psi.cita.cancelada
  alt reembolso al medio original
    API->>PAG: reembolso S/ 120,00 de la intención
    PAG-->>API: pag.reembolso.confirmado
    API->>FE: nota de crédito de B001-000245
  else crédito a favor
    API->>DB: CreditoAFavor S/ 120,00
  end
  API->>DB: primer paciente en ListaEspera para ese servicio y horario
  API->>NOT: ofrecer horario a P2 (expira en 30 min)
  P2->>API: acepta desde el enlace
  API->>DB: nueva Cita RESERVADA para P2
```
