import { HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { aErrorDeIngreso } from './error-ingreso-api';
import { ErrorAuth, MENSAJES_AUTH } from './errores';

const respuesta = (status: number, error: unknown, headers?: Record<string, string>) =>
  new HttpErrorResponse({ status, error, headers: headers ? new HttpHeaders(headers) : undefined });

describe('aErrorDeIngreso (spec 18b)', () => {
  it.each([
    ['CREDENCIALES_INVALIDAS', 401, 'CREDENCIALES_INVALIDAS'],
    ['CODIGO_MFA_INVALIDO', 400, 'CODIGO_MFA_INVALIDO'],
    ['INGRESO_NO_DISPONIBLE', 503, 'SIN_CONEXION'],
    ['OTRO_CODIGO', 500, 'DESCONOCIDO'],
  ])('traduce %s (%i) a %s', (codigoApi, status, esperado) => {
    expect(aErrorDeIngreso(respuesta(status, { codigo: codigoApi }), 'CREDENCIALES_INVALIDAS').codigo).toBe(esperado);
  });

  it('un cuerpo inválido toma el código de la etapa', () => {
    expect(aErrorDeIngreso(respuesta(400, { codigo: 'SOLICITUD_INVALIDA' }), 'CREDENCIALES_INVALIDAS').codigo).toBe('CREDENCIALES_INVALIDAS');
    expect(aErrorDeIngreso(respuesta(400, { codigo: 'SOLICITUD_INVALIDA' }), 'CODIGO_MFA_INVALIDO').codigo).toBe('CODIGO_MFA_INVALIDO');
  });

  it('sin respuesta es SIN_CONEXION; un error que no es HTTP es DESCONOCIDO', () => {
    expect(aErrorDeIngreso(respuesta(0, null), 'CREDENCIALES_INVALIDAS').codigo).toBe('SIN_CONEXION');
    expect(aErrorDeIngreso(new TypeError('boom'), 'CREDENCIALES_INVALIDAS').codigo).toBe('DESCONOCIDO');
  });

  it('el bloqueo toma los segundos del cuerpo o, si faltan, de Retry-After', () => {
    expect(aErrorDeIngreso(respuesta(429, { codigo: 'INGRESO_BLOQUEADO', reintentarEnSeg: 900 }), 'CREDENCIALES_INVALIDAS').message).toBe(
      'Demasiados intentos. Vuelva a intentarlo en 15 minutos.',
    );
    expect(aErrorDeIngreso(respuesta(429, { codigo: 'INGRESO_BLOQUEADO' }, { 'Retry-After': '61' }), 'CREDENCIALES_INVALIDAS').message).toBe(
      'Demasiados intentos. Vuelva a intentarlo en 2 minutos.',
    );
  });
});

describe('ErrorAuth INGRESO_BLOQUEADO', () => {
  it('con un minuto usa el singular; sin segundos, el texto genérico', () => {
    expect(new ErrorAuth('INGRESO_BLOQUEADO', { reintentarEnSeg: 30 }).message).toBe('Demasiados intentos. Vuelva a intentarlo en 1 minuto.');
    expect(new ErrorAuth('INGRESO_BLOQUEADO').message).toBe(MENSAJES_AUTH.INGRESO_BLOQUEADO);
  });
});
