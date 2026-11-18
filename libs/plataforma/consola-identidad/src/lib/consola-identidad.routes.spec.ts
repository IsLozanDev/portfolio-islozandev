import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { CONFIG_AUTH, SesionService } from '@vitrina/shared/auth';
import { DobleSesion, RUTA_PROHIBIDO } from '../testing/doble-sesion';
import { API_URL } from '../testing/http-de-prueba';
import { CONSOLA_IDENTIDAD_ROUTES } from './consola-identidad.routes';
import { PERMISOS_CONSOLA_IDENTIDAD } from './models/permisos-identidad';

@Component({ template: '' })
class Prohibido {}

const ESPERA_PRECARGA_MS = 30_000;

describe('CONSOLA_IDENTIDAD_ROUTES', () => {
  let sesion: DobleSesion;

  beforeAll(() => import('./pages/cuotas-lista/cuotas-lista.page'), ESPERA_PRECARGA_MS);

  async function navegar(url: string): Promise<{ url: string; pagina: string }> {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'consola/identidad', children: CONSOLA_IDENTIDAD_ROUTES },
          { path: '403', component: Prohibido },
        ]),
        { provide: SesionService, useValue: sesion },
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: CONFIG_AUTH, useValue: { apiUrl: API_URL, rutas: { prohibido: RUTA_PROHIBIDO } } },
      ],
    });
    const harness = await RouterTestingHarness.create(url);
    return { url: TestBed.inject(Router).url, pagina: harness.routeNativeElement?.tagName.toLowerCase() ?? '' };
  }

  beforeEach(() => {
    sesion = new DobleSesion();
  });

  it('cuotas abre la lista con plat.identidad.cuota_gestionar', async () => {
    sesion.conPermisos(PERMISOS_CONSOLA_IDENTIDAD.cuotaGestionar);

    expect(await navegar('/consola/identidad/cuotas')).toEqual({ url: '/consola/identidad/cuotas', pagina: 'vit-cuotas-lista' });
  });

  it('cuotas/:tenantId/:periodo abre el detalle con plat.identidad.cuota_gestionar', async () => {
    sesion.conPermisos(PERMISOS_CONSOLA_IDENTIDAD.cuotaGestionar);

    expect((await navegar('/consola/identidad/cuotas/t-1/2026-11')).pagina).toBe('vit-cuota-detalle');
  });

  it('proveedores abre la lista con plat.identidad.proveedor', async () => {
    sesion.conPermisos(PERMISOS_CONSOLA_IDENTIDAD.proveedor);

    expect((await navegar('/consola/identidad/proveedores')).pagina).toBe('vit-proveedores-lista');
  });

  it('cuotas sin su permiso va a /403 aunque tenga el de proveedores', async () => {
    sesion.conPermisos(PERMISOS_CONSOLA_IDENTIDAD.proveedor);

    expect((await navegar('/consola/identidad/cuotas')).url).toBe(RUTA_PROHIBIDO);
  });

  it('proveedores sin su permiso va a /403 aunque tenga el de cuotas', async () => {
    sesion.conPermisos(PERMISOS_CONSOLA_IDENTIDAD.cuotaGestionar);

    expect((await navegar('/consola/identidad/proveedores')).url).toBe(RUTA_PROHIBIDO);
  });
});
