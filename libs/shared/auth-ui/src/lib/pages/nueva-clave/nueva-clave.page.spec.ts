import { ErrorAuth, MENSAJES_AUTH } from '@vitrina/shared/auth';
import { PaginaDePrueba } from '../../../testing/pagina-de-prueba';
import { NuevaClavePage } from './nueva-clave.page';

const URL_DEL_CORREO = '/auth/nueva-clave?token_hash=hash-123&type=recovery';

describe('NuevaClavePage', () => {
  let pagina: PaginaDePrueba;

  beforeEach(() => {
    pagina = new PaginaDePrueba('auth/nueva-clave', NuevaClavePage);
  });

  async function abrirDesdeElCorreo(): Promise<void> {
    await pagina.abrir(URL_DEL_CORREO);
    await pagina.estable();
  }

  async function guardar(clave: string, confirmacion: string): Promise<void> {
    pagina.escribir('input[formControlName=clave]', clave);
    pagina.escribir('input[formControlName=confirmacion]', confirmacion);
    await pagina.pulsar('Guardar contraseña');
  }

  it('canjea el token_hash de recuperación y lo quita de la URL', async () => {
    await abrirDesdeElCorreo();

    expect(pagina.sesion.verificarEnlace).toHaveBeenCalledWith('hash-123', 'recovery');
    expect(pagina.urlActual()).toBe('/auth/nueva-clave');
    expect(pagina.elemento.querySelector('form')).not.toBeNull();
  });

  it('guarda la clave y navega a la portada', async () => {
    await abrirDesdeElCorreo();

    await guardar('Nueva-Clave-2026', 'Nueva-Clave-2026');

    expect(pagina.sesion.actualizarClave).toHaveBeenCalledWith('Nueva-Clave-2026');
    expect(pagina.urlActual()).toBe('/');
  });

  it('si las claves no coinciden no llama a actualizarClave', async () => {
    await abrirDesdeElCorreo();

    await guardar('Nueva-Clave-2026', 'Otra-Clave-2026');

    expect(pagina.sesion.actualizarClave).not.toHaveBeenCalled();
    expect(pagina.texto()).toContain('Las contraseñas no coinciden.');
  });

  it('con CLAVE_DEBIL muestra su mensaje', async () => {
    await abrirDesdeElCorreo();
    pagina.sesion.actualizarClave.mockRejectedValueOnce(new ErrorAuth('CLAVE_DEBIL'));

    await guardar('12345678', '12345678');

    expect(pagina.elemento.querySelector('[role=alert]')?.textContent?.trim()).toBe(MENSAJES_AUTH.CLAVE_DEBIL);
  });

  it('con el enlace vencido muestra ENLACE_INVALIDO y ofrece pedir otro', async () => {
    pagina.sesion.verificarEnlace.mockRejectedValueOnce(new ErrorAuth('ENLACE_INVALIDO'));
    await abrirDesdeElCorreo();

    expect(pagina.elemento.querySelector('[role=alert]')?.textContent?.trim()).toBe(MENSAJES_AUTH.ENLACE_INVALIDO);
    expect(pagina.elemento.querySelector('a')?.getAttribute('href')).toBe('/auth/recuperar');
  });

  it.each(['/auth/nueva-clave', '/auth/nueva-clave?token_hash=hash-123&type=invite'])(
    'sin token de recuperación (%s) no canjea nada',
    async (url) => {
      await pagina.abrir(url);
      await pagina.estable();

      expect(pagina.sesion.verificarEnlace).not.toHaveBeenCalled();
      expect(pagina.elemento.querySelector('[role=alert]')?.textContent?.trim()).toBe(MENSAJES_AUTH.ENLACE_INVALIDO);
    },
  );
});
