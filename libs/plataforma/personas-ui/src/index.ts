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
export { ErrorPersonas } from './lib/models/error-personas';
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
export { TONO_ROL, TONOS_COINCIDENCIA, TONOS_ESTADO_CONSENTIMIENTO } from './lib/models/tonos-personas';
export { type Ubigeo } from './lib/models/ubigeo';
export { ConsentimientosCliente } from './lib/services/consentimientos.cliente';
export { ContactosCliente } from './lib/services/contactos.cliente';
export { DireccionesCliente } from './lib/services/direcciones.cliente';
export { PersonasCliente } from './lib/services/personas.cliente';
export { UbigeosService } from './lib/services/ubigeos.service';
export { clasificarEntrada, type EntradaClasificada, type TipoElegido } from './lib/utils/clasificar-entrada';
export { denominacionDe, esDocumentoDeJuridica, inicialesDe, inicialesDeTexto, nombreCompletoDe } from './lib/utils/denominacion';
export { filtrarUbigeos } from './lib/utils/filtrar-ubigeos';
export { formatoCelular, formatoContacto } from './lib/utils/formato-contacto';
export { formatoUbigeo } from './lib/utils/formato-ubigeo';
export { validarCelular, validarContacto, validarCorreo } from './lib/utils/validar-contacto';
