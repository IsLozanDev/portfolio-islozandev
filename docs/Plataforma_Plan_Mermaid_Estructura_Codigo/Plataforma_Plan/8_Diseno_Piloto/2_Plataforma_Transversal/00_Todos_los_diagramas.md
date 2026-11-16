# 2 Plataforma Transversal

## T-01 — Plataforma: mapa de contextos acotados

Contextos acotados de la plataforma y sus relaciones. Organización y Seguridad son el núcleo del que dependen todos (aguas arriba). Personas, Catálogos, Parámetros y Correlativos son servicios de referencia. Comprobantes, Pagos, Notificaciones, Archivos y CMS son servicios de soporte consumidos por los productos mediante puertos (capa anticorrupción en cada producto). Eventos (outbox) conecta a todos de forma asíncrona.

```mermaid
flowchart TB
  ORG["Organización y suscripciones<br/>tenant · empresa · sucursal · unidad · plan"]:::core
  SEG["Seguridad<br/>usuario · membresía · rol · permiso · alcance"]:::core
  subgraph REF["Datos de referencia"]
    direction LR
    CAT["Catálogos y maestros"]:::ctx
    CFG["Parámetros"]:::ctx
    SEQ["Correlativos"]:::ctx
  end
  subgraph IDE["Identidad de terceros"]
    direction LR
    PER["Personas"]:::ctx
    IDN["Identidad DNI/RUC"]:::ctx
  end
  subgraph SOP["Servicios de soporte"]
    direction LR
    FE["Comprobantes electrónicos"]:::ctx
    PAG["Pagos"]:::ctx
    NOT["Notificaciones"]:::ctx
    ARC["Archivos"]:::ctx
    CMS["Contenidos web (CMS)"]:::ctx
    POR["Portal del cliente"]:::ctx
  end
  subgraph OPE["Operación"]
    direction LR
    AUD["Auditoría"]:::ctx
    EVT["Eventos (outbox)"]:::ctx
    OBS["Observabilidad"]:::ctx
    SPT["Centro de soporte"]:::ctx
  end
  PRD["Productos: PsicoAgenda, SazónPOS, …<br/>(consumen por puertos · ACL)"]:::ext
  ORG -- "U/D: contexto de tenant" --> SEG
  ORG --> REF & IDE & SOP
  SEG -- "autoriza" --> SOP
  PER -- "enriquece" --> IDN
  FE -- "usa series" --> SEQ
  FE -- "usa catálogos SUNAT" --> CAT
  PAG -- "evento pago.confirmado" --> EVT
  EVT --> FE & NOT & OBS
  POR -- "usuarios externos" --> SEG
  POR --> PER
  SOP & SEG -.-> AUD
  PRD --> ORG & SEG & REF & IDE & SOP
  PRD --> EVT
  OBS --> SPT

  classDef ctx fill:#ede7f6,stroke:#5e35b1,color:#123;
  classDef core fill:#d5f5f0,stroke:#0f766e,color:#123;
  classDef ext fill:#eeeeee,stroke:#616161,color:#123,stroke-dasharray: 4 3;
```

## T-02 — Modelo de dominio · Organización y suscripciones

Un tenant (cliente que contrata) agrupa una o más empresas con RUC; cada empresa tiene uno o más establecimientos (sucursales) y estos sus unidades operativas. El almacén central es la única unidad que puede pertenecer a la empresa sin sucursal. La suscripción habilita productos y fija límites.

```mermaid
classDiagram
  direction LR
  class Tenant {
    <<Aggregate>>
    +uuid id
    +string codigo
    +string nombre
    +EstadoTenant estado
    +suspender()
    +reactivar()
  }
  class Suscripcion {
    <<Entity>>
    +string productoCodigo
    +string plan
    +string edicion
    +EstadoSuscripcion estado
    +int limiteSucursales
    +int limiteUsuarios
    +date vigenteHasta
  }
  class Plan {
    <<Entity>>
    +string codigo
    +string productoCodigo
    +Dinero precioMensual
    +json caracteristicas
  }
  class Empresa {
    <<Aggregate>>
    +uuid id
    +Ruc ruc
    +string razonSocial
    +string nombreComercial
    +Direccion domicilioFiscal
  }
  class Sucursal {
    <<Entity>>
    +uuid id
    +string codigo
    +string nombre
    +char4 codigoEstablecimientoSunat
    +string zonaHoraria
    +bool esPrincipal
  }
  class UnidadOperativa {
    <<Entity>>
    +uuid id
    +TipoUnidad tipo
    +string codigo
    +json atributos
  }
  class Ruc {
    <<ValueObject>>
    +char11 valor
    +bool digitoVerificadorValido()
  }
  class TipoUnidad {
    <<Enumeration>>
    ALMACEN
    CAJA
    CONSULTORIO
    VENTANILLA
    OFICINA
  }
  Tenant "1" *-- "1..*" Empresa : agrupa
  Tenant "1" *-- "1..*" Suscripcion : contrata
  Suscripcion "0..*" --> "1" Plan : según
  Empresa "1" *-- "1..*" Sucursal : establecimientos
  Empresa *-- Ruc
  Sucursal "1" *-- "0..*" UnidadOperativa : contiene
  Empresa "1" o-- "0..*" UnidadOperativa : almacén central (sin sucursal)
  UnidadOperativa "0..1" --> "0..*" UnidadOperativa : padre de
  UnidadOperativa --> TipoUnidad
  class Tenant:::agg
  class Empresa:::agg
  class Suscripcion:::ent
  class Plan:::ent
  class Sucursal:::ent
  class UnidadOperativa:::ent
  class Ruc:::vo
  class TipoUnidad:::vo

  classDef agg fill:#ede7f6,stroke:#5e35b1,color:#123
  classDef ent fill:#e8eef9,stroke:#3c5a99,color:#123
  classDef vo fill:#d9f2e3,stroke:#2e7d4f,color:#123
  classDef ext fill:#eeeeee,stroke:#616161,color:#123,stroke-dasharray: 4 3
```

