import { ErrorAuth, MENSAJES_AUTH } from '@vitrina/shared/auth';
import { ENROLAMIENTO_DE_PRUEBA, PaginaDePrueba } from '../../../testing/pagina-de-prueba';
import { MfaPage } from './mfa.page';

describe('MfaPage', () => {
  let pagina: PaginaDePrueba;

  beforeEach(() => {
    pagina = new PaginaDePrueba('auth/mfa', MfaPage);
  });

  async function abrir(url = '/auth/mfa?returnUrl=%2Fcaja'): Promise<void> {
    await pagina.abrir(url);
    await pagina.estable();
  }

  async function verificarCon(codigo: string): Promise<void> {
    pagina.escribir('input[formControlName=codigo]', codigo);
    await pagina.pulsar('Verificar');
  }

  describe('con factor TOTP verificado', () => {
    it('pide el código sin enrolar', async () => {
      await abrir();

      expect(pagina.mfa.enrolarTotp).not.toHaveBeenCalled();
      expect(pagina.elemento.querySelector('img')).toBeNull();
      expect(pagina.elemento.querySelector('input[formControlName=codigo]')).not.toBeNull();
    });

    it('con el código correcto verifica y vuelve al returnUrl', async () => {
      await abrir();

      await verificarCon('123456');

      expect(pagina.mfa.verificarTotp).toHaveBeenCalledWith('factor-1', '123456');
      expect(pagina.urlActual()).toBe('/caja');
    });

    it('con el código erróneo muestra el mensaje y se queda', async () => {
      await abrir();
      pagina.mfa.verificarTotp.mockRejectedValueOnce(new ErrorAuth('CODIGO_MFA_INVALIDO'));

      await verificarCon('000000');

      expect(pagina.elemento.querySelector('[role=alert]')?.textContent?.trim()).toBe(MENSAJES_AUTH.CODIGO_MFA_INVALIDO);
      expect(pagina.urlActual()).toBe('/auth/mfa?returnUrl=%2Fcaja');
    });

    it('un código que no tiene 6 dígitos no se envía', async () => {
      await abrir();

      await verificarCon('12ab');

      expect(pagina.mfa.verificarTotp).not.toHaveBeenCalled();
      expect(pagina.texto()).toContain('El código tiene 6 dígitos.');
    });

    it('con returnUrl externo vuelve a la portada', async () => {
      await abrir('/auth/mfa?returnUrl=https%3A%2F%2Fotro.sitio');

      await verificarCon('123456');

      expect(pagina.urlActual()).toBe('/');
    });
  });

  describe('sin factor TOTP', () => {
    beforeEach(() => {
      pagina.mfa.estado.mockResolvedValueOnce({ nivelActual: 'aal1', nivelSiguiente: 'aal1', factorTotpId: null });
    });

    it('enrola y muestra el QR y el secreto', async () => {
      await abrir();

      expect(pagina.mfa.enrolarTotp).toHaveBeenCalledTimes(1);
      expect(pagina.elemento.querySelector('img')?.getAttribute('src')).toBe(ENROLAMIENTO_DE_PRUEBA.qr);
      expect(pagina.elemento.querySelector('code')?.textContent?.trim()).toBe(ENROLAMIENTO_DE_PRUEBA.secreto);
    });

    it('confirma el enrolamiento verificando el factor nuevo', async () => {
      await abrir();

      await verificarCon('654321');

      expect(pagina.mfa.verificarTotp).toHaveBeenCalledWith(ENROLAMIENTO_DE_PRUEBA.factorId, '654321');
      expect(pagina.urlActual()).toBe('/caja');
    });
  });

  it('si no se puede leer el estado muestra el error y deja salir', async () => {
    pagina.mfa.estado.mockRejectedValueOnce(new ErrorAuth('SIN_CONEXION'));
    await abrir();

    expect(pagina.elemento.querySelector('[role=alert]')?.textContent?.trim()).toBe(MENSAJES_AUTH.SIN_CONEXION);
    expect(pagina.elemento.querySelector('form')).toBeNull();

    await pagina.pulsar('Salir');

    expect(pagina.sesion.salir).toHaveBeenCalledTimes(1);
    expect(pagina.urlActual()).toBe('/auth/ingresar');
  });
});
