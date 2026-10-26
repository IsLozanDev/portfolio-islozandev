import { isAuthError, isAuthRetryableFetchError, isAuthWeakPasswordError } from '@supabase/supabase-js';

export type CodigoErrorAuth =
  | 'CREDENCIALES_INVALIDAS'
  | 'DEMASIADOS_INTENTOS'
  | 'CODIGO_MFA_INVALIDO'
  | 'CLAVE_DEBIL'
  | 'ENLACE_INVALIDO'
  | 'SIN_CONEXION'
  | 'DESCONOCIDO';

/** Mensajes genéricos en español de Perú: ninguno revela si la cuenta existe. */
export const MENSAJES_AUTH: Readonly<Record<CodigoErrorAuth, string>> = {
  CREDENCIALES_INVALIDAS: 'Correo o contraseña incorrectos.',
  DEMASIADOS_INTENTOS: 'Demasiados intentos. Espere unos minutos e inténtelo de nuevo.',
  CODIGO_MFA_INVALIDO: 'El código no es válido o ya expiró.',
  CLAVE_DEBIL: 'La contraseña no cumple los requisitos de seguridad.',
  ENLACE_INVALIDO: 'El enlace no es válido o ya expiró. Solicite uno nuevo.',
  SIN_CONEXION: 'No se pudo conectar. Revise su conexión.',
  DESCONOCIDO: 'Ocurrió un error. Inténtelo de nuevo.',
};

export class ErrorAuth extends Error {
  constructor(
    readonly codigo: CodigoErrorAuth,
    options?: { cause?: unknown },
  ) {
    super(MENSAJES_AUTH[codigo], options);
    this.name = 'ErrorAuth';
  }
}

const HTTP_DEMASIADAS_PETICIONES = 429;

const CODIGO_POR_ERROR_SUPABASE: Readonly<Record<string, CodigoErrorAuth>> = {
  invalid_credentials: 'CREDENCIALES_INVALIDAS',
  email_not_confirmed: 'CREDENCIALES_INVALIDAS',
  user_not_found: 'CREDENCIALES_INVALIDAS',
  over_request_rate_limit: 'DEMASIADOS_INTENTOS',
  over_email_send_rate_limit: 'DEMASIADOS_INTENTOS',
  mfa_verification_failed: 'CODIGO_MFA_INVALIDO',
  mfa_verification_rejected: 'CODIGO_MFA_INVALIDO',
  mfa_challenge_expired: 'CODIGO_MFA_INVALIDO',
  weak_password: 'CLAVE_DEBIL',
  same_password: 'CLAVE_DEBIL',
  otp_expired: 'ENLACE_INVALIDO',
  flow_state_expired: 'ENLACE_INVALIDO',
  flow_state_not_found: 'ENLACE_INVALIDO',
  bad_code_verifier: 'ENLACE_INVALIDO',
  bad_oauth_state: 'ENLACE_INVALIDO',
  bad_oauth_callback: 'ENLACE_INVALIDO',
};

export function aErrorAuth(error: unknown): ErrorAuth {
  if (error instanceof ErrorAuth) return error;
  return new ErrorAuth(clasificar(error), { cause: error });
}

function clasificar(error: unknown): CodigoErrorAuth {
  if (isAuthRetryableFetchError(error)) return 'SIN_CONEXION';
  if (isAuthWeakPasswordError(error)) return 'CLAVE_DEBIL';
  if (!isAuthError(error)) return 'DESCONOCIDO';
  if (error.status === HTTP_DEMASIADAS_PETICIONES) return 'DEMASIADOS_INTENTOS';
  return (error.code && CODIGO_POR_ERROR_SUPABASE[error.code]) || 'DESCONOCIDO';
}