## T-03 — Modelo de dominio · Seguridad

La identidad (credenciales, MFA, OAuth) la resuelve el IdP; la plataforma guarda la autorización. Un usuario tiene una membresía por tenant; cada membresía tiene asignaciones de un rol o de un perfil con un alcance (tenant, empresa, sucursal o unidad) y vigencia. Los roles agrupan permisos de un producto; los perfiles agrupan roles de varios productos. Las opciones de menú exigen permisos.

```mermaid
classDiagram
  direction LR
  class Usuario {
    <<Aggregate>>
    +uuid id
    +string idpSub
    +Email email
    +string nombre
    +TipoUsuario tipo
    +EstadoUsuario estado
  }
  class Membresia {
    <<Aggregate>>
    +uuid id
    +EstadoMembresia estado
    +bool esPropietario
    +datetime desde
    +datetime hasta
    +invitar()
    +suspender()
  }
  class Asignacion {
    <<Entity>>
    +Alcance alcance
    +date vigenteDesde
    +date vigenteHasta
    +uuid otorgadoPor
  }
  class Rol {
    <<Aggregate>>
    +uuid id
    +string productoCodigo
    +string codigo
    +string nombre
    +bool editable
  }
  class Perfil {
    <<Entity>>
    +string codigo
    +string nombre
  }
  class Permiso {
    <<Entity>>
    +string codigo
    +string descripcion
    +NivelAlcance alcanceMinimo
    +bool sensible
  }
  class Producto {
    <<Entity>>
    +string codigo
    +string nombre
  }
  class Modulo {
    <<Entity>>
    +string codigo
    +int orden
  }
  class Opcion {
    <<Entity>>
    +string codigo
    +string ruta
    +string icono
  }
  class Alcance {
    <<ValueObject>>
    +NivelAlcance nivel
    +uuid empresaId
    +uuid sucursalId
    +uuid unidadId
  }
  class EventoSeguridad {
    <<Entity>>
    +TipoEventoSeg tipo
    +json detalle
    +datetime ocurridoEn
  }
  class AccesoSoporte {
    <<Entity>>
    +uuid ticketId
    +datetime expiraEn
    +string motivo
  }
  Usuario "1" *-- "0..*" Membresia : pertenece a tenants
  Membresia "0..*" --> "1" Tenant
  Membresia "1" *-- "1..*" Asignacion : tiene
  Asignacion "0..*" --> "0..1" Rol : rol
  Asignacion "0..*" --> "0..1" Perfil : o perfil
  Asignacion *-- Alcance
  Perfil "0..*" o-- "1..*" Rol : agrupa
  Rol "0..*" --> "1..*" Permiso : concede
  Rol "0..*" --> "0..1" Tenant : propio del cliente (NULL = predefinido)
  Producto "1" *-- "1..*" Modulo
  Modulo "1" *-- "1..*" Opcion
  Opcion "0..*" --> "1..*" Permiso : requiere
  Producto "1" *-- "1..*" Permiso : declara
  Usuario "1" --> "0..*" EventoSeguridad : genera
  Usuario "1" --> "0..*" AccesoSoporte : soporte temporal
  class Tenant:::ext
  class Usuario:::agg
  class Membresia:::agg
  class Rol:::agg
  class Asignacion:::ent
  class Perfil:::ent
  class Permiso:::ent
  class Producto:::ent
  class Modulo:::ent
  class Opcion:::ent
  class EventoSeguridad:::ent
  class AccesoSoporte:::ent
  class Alcance:::vo

  classDef agg fill:#ede7f6,stroke:#5e35b1,color:#123
  classDef ent fill:#e8eef9,stroke:#3c5a99,color:#123
  classDef vo fill:#d9f2e3,stroke:#2e7d4f,color:#123
  classDef ext fill:#eeeeee,stroke:#616161,color:#123,stroke-dasharray: 4 3
```

