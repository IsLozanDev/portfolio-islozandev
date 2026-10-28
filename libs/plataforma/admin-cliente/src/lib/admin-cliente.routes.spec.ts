import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { CONFIG_AUTH, SesionService } from '@vitrina/shared/auth';
import { DobleSesion, RUTA_PROHIBIDO } from '../testing/doble-sesion';
import { API_URL } from '../testing/http-de-prueba';
import { ADMIN_CLIENTE_ROUTES } from './admin-cliente.routes';
import { PERMISOS_ADMIN } from './models/permisos-admin';

@Component({ template: '' })
class Prohibido {}

/** La primera carga lazy transforma Material entero; con la máquina ocupada pasa los 5 s por defecto. */
const ESPERA_PRECARGA_MS = 30_000;

describe('ADMIN_CLIENTE_ROUTES', () => {
  let sesion: DobleSesion;

  beforeAll(() => import('./pages/usuarios-lista/usuarios-lista.page'), ESPERA_PRECARGA_MS);

  async function navegar(url: string): Promise<{ url: string; titulo: string }> {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'admin', children: ADMIN_CLIENTE_ROUTES },
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

  it('/admin/usuarios abre la lista con plat.usuario.invitar', async () => {
    sesion.conPermisos(PERMISOS_ADMIN.usuarioInvitar);

    expect(await navegar('/admin/usuarios')).toEqual({ url: '/admin/usuarios', titulo: 'Usuarios' });
  });

  it('/admin/usuarios sin el permiso va a /403', async () => {
    expect((await navegar('/admin/usuarios')).url).toBe(RUTA_PROHIBIDO);
  });

  it('/admin/asignaciones redirige a /admin/usuarios, que exige su propio permiso', async () => {
    sesion.conPermisos(PERMISOS_ADMIN.usuarioInvitar);

    expect((await navegar('/admin/asignaciones')).url).toBe('/admin/usuarios');
  });
});
