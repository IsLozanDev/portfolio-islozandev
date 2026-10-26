import { ErrorAuth, MENSAJES_AUTH } from '@vitrina/shared/auth';
import { mensajeDeError } from './mensaje-de-error';

describe('mensajeDeError', () => {
  it('usa el mensaje de un ErrorAuth', () => {
    expect(mensajeDeError(new ErrorAuth('CREDENCIALES_INVALIDAS'))).toBe(MENSAJES_AUTH.CREDENCIALES_INVALIDAS);
  });

  it('cualquier otro error da el mensaje genérico', () => {
    expect(mensajeDeError(new Error('detalle interno'))).toBe(MENSAJES_AUTH.DESCONOCIDO);
  });
});