## T-04 — Modelo de dominio · Catálogos, parámetros y correlativos

Un catálogo tiene ítems globales (tenant nulo) y propios de un tenant; el tenant puede ajustar un ítem global (alias, orden, visibilidad). Los parámetros tienen una definición y valores por nivel; el valor efectivo es el más específico. Las series correlativas se definen por empresa, tipo y serie, con alcance opcional de sucursal o unidad y regla de reinicio.

```mermaid
classDiagram
  direction LR
  class Catalogo {
    <<Aggregate>>
    +string codigo
    +string nombre
    +AlcanceCatalogo alcance
    +string fuente
    +bool editablePorTenant
    +int version
  }
  class CatalogoItem {
    <<Entity>>
    +uuid tenantId
    +string codigo
    +string codigoExterno
    +string nombre
    +json atributos
    +Vigencia vigencia
    +bool activo
  }
  class AjusteItemTenant {
    <<Entity>>
    +uuid tenantId
    +bool visible
    +string alias
    +int orden
  }
  class TablaMaestra {
    <<Entity>>
    +Ubigeo · CIE10 · Moneda · Feriado
  }
  class ParametroDef {
    <<Aggregate>>
    +string codigo
    +string productoCodigo
    +TipoDato tipo
    +json valorDefecto
    +NivelAlcance alcanceMaximo
  }
  class ParametroValor {
    <<Entity>>
    +uuid tenantId
    +uuid empresaId
    +uuid sucursalId
    +json valor
  }
  class SerieCorrelativo {
    <<Aggregate>>
    +uuid empresaId
    +uuid sucursalId
    +uuid unidadId
    +string tipo
    +string serie
    +long ultimoNumero
    +Reinicio reinicio
    +string periodo
    +siguiente(fechaLocal) long
  }
  class Vigencia {
    <<ValueObject>>
    +date desde
    +date hasta
  }
  class Reinicio {
    <<Enumeration>>
    NUNCA
    ANUAL
    DIARIO
  }
  Catalogo "1" *-- "1..*" CatalogoItem : ítems
  CatalogoItem "1" *-- "0..*" AjusteItemTenant : ajustes por tenant
  CatalogoItem *-- Vigencia
  ParametroDef "1" *-- "0..*" ParametroValor : valores por nivel
  ParametroValor "0..*" --> "1" Tenant
  SerieCorrelativo "0..*" --> "1" Empresa
  SerieCorrelativo "0..*" --> "0..1" Sucursal
  SerieCorrelativo --> Reinicio
  class Tenant:::ext
  class Empresa:::ext
  class Sucursal:::ext
  class Catalogo:::agg
  class ParametroDef:::agg
  class SerieCorrelativo:::agg
  class CatalogoItem:::ent
  class AjusteItemTenant:::ent
  class ParametroValor:::ent
  class TablaMaestra:::ent
  class Vigencia:::vo
  class Reinicio:::vo

  classDef agg fill:#ede7f6,stroke:#5e35b1,color:#123
  classDef ent fill:#e8eef9,stroke:#3c5a99,color:#123
  classDef vo fill:#d9f2e3,stroke:#2e7d4f,color:#123
  classDef ext fill:#eeeeee,stroke:#616161,color:#123,stroke-dasharray: 4 3
```

## T-05 — Modelo de dominio · Personas e identidad

La persona pertenece a un tenant (titular del banco de datos) y es natural o jurídica, con documentos, contactos, direcciones con ubigeo y consentimientos versionados. La caché de identidad es global y solo guarda la identidad mínima de la fuente; la identidad portable pertenece al titular, que autoriza campos a un tenant.

