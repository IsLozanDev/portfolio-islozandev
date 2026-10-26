import { AuthApiError, AuthRetryableFetchError, AuthWeakPasswordError } from '@supabase/supabase-js';
import { aErrorAuth, ErrorAuth, MENSAJES_AUTH } from './errores';

describe('aErrorAuth', () => {
  it.each([
    ['invalid_credentials', 'CREDENCIALES_INVALIDAS'],
    ['user_not_found', 'CREDENCIALES_INVALIDAS'],
    ['email_not_confirmed', 'CREDENCIALES_INVALIDAS'],
    ['over_request_rate_limit', 'DEMASIADOS_INTENTOS'],
    ['mfa_verification_failed', 'CODIGO_MFA_INVALIDO'],
    ['weak_password', 'CLAVE_DEBIL'],
    ['insufficient_aal', 'SEGUNDO_FACTOR_REQUERIDO'],
    ['otp_expired', 'ENLACE_INVALIDO'],
    ['bad_code_verifier', 'ENLACE_INVALIDO'],
    ['codigo_que_no_existe', 'DESCONOCIDO'],
  ])('traduce el código de Supabase %s a %s', (codigoSupabase, esperado) => {
    expect(aErrorAuth(new AuthApiError('x', 400, codigoSupabase)).codigo).toBe(esperado);
  });

  it('un 429 sin código es DEMASIADOS_INTENTOS', () => {
    expect(aErrorAuth(new AuthApiError('x', 429, undefined)).codigo).toBe('DEMASIADOS_INTENTOS');
  });

  it('un error de red es SIN_CONEXION', () => {
    expect(aErrorAuth(new AuthRetryableFetchError('fetch failed', 0)).codigo).toBe('SIN_CONEXION');
  });

  it('el rechazo de clave débil es CLAVE_DEBIL', () => {
    expect(aErrorAuth(new AuthWeakPasswordError('weak', 422, ['length'])).codigo).toBe('CLAVE_DEBIL');
  });

  it('un error ajeno a Supabase es DESCONOCIDO y conserva la causa', () => {
    const original = new TypeError('boom');
    const error = aErrorAuth(original);

    expect(error.codigo).toBe('DESCONOCIDO');
    expect(error.cause).toBe(original);
  });

  it('el mensaje no distingue clave errónea de cuenta inexistente', () => {
    const claveErronea = aErrorAuth(new AuthApiError('Invalid login credentials', 400, 'invalid_credentials'));
    const cuentaInexistente = aErrorAuth(new AuthApiError('User not found', 404, 'user_not_found'));

    expect(claveErronea.message).toBe(MENSAJES_AUTH.CREDENCIALES_INVALIDAS);
    expect(cuentaInexistente.message).toBe(claveErronea.message);
  });

  it('devuelve tal cual un ErrorAuth', () => {
    const error = new ErrorAuth('SIN_CONEXION');
    expect(aErrorAuth(error)).toBe(error);
  });
});
