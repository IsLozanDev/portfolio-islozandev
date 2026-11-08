import { aal2Guard, autenticadoGuard } from '@vitrina/shared/auth';
import { appRoutes, NOMBRE_APP, PREFIJO_MENU_CONSOLA } from './app.routes';

describe('appRoutes de la consola', () => {
  const layout = appRoutes.find((ruta) => ruta.path === '' && ruta.canActivate?.includes(autenticadoGuard));
  const hijas = layout?.children ?? [];

  it('el layout lleva el nombre de la consola y filtra el menú por /consola', () => {
    expect(layout?.data).toEqual({ nombreApp: NOMBRE_APP, prefijoMenu: PREFIJO_MENU_CONSOLA });
  });

  it('la raíz redirige a la lista de tenants', () => {
    expect(hijas.find((ruta) => ruta.path === '')).toMatchObject({ redirectTo: 'consola/tenants' });
  });

  it('toda la consola exige aal2', () => {
    expect(hijas.find((ruta) => ruta.path === 'consola')?.canActivate).toEqual([aal2Guard]);
    expect(hijas.find((ruta) => ruta.path === 'consola/catalogos')?.canActivate).toEqual([aal2Guard]);
  });

  it('consola/catalogos va antes de consola, que la tomaría como una ruta suya', () => {
    const rutas = hijas.map((ruta) => ruta.path);
    expect(rutas.indexOf('consola/catalogos')).toBeGreaterThanOrEqual(0);
    expect(rutas.indexOf('consola/catalogos')).toBeLessThan(rutas.indexOf('consola'));
  });
});