```mermaid
classDiagram
  direction TB
  class Persona {
    <<Aggregate>>
    +uuid id
    +uuid tenantId
    +TipoPersona tipo
    +DocumentoIdentidad documento
    +bool documentoVerificado
    +bool activo
  }
  class PersonaNatural {
    <<Entity>>
    +string nombres
    +string apellidoPaterno
    +string apellidoMaterno
    +date fechaNacimiento
    +string sexo
  }
  class PersonaJuridica {
    <<Entity>>
    +string razonSocial
    +string nombreComercial
  }
  class Contacto {
    <<Entity>>
    +TipoContacto tipo
    +string valor
    +bool principal
    +bool verificado
  }
  class Direccion {
    <<Entity>>
    +string via
    +Ubigeo ubigeo
    +string referencia
  }
  class Consentimiento {
    <<Entity>>
    +string finalidad
    +string versionTexto
    +datetime otorgadoEn
    +datetime revocadoEn
    +string evidencia
  }
  class Relacion {
    <<Entity>>
    +TipoRelacion tipo
    +date desde
  }
  class DocumentoIdentidad {
    <<ValueObject>>
    +string tipoCodigo
    +string numero
    +bool valido()
  }
  class CacheDocumento {
    <<Entity>>
    +string tipoDoc
    +string numero
    +json datosMinimos
    +datetime expiraEn
  }
  class Titular {
    <<Aggregate>>
    +DocumentoIdentidad documento
    +string celular
    +json datosPortables
  }
  class Autorizacion {
    <<Entity>>
    +uuid tenantId
    +string[] campos
    +datetime vigenteHasta
    +datetime revocadaEn
  }
  Persona <|-- PersonaNatural
  Persona <|-- PersonaJuridica
  Persona *-- DocumentoIdentidad
  Persona "1" *-- "0..*" Contacto
  Persona "1" *-- "0..*" Direccion
  Persona "1" *-- "0..*" Consentimiento
  Persona "1" --> "0..*" Relacion : apoderado, tutor, representante
  Relacion "0..*" --> "1" Persona : con
  Persona "0..*" ..> "0..1" CacheDocumento : verificada con
  Titular "1" *-- "0..*" Autorizacion : otorga
  Autorizacion "0..*" --> "1" Tenant
  class Tenant:::ext
  class Persona:::agg
  class Titular:::agg
  class PersonaNatural:::ent
  class PersonaJuridica:::ent
  class Contacto:::ent
  class Direccion:::ent
  class Consentimiento:::ent
  class Relacion:::ent
  class CacheDocumento:::ent
  class Autorizacion:::ent
  class DocumentoIdentidad:::vo

  classDef agg fill:#ede7f6,stroke:#5e35b1,color:#123
  classDef ent fill:#e8eef9,stroke:#3c5a99,color:#123
  classDef vo fill:#d9f2e3,stroke:#2e7d4f,color:#123
  classDef ext fill:#eeeeee,stroke:#616161,color:#123,stroke-dasharray: 4 3
```

## T-06 — Modelo de dominio · Comprobantes electrónicos y pagos

Un cobro de un producto genera una intención de pago en la plataforma; la pasarela confirma una o más transacciones (incluye reembolsos). Un comprobante pertenece a una empresa y a una serie del establecimiento, tiene ítems con afectación de IGV y una o más gestiones de envío al PSE/OSE con su respuesta (CDR). Las notas de crédito referencian el comprobante original.

```mermaid
classDiagram
  direction LR
  class IntencionPago {
    <<Aggregate>>
    +uuid id
    +string origenProducto
    +uuid origenId
    +Dinero monto
    +EstadoPago estado
    +string idempotencyKey
    +confirmar()
    +expirar()
  }
  class Transaccion {
    <<Entity>>
    +MedioPago medio
    +string referenciaPasarela
    +Dinero monto
    +TipoTransaccion tipo
    +datetime ocurridaEn
  }
  class Conciliacion {
    <<Entity>>
    +date fecha
    +Dinero totalPasarela
    +Dinero totalSistema
    +EstadoConciliacion estado
  }
  class Comprobante {
    <<Aggregate>>
    +uuid id
    +TipoComprobante tipo
    +string serie
    +long numero
    +Adquirente adquirente
    +Dinero gravado
    +Dinero igv
    +Dinero total
    +EstadoCpe estado
    +emitir()
    +anular(motivo)
  }
  class ComprobanteItem {
    <<Entity>>
    +string descripcion
    +decimal cantidad
    +string unidadSunat
    +Dinero valorUnitario
    +string afectacionIgv
  }
  class EnvioPse {
    <<Entity>>
    +int intento
    +string codigoRespuesta
    +string cdrRuta
    +string xmlRuta
    +datetime enviadoEn
  }
  class ResumenDiario {
    <<Entity>>
    +date fecha
    +string ticket
    +EstadoCpe estado
  }
  class Dinero {
    <<ValueObject>>
    +decimal monto
    +string moneda
  }
  class Adquirente {
    <<ValueObject>>
    +DocumentoIdentidad documento
    +string nombre
  }
  IntencionPago "1" *-- "0..*" Transaccion : pagos y reembolsos
  Transaccion "0..*" --> "0..1" Conciliacion : conciliada en
  IntencionPago "0..1" ..> "0..*" Comprobante : origina
  Comprobante "1" *-- "1..*" ComprobanteItem
  Comprobante "1" *-- "1..*" EnvioPse : intentos
  Comprobante "0..*" --> "0..1" Comprobante : nota de crédito de
  Comprobante "0..*" --> "1" Empresa : emisor
  Comprobante "0..*" --> "1" SerieCorrelativo : numerado por
  Comprobante "0..*" --> "0..1" ResumenDiario : boletas resumidas
  Comprobante *-- Adquirente
  IntencionPago *-- Dinero
  class Empresa:::ext
  class SerieCorrelativo:::ext
  class IntencionPago:::agg
  class Comprobante:::agg
  class Transaccion:::ent
  class Conciliacion:::ent
  class ComprobanteItem:::ent
  class EnvioPse:::ent
  class ResumenDiario:::ent
  class Dinero:::vo
  class Adquirente:::vo

  classDef agg fill:#ede7f6,stroke:#5e35b1,color:#123
  classDef ent fill:#e8eef9,stroke:#3c5a99,color:#123
  classDef vo fill:#d9f2e3,stroke:#2e7d4f,color:#123
  classDef ext fill:#eeeeee,stroke:#616161,color:#123,stroke-dasharray: 4 3
```

