import { contextoDePrueba } from '../../testing/doble-supabase';
import { autenticadoGuard } from './autenticado.guard';
import { PaginaDePrueba, RutasDePrueba } from '../../testing/rutas-de-prueba';
import { permisoGuard } from './permiso.guard';

describe('permisoGuard', () => {
  let rutas: RutasDePrueba;

  beforeEach(() => {
    rutas = new RutasDePrueba([
      { path: 'anular', component: PaginaDePrueba, canMatch: [permisoGuard('rest.venta.anular')] },
      { path: 'reportes', component: PaginaDePrueba, canMatch: [permisoGuard(['rest.reportes.ver', 'rest.caja.abrir'])] },
      {
        path: 'admin',
        canActivate: [autenticadoGuard],
        children: [{ path: 'usuarios', component: PaginaDePrueba, canMatch: [permisoGuard('plat.usuario.invitar')] }],
      },
    ]);
  });

  afterEach(() => rutas.verificar());

  it('sin el permiso redirige a /403', async () => {
    expect(await rutas.navegarConSesion('/anular')).toBe('/403');
  });

  it('con el permiso entra', async () => {
    expect(await rutas.navegarConSesion('/anular', contextoDePrueba({ permisos: ['rest.venta.anular'] }))).toBe('/anular');
  });

  it('con una lista entra si tiene cualquiera', async () => {
    expect(await rutas.navegarConSesion('/reportes')).toBe('/reportes');
  });

  it('sin sesión deja que autenticadoGuard lleve a ingresar con la ruta pedida, no con /403', async () => {
    expect(await rutas.navegarSinSesion('/admin/usuarios')).toBe('/auth/ingresar?returnUrl=%2Fadmin%2Fusuarios');
  });
});
