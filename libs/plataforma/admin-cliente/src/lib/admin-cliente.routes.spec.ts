import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { CONFIG_AUTH, SesionService } from '@vitrina/shared/auth';
import { DobleSesion, RUTA_PROHIBIDO } from '../testing/doble-sesion';
import { ADMIN_CLIENTE_ROUTES } from './admin-cliente.routes';
import { PERMISOS_ADMIN } from './models/permisos-admin';

@Component({ template: '' })
class Prohibido {}

describe('ADMIN_CLIENTE_ROUTES', () => {
  let sesion: DobleSesion;

  async function navegar(url: string): Promise<{ url: string; texto: string }> {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'admin', children: ADMIN_CLIENTE_ROUTES },
          { path: '403', component: Prohibido },
        ]),
        { provide: SesionService, useValue: sesion },
        { provide: CONFIG_AUTH, useValue: { rutas: { prohibido: RUTA_PROHIBIDO } } },
      ],
    });
    const harness = await RouterTestingHarness.create(url);
    return { url: TestBed.inject(Router).url, texto: (harness.routeNativeElement?.textContent ?? '').trim() };
  }

  beforeEach(() => {
    sesion = new DobleSesion();
  });

  it('/admin/usuarios abre la lista con plat.usuario.invitar', async () => {
    sesion.conPermisos(PERMISOS_ADMIN.usuarioInvitar);

    expect(await navegar('/admin/usuarios')).toEqual({ url: '/admin/usuarios', texto: 'Usuarios' });
  });

  it('/admin/usuarios sin el permiso va a /403', async () => {
    expect((await navegar('/admin/usuarios')).url).toBe(RUTA_PROHIBIDO);
  });

  it('/admin/asignaciones redirige a /admin/usuarios, que exige su propio permiso', async () => {
    sesion.conPermisos(PERMISOS_ADMIN.usuarioInvitar);

    expect((await navegar('/admin/asignaciones')).url).toBe('/admin/usuarios');
  });
});
