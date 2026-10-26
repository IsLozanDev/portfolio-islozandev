import { ErrorAuth, MENSAJES_AUTH } from '@vitrina/shared/auth';
import { PaginaDePrueba } from '../../../testing/pagina-de-prueba';
import { CONFIRMACION_RECUPERAR, RecuperarPage } from './recuperar.page';

describe('RecuperarPage', () => {
  let pagina: PaginaDePrueba;

  beforeEach(async () => {
    pagina = new PaginaDePrueba('auth/recuperar', RecuperarPage);
    await pagina.abrir('/auth/recuperar');
  });

  async function pedirEnlace(correo: string): Promise<void> {
    pagina.escribir('input[type=email]', correo);
    await pagina.pulsar('Enviar enlace');
  }

  it('muestra la misma confirmación exista o no la cuenta', async () => {
    await pedirEnlace('no-existe@correo.pe');

    expect(pagina.sesion.recuperarClave).toHaveBeenCalledWith('no-existe@correo.pe');
    expect(pagina.elemento.querySelector('[role=status]')?.textContent?.trim()).toBe(CONFIRMACION_RECUPERAR);
    expect(pagina.elemento.querySelector('form')).toBeNull();
  });

  it('con DEMASIADOS_INTENTOS muestra el error y deja el formulario', async () => {
    pagina.sesion.recuperarClave.mockRejectedValueOnce(new ErrorAuth('DEMASIADOS_INTENTOS'));

    await pedirEnlace('rosa@correo.pe');

    expect(pagina.elemento.querySelector('[role=alert]')?.textContent?.trim()).toBe(MENSAJES_AUTH.DEMASIADOS_INTENTOS);
    expect(pagina.elemento.querySelector('form')).not.toBeNull();
  });

  it('con un correo inválido no llama a Supabase', async () => {
    await pedirEnlace('no-es-correo');

    expect(pagina.sesion.recuperarClave).not.toHaveBeenCalled();
    expect(pagina.texto()).toContain('Ingrese un correo válido.');
  });
});
