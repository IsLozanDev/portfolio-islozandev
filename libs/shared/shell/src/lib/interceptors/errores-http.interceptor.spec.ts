import { HttpClient, HttpContext, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { CONFIG_AUTH, OMITIR_AVISO_ERROR } from '@vitrina/shared/auth';
import { AvisosService } from '@vitrina/shared/ui';
import { firstValueFrom } from 'rxjs';
import { MENSAJES_SHELL } from '../models/mensajes-shell';
import { erroresHttpInterceptor } from './errores-http.interceptor';

const API_URL = 'https://api.vitrina.test/v1';

describe('erroresHttpInterceptor', () => {
  let http: HttpClient;
  let servidor: HttpTestingController;
  let avisos: { error: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    avisos = { error: vi.fn(async () => undefined) };
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([erroresHttpInterceptor])),
        provideHttpClientTesting(),
        { provide: CONFIG_AUTH, useValue: { apiUrl: API_URL } },
        { provide: AvisosService, useValue: avisos },
      ],
    });
    http = TestBed.inject(HttpClient);
    servidor = TestBed.inject(HttpTestingController);
  });

  afterEach(() => servidor.verify());

  async function fallar(url: string, estado: number, context?: HttpContext): Promise<unknown> {
    const respuesta = firstValueFrom(http.get(url, { context }));
    if (estado === 0) {
      servidor.expectOne(url).error(new ProgressEvent('error'));
    } else {
      servidor.expectOne(url).flush({ codigo: 'X' }, { status: estado, statusText: 'Error' });
    }
    return respuesta.catch((error: unknown) => error);
  }

  it('un 503 de la API abre «Error del servidor» y propaga el error', async () => {
    const error = await fallar(`${API_URL}/seg/usuarios`, 503);

    expect(avisos.error).toHaveBeenCalledWith(MENSAJES_SHELL.tituloErrorServidor, MENSAJES_SHELL.errorServidor);
    expect(error).toMatchObject({ status: 503 });
  });

  it('sin conexión abre «Sin conexión»', async () => {
    const error = await fallar(`${API_URL}/seg/usuarios`, 0);

    expect(avisos.error).toHaveBeenCalledWith(MENSAJES_SHELL.tituloSinConexion, MENSAJES_SHELL.sinConexion);
    expect(error).toMatchObject({ status: 0 });
  });

  it.each([400, 401, 403, 404, 409])('un %i no abre nada', async (estado) => {
    const error = await fallar(`${API_URL}/seg/usuarios`, estado);

    expect(avisos.error).not.toHaveBeenCalled();
    expect(error).toMatchObject({ status: estado });
  });

  it('un 503 de otro origen no abre nada', async () => {
    await fallar('https://otro.sitio/v1/algo', 503);

    expect(avisos.error).not.toHaveBeenCalled();
  });

  it('con OMITIR_AVISO_ERROR no abre nada y propaga el error', async () => {
    const error = await fallar(`${API_URL}/seg/mi-contexto`, 503, new HttpContext().set(OMITIR_AVISO_ERROR, true));

    expect(avisos.error).not.toHaveBeenCalled();
    expect(error).toMatchObject({ status: 503 });
  });
});