## T-07 — Modelo de dominio · Notificaciones, archivos, auditoría y eventos

Servicios de soporte de uso general. Una plantilla por canal genera mensajes con intentos de entrega y respeta las preferencias del destinatario. Los archivos tienen versiones con hash. La auditoría es inmutable y el outbox guarda cada evento de dominio con su avance por suscriptor.

```mermaid
classDiagram
  direction LR
  class Plantilla {
    <<Aggregate>>
    +string codigo
    +Canal canal
    +string asunto
    +string cuerpo
    +string[] variables
    +string idPlantillaProveedor
  }
  class Mensaje {
    <<Aggregate>>
    +uuid id
    +Canal canal
    +string destino
    +json datos
    +datetime programadoPara
    +EstadoMensaje estado
  }
  class IntentoEntrega {
    <<Entity>>
    +int numero
    +string respuestaProveedor
    +datetime en
  }
  class Preferencia {
    <<Entity>>
    +uuid personaId
    +Canal canal
    +string finalidad
    +bool aceptado
  }
  class Archivo {
    <<Aggregate>>
    +uuid id
    +string nombre
    +string tipoMime
    +Clasificacion clasificacion
    +string propietarioTipo
    +uuid propietarioId
  }
  class VersionArchivo {
    <<Entity>>
    +int version
    +string sha256
    +long bytes
    +string rutaStorage
  }
  class RegistroAuditoria {
    <<Entity>>
    +uuid tenantId
    +uuid usuarioId
    +string accion
    +string entidad
    +uuid entidadId
    +json antes
    +json despues
  }
  class EventoOutbox {
    <<Entity>>
    +long seq
    +uuid eventId
    +string aggregateType
    +string eventType
    +long version
    +json payload
  }
  class Suscriptor {
    <<Entity>>
    +string nombre
    +long ultimoSeqConfirmado
  }
  Plantilla "1" --> "0..*" Mensaje : genera
  Mensaje "1" *-- "1..*" IntentoEntrega
  Mensaje "0..*" ..> "0..1" Preferencia : verifica
  Archivo "1" *-- "1..*" VersionArchivo
  Suscriptor "0..*" ..> "0..*" EventoOutbox : consume desde seq
  class Plantilla:::agg
  class Mensaje:::agg
  class Archivo:::agg
  class IntentoEntrega:::ent
  class Preferencia:::ent
  class VersionArchivo:::ent
  class RegistroAuditoria:::ent
  class EventoOutbox:::ent
  class Suscriptor:::ent

  classDef agg fill:#ede7f6,stroke:#5e35b1,color:#123
  classDef ent fill:#e8eef9,stroke:#3c5a99,color:#123
  classDef vo fill:#d9f2e3,stroke:#2e7d4f,color:#123
  classDef ext fill:#eeeeee,stroke:#616161,color:#123,stroke-dasharray: 4 3
```

## T-08 — Modelo de dominio · Contenidos web (CMS) y portal del cliente

Cada tenant puede tener un sitio por producto con dominio propio o subdominio y su marca. El sitio tiene páginas con versiones (borrador/publicada) compuestas por bloques ordenados, menús, artículos y medios. La cuenta de cliente del portal es un usuario externo de Seguridad enlazado a una Persona del tenant.

