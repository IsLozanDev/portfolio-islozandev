export { PanelContactoComponent, type DatosPanelContacto } from './lib/components/panel-contacto/panel-contacto.component';
export { PanelDatosBasicosComponent, type DatosPanelDatosBasicos } from './lib/components/panel-datos-basicos/panel-datos-basicos.component';
export { PanelDireccionComponent, type DatosPanelDireccion } from './lib/components/panel-direccion/panel-direccion.component';
export { PanelRolComponent, type DatosPanelRol } from './lib/components/panel-rol/panel-rol.component';
export { PersonaConsentimientosComponent } from './lib/components/persona-consentimientos/persona-consentimientos.component';
export { PersonaContactosComponent } from './lib/components/persona-contactos/persona-contactos.component';
export { PersonaDatosBasicosComponent } from './lib/components/persona-datos-basicos/persona-datos-basicos.component';
export { PersonaDireccionesComponent } from './lib/components/persona-direcciones/persona-direcciones.component';
export { PersonaRolesComponent } from './lib/components/persona-roles/persona-roles.component';
export { UbigeoAutocompletarComponent } from './lib/components/ubigeo-autocompletar/ubigeo-autocompletar.component';
export { type CambioFicha } from './lib/models/ficha';
export { MENSAJES_FICHA } from './lib/models/mensajes-ficha';
export { PanelNuevaPersonaComponent, type DatosPanelNuevaPersona, type ResultadoNuevaPersona } from './lib/components/panel-nueva-persona/panel-nueva-persona.component';
export { PersonaAltaComponent } from './lib/components/persona-alta/persona-alta.component';
export { ESPERA_BUSQUEDA_MS, PersonaBuscadorComponent } from './lib/components/persona-buscador/persona-buscador.component';
export type { ModoBuscador, PedidoAlta, PersonaElegida } from './lib/models/buscador';
export {
  aListadoPersonas,
  aParametrosListado,
  aPersonaListada,
  aResultadoBusquedaDocumento,
  type AvisoIdentidad,
  type Coincidencia,
  type CriteriosListado,
  type ListadoPersonas,
  type PersonaListada,
  type ResultadoBusquedaDocumento,
  type RolVigente,
} from './lib/models/busqueda';
export { FINALIDADES, type Canal, type Decision, type DecisionVigente, type EstadoConsentimiento, type Finalidad } from './lib/models/consentimiento';
export {
  CODIGOS_BLOQUEO,
  MOTIVOS_DUPLICADO,
  PRINCIPAL_DIRECCION,
  type CampoDatoBasico,
  type ClavePrincipal,
  type CodigoBloqueo,
  type ComparacionPar,
  type CriteriosDuplicados,
  type EleccionFusion,
  type MotivoDuplicado,
  type Origen,
  type PaginaDuplicados,
  type ParCandidato,
  type SolicitudFusion,
} from './lib/models/duplicados';
export { ErrorPersonas } from './lib/models/error-personas';
export { ETIQUETAS_MOTIVO, MENSAJES_BLOQUEO, MENSAJES_DUPLICADOS, mensajeDeErrorDuplicados, motivosDe } from './lib/models/mensajes-duplicados';
export {
  ETIQUETAS_CANAL,
  ETIQUETAS_ESTADO_CONSENTIMIENTO,
  ETIQUETAS_FINALIDAD,
  ETIQUETAS_ROL,
  ETIQUETAS_TIPO_CONTACTO,
  ETIQUETAS_TIPO_DOCUMENTO,
  ETIQUETAS_TIPO_PERSONA,
} from './lib/models/etiquetas-personas';
export { ETIQUETAS_COINCIDENCIA, mensajeDeError, textoAvisoIdentidad } from './lib/models/mensajes-personas';
export { PERMISOS_PERSONAS } from './lib/models/permisos-personas';
export {
  PRODUCTOS,
  ROLES_PERSONA,
  TIPOS_CONTACTO,
  TIPOS_DOCUMENTO,
  TIPOS_PERSONA,
  type ContactoPersona,
  type Denominacion,
  type DireccionPersona,
  type PersonaDetalle,
  type PersonaResumen,
  type ProductoCodigo,
  type RolAsignado,
  type RolPersona,
  type TipoContacto,
  type TipoDocumento,
  type TipoPersona,
} from './lib/models/persona';
export type {
  AsignacionRol,
  CambiosDatosBasicos,
  EdicionContacto,
  EdicionDireccion,
  NuevaDireccion,
  NuevoContacto,
  RegistroPersona,
} from './lib/models/solicitudes-persona';
export { TONO_DESCARTADO, TONO_ROL, TONOS_COINCIDENCIA, TONOS_ESTADO_CONSENTIMIENTO, TONOS_PUNTAJE } from './lib/models/tonos-personas';
export { type Ubigeo } from './lib/models/ubigeo';
export { ConsentimientosCliente } from './lib/services/consentimientos.cliente';
export { ContactosCliente } from './lib/services/contactos.cliente';
export { DireccionesCliente } from './lib/services/direcciones.cliente';
export { DuplicadosCliente } from './lib/services/duplicados.cliente';
export { PersonasCliente } from './lib/services/personas.cliente';
export { UbigeosService } from './lib/services/ubigeos.service';
export {
  CAMPOS_POR_TIPO_PERSONA,
  CLAVES_PRINCIPAL,
  conservadaSugerida,
  eleccionInicial,
  opcionesDatosBasicos,
  opcionesPrincipales,
  solicitudDe,
  type CandidatoPrincipal,
  type GrupoPrincipal,
  type OpcionDatoBasico,
} from './lib/utils/campos-fusion';
export { clasificarEntrada, type EntradaClasificada, type TipoElegido } from './lib/utils/clasificar-entrada';
export { denominacionDe, esDocumentoDeJuridica, inicialesDe, inicialesDeTexto, nombreCompletoDe } from './lib/utils/denominacion';
export { filtrarUbigeos } from './lib/utils/filtrar-ubigeos';
export { formatoCelular, formatoContacto } from './lib/utils/formato-contacto';
export { formatoDocumento, formatoRol } from './lib/utils/formato-persona';
export { formatoFecha, formatoFechaHora } from './lib/utils/fechas';
export { formatoUbigeo } from './lib/utils/formato-ubigeo';
export { validarCelular, validarContacto, validarCorreo } from './lib/utils/validar-contacto';
