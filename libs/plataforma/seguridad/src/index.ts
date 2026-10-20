export {
  METODOS_MFA,
  mfaEn,
  mfaVigente,
  type Aal,
  type EntradaAmr,
  type Principal,
  type TipoUsuario,
} from './domain/principal.js';
export { AutenticacionNoDisponibleError, MfaRequeridaError, TokenInvalidoError } from './domain/errores.js';
export { VERIFICADOR_TOKEN, type VerificadorToken } from './application/ports/verificador-token.port.js';
export { SupabaseJwksVerificador, type OpcionesSupabase } from './infrastructure/supabase/supabase-jwks.verificador.js';
export { REGISTRO_ACCESO, type RegistroAcceso } from './application/ports/registro-acceso.port.js';
export { PrincipalActual, PUBLICO, Publico, REQUIERE_MFA, RequiereMfa } from './interface/decoradores.js';
export { AutenticacionGuard } from './interface/autenticacion.guard.js';
export { MfaGuard } from './interface/mfa.guard.js';
export { SeguridadModule, type SeguridadOpciones } from './seguridad.module.js';
