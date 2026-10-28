import { HttpErrorResponse } from '@angular/common/http';
import { aErrorAdmin, CODIGO_DESCONOCIDO, ErrorAdmin } from './error-admin';
import { MENSAJE_ERROR_DESCONOCIDO, MENSAJES_POR_CODIGO } from './mensajes-admin';

const respuestaHttp = (status: number, error: unknown) => new HttpErrorResponse({ status, error });

describe('aErrorAdmin', () => {
  it('usa el código y el mensaje de la API', () => {
    expect(aErrorAdmin(respuestaHttp(403, { codigo: 'ALCANCE_SUPERIOR', mensaje: 'No puede otorgar un alcance mayor al suyo' }))).toMatchObject({
      codigo: 'ALCANCE_SUPERIOR',
      message: 'No puede otorgar un alcance mayor al suyo',
      estado: 403,
    });
  });

  it('sin mensaje usa el texto del código (SOLICITUD_INVALIDA, MFA_REQUERIDA)', () => {
    expect(aErrorAdmin(respuestaHttp(400, { codigo: 'SOLICITUD_INVALIDA', errores: ['correo'] })).message).toBe(MENSAJES_POR_CODIGO['SOLICITUD_INVALIDA']);
    expect(aErrorAdmin(respuestaHttp(401, { codigo: 'MFA_REQUERIDA', max_edad: 900 })).message).toBe(MENSAJES_POR_CODIGO['MFA_REQUERIDA']);
  });

  it('un cuerpo sin código, o algo que no es HTTP, da DESCONOCIDO', () => {
    expect(aErrorAdmin(respuestaHttp(502, '<html>Bad Gateway</html>'))).toMatchObject({ codigo: CODIGO_DESCONOCIDO, message: MENSAJE_ERROR_DESCONOCIDO, estado: 502 });
    expect(aErrorAdmin(new TypeError('x'))).toMatchObject({ codigo: CODIGO_DESCONOCIDO, estado: null });
  });

  it('un ErrorAdmin pasa tal cual', () => {
    const error = new ErrorAdmin('CONFLICTO', 'ya existe', 409);
    expect(aErrorAdmin(error)).toBe(error);
  });
});