```mermaid
classDiagram
  direction LR
  class Sitio {
    <<Aggregate>>
    +uuid id
    +uuid tenantId
    +string productoCodigo
    +Marca marca
    +string idioma
    +EstadoSitio estado
  }
  class Dominio {
    <<Entity>>
    +string host
    +bool principal
    +EstadoDominio verificacion
  }
  class Pagina {
    <<Aggregate>>
    +uuid id
    +string slug
    +string titulo
    +Seo seo
    +datetime publicarEn
  }
  class VersionPagina {
    <<Entity>>
    +int numero
    +EstadoContenido estado
    +uuid autorId
  }
  class Bloque {
    <<Entity>>
    +string tipo
    +int orden
    +json propiedades
  }
  class Menu {
    <<Entity>>
    +string ubicacion
    +json items
  }
  class Articulo {
    <<Aggregate>>
    +string slug
    +string titulo
    +string resumen
    +EstadoContenido estado
  }
  class Medio {
    <<Entity>>
    +uuid archivoId
    +string textoAlternativo
  }
  class Marca {
    <<ValueObject>>
    +string logoUrl
    +string colorPrimario
    +string colorSecundario
  }
  class Seo {
    <<ValueObject>>
    +string metaTitulo
    +string metaDescripcion
    +string urlCanonica
  }
  class CuentaCliente {
    <<Aggregate>>
    +uuid usuarioId
    +uuid personaId
    +datetime registradoEn
  }
  Sitio "1" *-- "1..*" Dominio
  Sitio "1" *-- "0..*" Pagina
  Sitio "1" *-- "0..*" Menu
  Sitio "1" *-- "0..*" Articulo
  Sitio "1" *-- "0..*" Medio
  Sitio *-- Marca
  Pagina "1" *-- "1..*" VersionPagina
  VersionPagina "1" *-- "0..*" Bloque : compuesta por
  Pagina *-- Seo
  CuentaCliente "0..*" --> "1" Sitio : se registra en
  CuentaCliente "1" --> "1" Usuario : usuario externo
  CuentaCliente "1" --> "1" Persona : del tenant
  class Usuario:::ext
  class Persona:::ext
  class Sitio:::agg
  class Pagina:::agg
  class Articulo:::agg
  class CuentaCliente:::agg
  class Dominio:::ent
  class VersionPagina:::ent
  class Bloque:::ent
  class Menu:::ent
  class Medio:::ent
  class Marca:::vo
  class Seo:::vo

  classDef agg fill:#ede7f6,stroke:#5e35b1,color:#123
  classDef ent fill:#e8eef9,stroke:#3c5a99,color:#123
  classDef vo fill:#d9f2e3,stroke:#2e7d4f,color:#123
  classDef ext fill:#eeeeee,stroke:#616161,color:#123,stroke-dasharray: 4 3
```

## T-09 — Modelo de dominio · Centro de soporte y observabilidad

Modelo de la Plataforma de Operación: los tickets toman los plazos del plan contratado y pueden nacer de una alerta; varios tickets se agrupan en un problema enlazado al backlog. Los indicadores de negocio alimentan reglas que abren alertas deduplicadas por sucursal.

```mermaid
classDiagram
  direction LR
  class Ticket {
    <<Aggregate>>
    +string numero
    +TipoTicket tipo
    +Prioridad prioridad
    +EstadoTicket estado
    +Nivel nivel
    +json contexto
    +datetime resolucionVence
    +cambiarEstado(nuevo)
  }
  class EventoTicket {
    <<Entity>>
    +TipoEvento tipo
    +bool visibleCliente
    +string texto
  }
  class Problema {
    <<Aggregate>>
    +string githubIssue
    +string versionCorreccion
    +EstadoProblema estado
  }
  class PoliticaSla {
    <<Entity>>
    +string plan
    +Prioridad prioridad
    +int primeraRespuestaMin
    +int resolucionMin
    +Horario horario
  }
  class ArticuloKb {
    <<Entity>>
    +string titulo
    +bool publicado
  }
  class IndicadorDef {
    <<Entity>>
    +string codigo
    +Agregacion agregacion
  }
  class MetricaMinuto {
    <<Entity>>
    +datetime minuto
    +decimal suma
    +int conteo
  }
  class ReglaAlerta {
    <<Aggregate>>
    +CondicionAlerta condicion
    +decimal umbral
    +int ventanaMin
    +bool creaTicket
  }
  class Alerta {
    <<Entity>>
    +Severidad severidad
    +EstadoAlerta estado
    +decimal valor
    +decimal referencia
  }
  Ticket "1" *-- "1..*" EventoTicket
  Ticket "0..*" --> "0..1" Problema : agrupado en
  Ticket "0..*" --> "1" PoliticaSla : plazos según plan
  Ticket "0..1" --> "0..1" Alerta : originado por
  Ticket "0..*" --> "1" Tenant
  IndicadorDef "1" *-- "0..*" MetricaMinuto : serie por sucursal
  IndicadorDef "1" --> "0..*" ReglaAlerta
  ReglaAlerta "1" --> "0..*" Alerta : dispara
  Alerta "0..*" --> "1" Sucursal
  class Tenant:::ext
  class Sucursal:::ext
  class Ticket:::agg
  class Problema:::agg
  class ReglaAlerta:::agg
  class EventoTicket:::ent
  class PoliticaSla:::ent
  class ArticuloKb:::ent
  class IndicadorDef:::ent
  class MetricaMinuto:::ent
  class Alerta:::ent

  classDef agg fill:#ede7f6,stroke:#5e35b1,color:#123
  classDef ent fill:#e8eef9,stroke:#3c5a99,color:#123
  classDef vo fill:#d9f2e3,stroke:#2e7d4f,color:#123
  classDef ext fill:#eeeeee,stroke:#616161,color:#123,stroke-dasharray: 4 3
```

## T-S1 — Secuencia · Alta de un nuevo cliente (tenant)

Alta asistida desde la consola de plataforma: valida el RUC, crea tenant, empresa, sucursal principal y suscripción, siembra roles y parámetros por defecto e invita al administrador del cliente, todo en una transacción con eventos al outbox.

