import { autenticadoGuard } from '@vitrina/shared/auth';
import { appRoutes, NOMBRE_APP } from './app.routes';

describe('appRoutes de admin', () => {
  it('el layout lleva el nombre «Administración» y filtra el menú por /admin', () => {
    const layout = appRoutes.find((ruta) => ruta.path === '' && ruta.canActivate?.includes(autenticadoGuard));
    expect(NOMBRE_APP).toBe('Administración');
    expect(layout?.data).toEqual({ nombreApp: NOMBRE_APP, prefijoMenu: '/admin' });
  });
});
