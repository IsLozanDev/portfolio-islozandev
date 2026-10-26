import { ErrorAuth, MENSAJES_AUTH } from '@vitrina/shared/auth';
import { PaginaDePrueba } from '../../../testing/pagina-de-prueba';
import { ErrorInvitacion } from '../../models/invitacion';
import { InvitacionPage } from './invitacion.page';

const URL_INVITADO_NUEVO = '/auth/invitacion?token=tok-1&token_hash=hash-1&type=invite';
const URL_INVITADO_CON_CUENTA = '/auth/invitacion?token=tok-1&token_hash=hash-1&type=email';

describe('InvitacionPage', () => {
  let pagina: PaginaDePrueba;

  beforeEach(() => {
    pagina = new PaginaDePrueba('auth/invitacion', InvitacionPage);
    pagina.sesion.verificarEnlace.mockImplementation(async () => pagina.sesion.autenticado.set(true));
  });

  async function abrir(url: string): Promise<void> {
    await pagina.abrir(url);
    await pagina.estable();
  }

  function alerta(): string | undefined {
    return pagina.elemento.querySelector('[role=alert]')?.textContent?.trim();
  }

  async function elegirClave(clave: string, confirmacion = clave): Promise<void> {
    pagina.escribir('input[formControlName=clave]', clave);
    pagina.escribir('input[formControlName=confirmacion]', confirmacion);
    await pagina.pulsar('Guardar contraseña y aceptar');
  }

  it('sin token en la URL muestra que no existe y no llama a la API', async () => {
    await abrir('/auth/invitacion');

    expect(pagina.invitaciones.consultar).not.toHaveBeenCalled();
    expect(alerta()).toBe('La invitación no existe o el enlace está incompleto.');
  });

  it('TR-CA-029: con la invitación vencida muestra el mensaje del SRS y nada más', async () => {
    pagina.invitaciones.consultar.mockRejectedValueOnce(new ErrorInvitacion('INVITACION_EXPIRADA'));

    await abrir(URL_INVITADO_NUEVO);

    expect(alerta()).toBe('La invitación expiró; solicite una nueva al administrador');
    expect(pagina.sesion.verificarEnlace).not.toHaveBeenCalled();
    expect(pagina.elemento.querySelector('form, button')).toBeNull();
  });

  it('canjea el token_hash, lo quita de la URL y conserva el token de la invitación', async () => {
    await abrir(URL_INVITADO_NUEVO);

    expect(pagina.invitaciones.consultar).toHaveBeenCalledWith('tok-1');
    expect(pagina.sesion.verificarEnlace).toHaveBeenCalledWith('hash-1', 'invite');
    expect(pagina.urlActual()).toBe('/auth/invitacion?token=tok-1');
    expect(pagina.texto()).toContain('Sazón Miraflores');
  });

  it('sin sesión ofrece ingresar volviendo a esta invitación', async () => {
    await abrir('/auth/invitacion?token=tok-1');

    const enlace = pagina.elemento.querySelector('a');
    expect(enlace?.textContent?.trim()).toBe('Ingresar para aceptar');
    expect(enlace?.getAttribute('href')).toBe('/auth/ingresar?returnUrl=%2Fauth%2Finvitacion%3Ftoken%3Dtok-1');
  });

  describe('invitado nuevo (type=invite)', () => {
    it('pide la clave antes de aceptar', async () => {
      await abrir(URL_INVITADO_NUEVO);

      expect(pagina.elemento.querySelector('input[formControlName=clave]')).not.toBeNull();
      expect(pagina.invitaciones.aceptar).not.toHaveBeenCalled();
    });

    it('TR-CA-028: guarda la clave, acepta, refresca la sesión y entra a la portada', async () => {
      await abrir(URL_INVITADO_NUEVO);

      await elegirClave('Clave-Nueva-2026');

      expect(pagina.sesion.actualizarClave).toHaveBeenCalledWith('Clave-Nueva-2026');
      expect(pagina.invitaciones.aceptar).toHaveBeenCalledWith('tok-1');
      expect(pagina.sesion.refrescarSesion).toHaveBeenCalledTimes(1);
      expect(pagina.urlActual()).toBe('/');
    });

    it('si las claves no coinciden no guarda ni acepta', async () => {
      await abrir(URL_INVITADO_NUEVO);

      await elegirClave('Clave-Nueva-2026', 'Otra-Clave-2026');

      expect(pagina.sesion.actualizarClave).not.toHaveBeenCalled();
      expect(pagina.invitaciones.aceptar).not.toHaveBeenCalled();
    });
  });

  describe('invitado con cuenta (type=email)', () => {
    it('no pide clave y acepta con un botón', async () => {
      await abrir(URL_INVITADO_CON_CUENTA);

      expect(pagina.elemento.querySelector('input[formControlName=clave]')).toBeNull();

      await pagina.pulsar('Aceptar invitación a Sazón Miraflores');

      expect(pagina.sesion.verificarEnlace).toHaveBeenCalledWith('hash-1', 'email');
      expect(pagina.sesion.actualizarClave).not.toHaveBeenCalled();
      expect(pagina.sesion.refrescarSesion).toHaveBeenCalledTimes(1);
      expect(pagina.urlActual()).toBe('/');
    });

    it('TR-CA-030: con otro correo muestra el mensaje del SRS y no refresca la sesión', async () => {
      pagina.invitaciones.aceptar.mockRejectedValueOnce(new ErrorInvitacion('INVITACION_OTRO_CORREO'));
      await abrir(URL_INVITADO_CON_CUENTA);

      await pagina.pulsar('Aceptar invitación a Sazón Miraflores');

      expect(alerta()).toBe('Esta invitación pertenece a otro correo');
      expect(pagina.sesion.refrescarSesion).not.toHaveBeenCalled();
      expect(pagina.urlActual()).toBe('/auth/invitacion?token=tok-1');
    });
  });

  it('con sesión ya iniciada (vuelve de ingresar) acepta sin canjear enlace', async () => {
    pagina.sesion.autenticado.set(true);
    await abrir('/auth/invitacion?token=tok-1');

    await pagina.pulsar('Aceptar invitación a Sazón Miraflores');

    expect(pagina.sesion.verificarEnlace).not.toHaveBeenCalled();
    expect(pagina.invitaciones.aceptar).toHaveBeenCalledWith('tok-1');
  });

  it('si el enlace del correo venció, avisa y ofrece ingresar', async () => {
    pagina.sesion.verificarEnlace.mockRejectedValueOnce(new ErrorAuth('ENLACE_INVALIDO'));

    await abrir(URL_INVITADO_NUEVO);

    expect(alerta()).toBe(MENSAJES_AUTH.ENLACE_INVALIDO);
    expect(pagina.texto()).toContain('Ingresar para aceptar');
    expect(pagina.urlActual()).toBe('/auth/invitacion?token=tok-1');
  });
});
