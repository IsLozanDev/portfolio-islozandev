import { HttpClient } from '@angular/common/http';
import { HttpTestingController } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import {
  API_URL,
  contextoDePrueba,
  DobleSupabase,
  MIRAFLORES,
  proveerAuthDePrueba,
  responderMiContexto,
  sesionDePrueba,
  SURCO,
  URL_MI_CONTEXTO,
} from '../../testing/doble-supabase';
import { authInterceptor, esDeLaApi } from './auth.interceptor';
import { SesionService } from '../services/sesion.service';

@Component({ template: '' })
class PaginaVacia {}

const URL_ANULAR = `${API_URL}/rest/ventas/v-1/anular`;

describe('authInterceptor', () => {
  let supabase: DobleSupabase;
  let http: HttpTestingController;
  let cliente: HttpClient;
  let router: Router;

  beforeEach(async () => {
    supabase = new DobleSupabase();
    supabase.sesionGuardada = sesionDePrueba('token-de-rosa');
    TestBed.configureTestingModule({
      providers: [
        ...proveerAuthDePrueba(supabase, {}, [authInterceptor]),
        provideRouter([{ path: '**', component: PaginaVacia }]),
      ],
    });
    http = TestBed.inject(HttpTestingController);
    cliente = TestBed.inject(HttpClient);
    router = TestBed.inject(Router);
    await Promise.all([TestBed.inject(SesionService).iniciar(), responderMiContexto(http)]);
    await router.navigateByUrl('/ventas/v-1');
  });

  afterEach(() => http.verify());

  it('agrega Bearer y X-Sucursal-Id a las peticiones de la API', () => {
    void firstValueFrom(cliente.get(`${API_URL}/seg/mi-contexto`));

    const peticion = http.expectOne(URL_MI_CONTEXTO);
    expect(peticion.request.headers.get('Authorization')).toBe('Bearer token-de-rosa');
    expect(peticion.request.headers.get('X-Sucursal-Id')).toBe(MIRAFLORES.id);
    peticion.flush(contextoDePrueba());
  });

  it.each(['https://otro.test/v1/seg/mi-contexto', `${API_URL}x/seg`, 'https://sb.test/auth/v1/token'])(
    'no manda el token a %s',
    (url) => {
      void firstValueFrom(cliente.get(url));

      const peticion = http.expectOne(url);
      expect(peticion.request.headers.has('Authorization')).toBe(false);
      expect(peticion.request.headers.has('X-Sucursal-Id')).toBe(false);
      peticion.flush({});
    },
  );

  it('no reemplaza un X-Sucursal-Id puesto por quien llama', () => {
    void firstValueFrom(cliente.get(URL_MI_CONTEXTO, { headers: { 'X-Sucursal-Id': SURCO.id } }));

    const peticion = http.expectOne(URL_MI_CONTEXTO);
    expect(peticion.request.headers.get('X-Sucursal-Id')).toBe(SURCO.id);
    peticion.flush(contextoDePrueba());
  });

  it('TR-CA-048: 401 MFA_REQUERIDA lleva a /auth/mfa?returnUrl, propaga el error y no reintenta', async () => {
    const respuesta = firstValueFrom(cliente.post(URL_ANULAR, {}));

    http.expectOne(URL_ANULAR).flush({ codigo: 'MFA_REQUERIDA', max_edad: 900 }, { status: 401, statusText: 'Unauthorized' });

    await expect(respuesta).rejects.toMatchObject({ status: 401 });
    await vi.waitFor(() => expect(router.url).toBe('/auth/mfa?returnUrl=%2Fventas%2Fv-1'));
    http.expectNone(URL_ANULAR);
  });

  it('401 TOKEN_INVALIDO cierra la sesión y lleva a /auth/ingresar?returnUrl', async () => {
    const respuesta = firstValueFrom(cliente.get(`${API_URL}/rest/ventas`));

    http.expectOne(`${API_URL}/rest/ventas`).flush({ codigo: 'TOKEN_INVALIDO' }, { status: 401, statusText: 'Unauthorized' });

    await expect(respuesta).rejects.toMatchObject({ status: 401 });
    await vi.waitFor(() => expect(router.url).toBe('/auth/ingresar?returnUrl=%2Fventas%2Fv-1'));
    expect(supabase.auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(TestBed.inject(SesionService).autenticado()).toBe(false);
  });

  it('otros errores pasan sin navegar', async () => {
    const respuesta = firstValueFrom(cliente.get(`${API_URL}/rest/ventas`));

    http.expectOne(`${API_URL}/rest/ventas`).flush({ codigo: 'SIN_PERMISO' }, { status: 403, statusText: 'Forbidden' });

    await expect(respuesta).rejects.toMatchObject({ status: 403 });
    expect(router.url).toBe('/ventas/v-1');
  });

  it('si ya está en /auth/mfa no encadena otro returnUrl', async () => {
    await router.navigateByUrl('/auth/mfa?returnUrl=%2Fventas');
    const respuesta = firstValueFrom(cliente.post(URL_ANULAR, {}));

    http.expectOne(URL_ANULAR).flush({ codigo: 'MFA_REQUERIDA' }, { status: 401, statusText: 'Unauthorized' });

    await expect(respuesta).rejects.toMatchObject({ status: 401 });
    expect(router.url).toBe('/auth/mfa?returnUrl=%2Fventas');
  });
});

describe('esDeLaApi', () => {
  it.each([
    [API_URL, true],
    [`${API_URL}/seg/mi-contexto`, true],
    [`${API_URL}?x=1`, true],
    [`${API_URL}x`, false],
    ['https://api.test/v2/seg', false],
  ])('%s → %s', (url, esperado) => {
    expect(esDeLaApi(url, API_URL)).toBe(esperado);
  });
});
