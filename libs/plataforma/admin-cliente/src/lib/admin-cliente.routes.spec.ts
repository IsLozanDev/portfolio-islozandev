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

  beforeAll(
    () =>
      Promise.all([
        import('./pages/usuarios-lista/usuarios-lista.page'),
        import('./pages/roles-lista/roles-lista.page'),
        import('./pages/empresas-lista/empresas-lista.page'),
      ]),
    ESPERA_PRECARGA_MS,
  );

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

  it('/admin/roles abre la lista con plat.rol.gestionar', async () => {
    sesion.conPermisos(PERMISOS_ADMIN.rolGestionar);

    expect(await navegar('/admin/roles')).toEqual({ url: '/admin/roles', titulo: 'Roles' });
  });

  it.each(['/admin/roles', '/admin/roles/nuevo', '/admin/roles/r-mozo', '/admin/roles/r-mozo/copiar'])('%s sin plat.rol.gestionar va a /403', async (ruta) => {
    sesion.conPermisos(PERMISOS_ADMIN.usuarioInvitar);

    expect((await navegar(ruta)).url).toBe(RUTA_PROHIBIDO);
  });

  it('/admin/empresas abre la lista con plat.organizacion.consultar', async () => {
    sesion.conPermisos(PERMISOS_ADMIN.organizacionConsultar);

    expect(await navegar('/admin/empresas')).toEqual({ url: '/admin/empresas', titulo: 'Empresas' });
  });

  it.each(['/admin/empresas/nueva', '/admin/empresas/e-sabores/editar'])('%s sin plat.empresa.crear va a /403', async (ruta) => {
    sesion.conPermisos(PERMISOS_ADMIN.organizacionConsultar);

    expect((await navegar(ruta)).url).toBe(RUTA_PROHIBIDO);
  });

  it('/admin/empresas sin plat.organizacion.consultar va a /403', async () => {
    sesion.conPermisos(PERMISOS_ADMIN.empresaCrear);

    expect((await navegar('/admin/empresas')).url).toBe(RUTA_PROHIBIDO);
  });

  it('/admin/sucursales sin plat.organizacion.consultar va a /403', async () => {
    sesion.conPermisos(PERMISOS_ADMIN.sucursalGestionar);

    expect((await navegar('/admin/sucursales')).url).toBe(RUTA_PROHIBIDO);
  });

  it.each(['/admin/sucursales/nueva?empresa=e-sabores', '/admin/sucursales/s-cayma/editar'])('%s sin plat.sucursal.gestionar va a /403', async (ruta) => {
    sesion.conPermisos(PERMISOS_ADMIN.organizacionConsultar);

    expect((await navegar(ruta)).url).toBe(RUTA_PROHIBIDO);
  });

  it('/admin/unidades sin plat.organizacion.consultar va a /403', async () => {
    sesion.conPermisos(PERMISOS_ADMIN.unidadGestionar);

    expect((await navegar('/admin/unidades')).url).toBe(RUTA_PROHIBIDO);
  });

  it.each(['/admin/unidades/nueva?empresa=e-sabores', '/admin/unidades/u-caja/editar'])('%s sin plat.unidad.gestionar va a /403', async (ruta) => {
    sesion.conPermisos(PERMISOS_ADMIN.organizacionConsultar);

    expect((await navegar(ruta)).url).toBe(RUTA_PROHIBIDO);
  });
});
