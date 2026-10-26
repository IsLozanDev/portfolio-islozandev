import { PaginaDePrueba, RutasDePrueba } from '../../testing/rutas-de-prueba';
import { sesionGuard } from './sesion.guard';

describe('sesionGuard', () => {
  let rutas: RutasDePrueba;

  beforeEach(() => {
    rutas = new RutasDePrueba([{ path: 'auth/mfa', component: PaginaDePrueba, canActivate: [sesionGuard] }]);
  });

  afterEach(() => rutas.verificar());

  it('sin sesión manda a ingresar con returnUrl', async () => {
    expect(await rutas.navegarSinSesion('/auth/mfa')).toBe('/auth/ingresar?returnUrl=%2Fauth%2Fmfa');
  });

  it('con sesión aal1 y factor verificado deja entrar, sin mandar a MFA', async () => {
    rutas.supabase.nivelSiguiente = 'aal2';
    rutas.supabase.factores = [{ id: 'f-1', factor_type: 'totp', status: 'verified' }];

    expect(await rutas.navegarConSesion('/auth/mfa')).toBe('/auth/mfa');
  });
});
