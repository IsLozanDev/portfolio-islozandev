import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { CONFIG_AUTH, SesionService } from '@vitrina/shared/auth';
import { DobleSesion, RUTA_PROHIBIDO } from '../testing/doble-sesion';
import { API_URL } from '../testing/http-de-prueba';
import { CONSOLA_TENANTS_ROUTES } from './consola-tenants.routes';
import { PERMISOS_CONSOLA } from './models/permisos-consola';

@Component({ template: '' })
class Prohibido {}

/** La primera carga lazy transforma Material entero; con la máquina ocupada pasa los 5 s por defecto. */
const ESPERA_PRECARGA_MS = 30_000;

describe('CONSOLA_TENANTS_ROUTES', () => {
  let sesion: DobleSesion;

  beforeAll(() => import('./pages/tenants-lista/tenants-lista.page'), ESPERA_PRECARGA_MS);

  async function navegar(url: string): Promise<{ url: string; titulo: string }> {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'consola', children: CONSOLA_TENANTS_ROUTES },
          { path: '403', component: Prohibido },
        ]),
        { provide: SesionService, useValue: sesion },
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: CONFIG_AUTH, useValue: { apiUrl: API_URL, rutas: { prohibido: RUTA_PROHIBIDO } } },
      ],
    });
    const harness = await RouterTestingHarness.create(url);
    return { url: TestBed.inject(Router).url, titulo: harness.routeNativeElement?.querySelector('h1')?.textContent?.trim() ?? '' };
  }

  beforeEach(() => {
    sesion = new DobleSesion();
  });

  it('/consola/tenants abre la lista con plat.tenant.consultar', async () => {
    sesion.conPermisos(PERMISOS_CONSOLA.tenantConsultar);

    expect(await navegar('/consola/tenants')).toEqual({ url: '/consola/tenants', titulo: 'Tenants' });
  });

  it('/consola/tenants sin el permiso va a /403', async () => {
    expect((await navegar('/consola/tenants')).url).toBe(RUTA_PROHIBIDO);
  });

  it('/consola redirige a /consola/tenants', async () => {
    sesion.conPermisos(PERMISOS_CONSOLA.tenantConsultar);

    expect((await navegar('/consola')).url).toBe('/consola/tenants');
  });
});
