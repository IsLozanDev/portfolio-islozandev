// TR-PER: persona maestra del tenant, registro por documento, rol por producto (spec 31), contactos y
// direcciones con ubigeo (spec 32), y consentimientos por finalidad con textos versionados (spec 37).
// Solo este archivo es público.
export {
  CANALES,
  DECISIONES,
  FINALIDADES,
  type Canal,
  type Decision,
  type Finalidad,
} from './domain/consentimiento.js';
export {
  CONSENTIMIENTO_PORT,
  type ConsentimientoPort,
  type ConsentimientoVigente,
  type DecisionComando,
  type DecisionRegistrada,
  type RegistrarConsentimientosComando,
  type TextoVigente,
} from './application/ports/consentimiento.port.js';
export { TIPOS_CONTACTO, type TipoContacto } from './domain/contacto.js';
export type { DenominacionPersona } from './domain/denominacion.js';
export { TIPOS_DOCUMENTO_PERSONA, type TipoDocumentoPersona } from './domain/documento-identidad.js';
export {
  AccionExpresaRequeridaError,
  CelularPrincipalObligatorioError,
  ContactoDuplicadoError,
  ContactoInvalidoError,
  ContactoNoEncontradoError,
  DatosConsentimientoInvalidosError,
  DireccionInvalidaError,
  DireccionNoEncontradaError,
  DocumentoInvalidoPersonaError,
  EvidenciaInvalidaError,
  EvidenciaNoEncontradaError,
  FinalidadRepetidaError,
  MOTIVOS_EVIDENCIA_INVALIDA,
  PersonaDuplicadaError,
  PersonaNoEncontradaError,
  ProductoNoSuscritoError,
  SinConsentimientoVigenteError,
  TextoFinalidadInvalidoError,
  TextoNoPublicadoError,
  TipoDocumentoNoAdmitidoError,
  TipoPersonaIncoherenteError,
  UbigeoNoVigenteError,
  VersionObsoletaPersonaError,
  VersionTextoDuplicadaError,
  VersionTextoNoVigenteError,
  type MotivoEvidenciaInvalida,
} from './domain/errores.js';
export {
  CAMBIOS_PERSONA,
  EVENTOS_PER,
  type CambioPersona,
  type ConsentimientoRevocado,
  type PersonaActualizada,
  type PersonaRegistrada,
  type PersonaRolAsignado,
} from './domain/eventos-per.js';
export { PERMISOS_PER } from './domain/permisos-per.js';
export { TIPOS_PERSONA, type TipoPersona } from './domain/persona.js';
export { ROLES_PERSONA, type FechaRol, type RolAsignado, type RolPersona } from './domain/rol-persona.js';
export {
  PERSONA_PORT,
  type AgregarContactoComando,
  type AgregarDireccionComando,
  type AsignarRolComando,
  type ContactoDetalle,
  type DireccionDetalle,
  type PersonaDetalle,
  type PersonaPort,
  type PersonaResumen,
  type RegistrarPersonaComando,
} from './application/ports/persona.port.js';
export { ESQUEMAS_PER, registrarEsquemasPer } from './infrastructure/event-schemas.js';
export { ENTIDADES_PER } from './infrastructure/typeorm/entidades.js';
export { VerificadorReferenciasPer } from './infrastructure/verificador-referencias.per.js';
export { PersonasModule, type PersonasOpciones } from './personas.module.js';