```mermaid
sequenceDiagram
  autonumber
  actor OP as Operador de plataforma
  participant C as plataforma-consola
  participant API as api · OrgModule
  participant IDN as IdentidadService
  participant DB as PostgreSQL
  participant SEG as SeguridadService
  participant IDP as IdP
  participant NOT as worker · Notificaciones
  OP->>C: Alta de cliente (RUC, plan, producto PSI, admin@centro.pe)
  C->>API: POST /v1/plataforma/tenants
  API->>IDN: consultar RUC 20601234565
  IDN-->>API: razón social, estado ACTIVO, condición HABIDO
  API->>DB: BEGIN · tenant · empresa · sucursal principal · suscripción PSI
  API->>SEG: sembrar roles predefinidos y membresía del administrador (INVITADO)
  SEG->>DB: seg.membresia · seg.asignacion (alcance TENANT)
  API->>DB: parámetros por defecto · series HP · outbox org.tenant.creado · COMMIT
  API->>IDP: crear usuario o invitación (correo)
  API-->>C: 201 tenant creado
  DB-->>NOT: outbox relay: org.tenant.creado
  NOT->>NOT: correo de bienvenida con enlace de activación
```

## T-S2 — Secuencia · Inicio de sesión, sucursal activa y autorización

El IdP autentica; la plataforma decide qué puede hacer el usuario. Tras el login, el shell consulta las sucursales accesibles; si hay más de una, el usuario elige. Cada solicitud lleva JWT y X-Sucursal-Id; el guard resuelve permisos efectivos (con caché versionada) y publica el contexto que usan RLS y la auditoría.

```mermaid
sequenceDiagram
  autonumber
  actor U as Psicóloga
  participant FE as psi-profesional (shared/auth)
  participant IDP as IdP (OIDC + MFA)
  participant API as api · ContextoSucursalGuard
  participant R as Redis (caché de permisos)
  participant DB as PostgreSQL (seg)
  U->>FE: Iniciar sesión
  FE->>IDP: Authorization Code + PKCE
  IDP-->>FE: id_token · access_token (sub)
  FE->>API: GET /v1/seguridad/mi-contexto
  API->>DB: sucursales_accesibles(usuario)
  DB-->>API: [Sede Miraflores, Sede San Isidro]
  API-->>FE: sucursales + productos habilitados
  U->>FE: Elige Sede Miraflores
  FE->>API: GET /v1/seguridad/menu · X-Sucursal-Id
  API->>R: permisos:{usuario}:{sucursal}:v{versión}
  alt no está en caché
    API->>DB: permisos_efectivos(usuario, tenant, sucursal)
    API->>R: guardar (TTL 15 min)
  end
  API-->>FE: menú + permisos (psi.historia.ver, …)
  FE->>API: GET /v1/psi/historias/HP-2026-000123 · @Permiso('psi.historia.ver')
  API->>API: ¿permiso sensible? → exige MFA reciente (claim amr)
  API->>DB: SET LOCAL app.tenant_id, app.usuario_id · consulta con RLS
  API->>DB: aud.registro (acceso a historia)
  API-->>FE: 200 historia
```

## T-S3 — Secuencia · Emisión de comprobante electrónico

El producto no conoce al PSE/OSE: publica el evento de cobro confirmado y el componente de comprobantes toma la serie del establecimiento, arma el documento con catálogos SUNAT y la tasa de IGV de la empresa, lo envía con reintentos y notifica el resultado.

```mermaid
sequenceDiagram
  autonumber
  participant PSI as psi-cobros
  participant OB as sync.outbox
  participant W as worker · FacturacionProcessor
  participant SEQ as SeqService
  participant CFG as ParametrosService
  participant PSE as PSE/OSE (adaptador)
  participant ARC as Archivos
  participant NOT as Notificaciones
  PSI->>OB: psi.cobro.registrado (monto, adquirente, ítems)
  OB-->>W: evento (relay)
  W->>W: idempotencia por event_id
  W->>SEQ: siguiente(empresa, BOLETA, B001)
  SEQ-->>W: 000245
  W->>CFG: plat.igv.tasa (empresa) · afectación del servicio
  W->>W: arma UBL 2.1 con catálogos 01/03/06/07
  W->>PSE: enviar B001-000245
  alt aceptado
    PSE-->>W: CDR aceptado
    W->>ARC: guardar XML, CDR y PDF
    W->>OB: fe.comprobante.aceptado
    W->>NOT: enviar PDF al correo del paciente
  else rechazado o sin respuesta
    PSE-->>W: error / timeout
    W->>W: reintento con backoff (máx. 5) · luego alerta
    W->>OB: fe.comprobante.rechazado
  end
```

## T-S4 — Secuencia · Pago en línea con confirmación por webhook

La intención de pago se crea con clave de idempotencia; el paciente paga en la pasarela y la confirmación llega por webhook firmado. La plataforma verifica la firma, registra la transacción y publica el evento que consume el producto (no confía en la redirección del navegador).

