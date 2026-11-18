// TR-PER: persona maestra del tenant, registro por documento y rol por producto (spec 31). Solo este archivo es público.
export { TIPOS_CONTACTO, type TipoContacto } from './domain/contacto.js';
export { TIPOS_DOCUMENTO_PERSONA, type TipoDocumentoPersona } from './domain/documento-identidad.js';
export {
  ContactoInvalidoError,
  DocumentoInvalidoPersonaError,
  PersonaDuplicadaError,
  PersonaNoEncontradaError,
  ProductoNoSuscritoError,
  TipoDocumentoNoAdmitidoError,
  TipoPersonaIncoherenteError,
} from './domain/errores.js';
export { EVENTOS_PER, type PersonaRegistrada, type PersonaRolAsignado } from './domain/eventos-per.js';
export { PERMISOS_PER } from './domain/permisos-per.js';
export { TIPOS_PERSONA, type TipoPersona } from './domain/persona.js';
export { ROLES_PERSONA, type FechaRol, type RolPersona } from './domain/rol-persona.js';
