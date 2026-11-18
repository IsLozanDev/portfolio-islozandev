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
export { TIPOS_PERSONA, type DenominacionPersona, type TipoPersona } from './domain/persona.js';
export { ROLES_PERSONA, type FechaRol, type RolAsignado, type RolPersona } from './domain/rol-persona.js';
export {
  PERSONA_PORT,
  type AsignarRolComando,
  type ContactoDetalle,
  type PersonaDetalle,
  type PersonaPort,
  type PersonaResumen,
  type RegistrarPersonaComando,
} from './application/ports/persona.port.js';
export { ESQUEMAS_PER, registrarEsquemasPer } from './infrastructure/event-schemas.js';
export { ENTIDADES_PER } from './infrastructure/typeorm/entidades.js';
export { VerificadorReferenciasPer } from './infrastructure/verificador-referencias.per.js';
export { PersonasModule, type PersonasOpciones } from './personas.module.js';
