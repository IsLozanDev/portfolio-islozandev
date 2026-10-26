import { ErrorAuth, MENSAJES_AUTH } from '@vitrina/shared/auth';
import { PaginaDePrueba } from '../../../testing/pagina-de-prueba';
import { CallbackPage } from './callback.page';

describe('CallbackPage', () => {
  let pagina: PaginaDePrueba;

  beforeEach(() => {
    pagina = new PaginaDePrueba('auth/callback', CallbackPage);
  });

  it('con el canje correcto navega al returnUrl', async () => {
    await pagina.abrir('/auth/callback?returnUrl=%2Fcaja');
    await pagina.estable();

    expect(pagina.sesion.completarCallback).toHaveBeenCalledTimes(1);
    expect(pagina.urlActual()).toBe('/caja');
  });

  it('con MFA pendiente navega a /auth/mfa', async () => {
    pagina.mfa.requiereVerificacion.mockResolvedValueOnce(true);
    await pagina.abrir('/auth/callback');
    await pagina.estable();

    expect(pagina.urlActual()).toBe('/auth/mfa?returnUrl=%2F');
  });

  it('con ENLACE_INVALIDO muestra el mensaje y el enlace a ingresar', async () => {
    pagina.sesion.completarCallback.mockRejectedValueOnce(new ErrorAuth('ENLACE_INVALIDO'));
    await pagina.abrir('/auth/callback?error=access_denied');
    await pagina.estable();

    expect(pagina.elemento.querySelector('[role=alert]')?.textContent?.trim()).toBe(MENSAJES_AUTH.ENLACE_INVALIDO);
    expect(pagina.elemento.querySelector('a')?.getAttribute('href')).toBe('/auth/ingresar');
    expect(pagina.urlActual()).toBe('/auth/callback?error=access_denied');
  });
});
