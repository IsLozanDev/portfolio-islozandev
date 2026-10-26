import { ErrorAuth, MENSAJES_AUTH } from '@vitrina/shared/auth';
import { PaginaDePrueba } from '../../../testing/pagina-de-prueba';
import { AVISO_INACTIVIDAD, IngresarPage } from './ingresar.page';

describe('IngresarPage', () => {
  let pagina: PaginaDePrueba;

  beforeEach(() => {
    pagina = new PaginaDePrueba('auth/ingresar', IngresarPage);
  });

  async function ingresarCon(correo: string, clave: string): Promise<void> {
    pagina.escribir('input[type=email]', correo);
    pagina.escribir('input[type=password]', clave);
    await pagina.pulsar('Ingresar');
  }

  it('con clave errónea muestra el mensaje genérico', async () => {
    await pagina.abrir('/auth/ingresar');
    pagina.sesion.ingresarConClave.mockRejectedValueOnce(new ErrorAuth('CREDENCIALES_INVALIDAS'));

    await ingresarCon('rosa@correo.pe', 'mala');

    expect(pagina.elemento.querySelector('[role=alert]')?.textContent?.trim()).toBe(MENSAJES_AUTH.CREDENCIALES_INVALIDAS);
    expect(pagina.urlActual()).toBe('/auth/ingresar');
  });

  it('sin MFA pendiente navega al returnUrl', async () => {
    await pagina.abrir('/auth/ingresar?returnUrl=%2Fcaja');

    await ingresarCon('rosa@correo.pe', 'buena');

    expect(pagina.sesion.ingresarConClave).toHaveBeenCalledWith('rosa@correo.pe', 'buena');
    expect(pagina.urlActual()).toBe('/caja');
  });

  it('con MFA pendiente navega a /auth/mfa conservando el returnUrl', async () => {
    await pagina.abrir('/auth/ingresar?returnUrl=%2Fcaja');
    pagina.mfa.requiereVerificacion.mockResolvedValueOnce(true);

    await ingresarCon('rosa@correo.pe', 'buena');

    expect(pagina.urlActual()).toBe('/auth/mfa?returnUrl=%2Fcaja');
  });

  it.each(['https://otro.sitio', '//otro.sitio'])('con returnUrl %s navega a la portada', async (retorno) => {
    await pagina.abrir(`/auth/ingresar?returnUrl=${encodeURIComponent(retorno)}`);

    await ingresarCon('rosa@correo.pe', 'buena');

    expect(pagina.urlActual()).toBe('/');
  });

  it('con el formulario incompleto no llama a Supabase', async () => {
    await pagina.abrir('/auth/ingresar');

    await pagina.pulsar('Ingresar');

    expect(pagina.sesion.ingresarConClave).not.toHaveBeenCalled();
    expect(pagina.texto()).toContain('Ingrese su correo.');
  });

  it.each([
    ['Continuar con Google', 'google'],
    ['Continuar con Microsoft', 'azure'],
  ])('«%s» inicia OAuth con %s y el returnUrl', async (boton, proveedor) => {
    await pagina.abrir('/auth/ingresar?returnUrl=%2Fcaja');

    await pagina.pulsar(boton);

    expect(pagina.sesion.ingresarConProveedor).toHaveBeenCalledWith(proveedor, '/caja');
  });

  it('OAuth sin returnUrl válido no lo envía', async () => {
    await pagina.abrir('/auth/ingresar?returnUrl=%2F%2Fotro.sitio');

    await pagina.pulsar('Continuar con Google');

    expect(pagina.sesion.ingresarConProveedor).toHaveBeenCalledWith('google', undefined);
  });

  it('con motivo=inactividad muestra el aviso', async () => {
    await pagina.abrir('/auth/ingresar?motivo=inactividad');

    expect(pagina.elemento.querySelector('[role=status]')?.textContent?.trim()).toBe(AVISO_INACTIVIDAD);
  });

  it('sin motivo no muestra el aviso', async () => {
    await pagina.abrir('/auth/ingresar');

    expect(pagina.texto()).not.toContain(AVISO_INACTIVIDAD);
  });
});