```mermaid
sequenceDiagram
  autonumber
  actor P as Paciente
  participant WEB as psi-web
  participant API as api · PagosModule
  participant PG as Pasarela
  participant DB as PostgreSQL (pag)
  participant OB as sync.outbox
  WEB->>API: POST /v1/pagos/intenciones (cita C-889, S/ 120,00, Idempotency-Key)
  API->>DB: IntencionPago PENDIENTE (expira en 10 min)
  API->>PG: crear checkout
  PG-->>API: url / token de pago
  API-->>WEB: datos de checkout
  P->>PG: paga con tarjeta o Yape
  PG-->>WEB: redirección "pago en proceso"
  PG->>API: POST /v1/pagos/webhook (firma HMAC)
  API->>API: verifica firma y que el evento no esté procesado
  API->>DB: Transaccion APROBADA · IntencionPago CONFIRMADA
  API->>OB: pag.pago.confirmado (origen PSI, cita C-889)
  API-->>PG: 200
  WEB->>API: GET estado de la intención (sondeo o Socket.IO)
  API-->>WEB: CONFIRMADA
```

## T-S5 — Secuencia · Recordatorio programado con preferencias del paciente

Los recordatorios se programan como trabajos diferidos; al ejecutarse se vuelve a verificar que la cita siga vigente y que el paciente acepte ese canal. El mensaje solo lleva datos administrativos.

```mermaid
sequenceDiagram
  autonumber
  participant PSI as psi-agenda
  participant OB as sync.outbox
  participant W as worker · NotificacionesProcessor
  participant Q as BullMQ (Redis)
  participant DB as PostgreSQL
  participant WA as WhatsApp BSP
  PSI->>OB: psi.cita.confirmada (fecha 14/10 10:00)
  OB-->>W: evento
  W->>Q: programar recordatorio a T-24 h y T-2 h
  Q-->>W: dispara T-24 h
  W->>DB: ¿cita sigue confirmada? ¿preferencia WhatsApp aceptada?
  alt vigente y aceptado
    W->>WA: plantilla aprobada "recordatorio_cita" (fecha, hora, sede)
    WA-->>W: aceptado · id de mensaje
    W->>DB: Mensaje ENVIADO
    WA-->>W: webhook entregado / leído
  else cancelada o sin consentimiento
    W->>DB: Mensaje DESCARTADO (motivo)
  end
```

## T-S6 — Secuencia · Publicación de contenido y render SSR del sitio

El editor arma la página con bloques en el backoffice; al publicar se congela una versión y se invalida la caché del CDN. La aplicación pública resuelve el tenant por el dominio y renderiza en servidor los bloques con la librería cms-render.

```mermaid
sequenceDiagram
  autonumber
  actor E as Editor de contenidos
  participant BO as psi-backoffice · cms-editor
  participant API as api · CmsModule
  participant DB as PostgreSQL (cms)
  participant CDN as CDN
  actor V as Visitante
  participant SSR as psi-web (SSR)
  E->>BO: edita página "Terapia de pareja" (bloques, SEO)
  BO->>API: PUT /v1/cms/paginas/:id/borrador
  E->>BO: Publicar
  BO->>API: POST /v1/cms/paginas/:id/publicar · @Permiso('cms.pagina.publicar')
  API->>DB: VersionPagina n PUBLICADA · outbox cms.pagina.publicada
  API->>CDN: purgar /terapia-de-pareja
  V->>CDN: GET centrocalma.pe/terapia-de-pareja
  CDN->>SSR: cache miss
  SSR->>API: GET /v1/cms/sitio?host=centrocalma.pe&slug=terapia-de-pareja
  API-->>SSR: marca, menú, bloques publicados, SEO
  SSR-->>CDN: HTML renderizado (cache 10 min)
  CDN-->>V: página
```

## T-S7 — Secuencia · Relay del outbox hacia los consumidores

El cambio de estado y su evento se guardan en la misma transacción. El relay del worker lee por cursor con margen de seguridad, entrega a las colas de cada consumidor y avanza el cursor; los consumidores son idempotentes por event_id.

```mermaid
sequenceDiagram
  autonumber
  participant UC as Caso de uso (api)
  participant DB as PostgreSQL
  participant RL as worker · OutboxRelay
  participant Q as BullMQ
  participant C1 as Consumidor FE
  participant C2 as Consumidor notificaciones
  participant C3 as Observabilidad de negocio
  UC->>DB: BEGIN · UPDATE cita · INSERT sync.outbox · COMMIT
  loop cada 500 ms
    RL->>DB: read_events(cursor, límite 200, margen 5 s)
    DB-->>RL: eventos seq 1201..1240
    RL->>Q: encolar por tipo de evento y consumidor
    RL->>DB: avanzar cursor a 1240
  end
  Q-->>C1: pag.pago.confirmado
  Q-->>C2: psi.cita.confirmada
  Q-->>C3: todos (indicadores por minuto)
  C1->>C1: ¿event_id procesado? → omitir
```
