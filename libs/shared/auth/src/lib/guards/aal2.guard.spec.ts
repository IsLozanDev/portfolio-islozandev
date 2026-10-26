import { PaginaDePrueba, RutasDePrueba } from '../../testing/rutas-de-prueba';
import { aal2Guard } from './aal2.guard';

describe('aal2Guard', () => {
  let rutas: RutasDePrueba;

  beforeEach(() => {
    rutas = new RutasDePrueba([{ path: 'consola', component: PaginaDePrueba, canActivate: [aal2Guard] }]);
  });

  afterEach(() => rutas.verificar());

  it('con sesión aal1 va a /auth/mfa?returnUrl', async () => {
    expect(await rutas.navegarConSesion('/consola')).toBe('/auth/mfa?returnUrl=%2Fconsola');
  });

  it('con sesión aal2 entra', async () => {
    rutas.supabase.nivelActual = 'aal2';

    expect(await rutas.navegarConSesion('/consola')).toBe('/consola');
  });

  it('sin sesión va a ingresar', async () => {
    expect(await rutas.navegarSinSesion('/consola')).toBe('/auth/ingresar?returnUrl=%2Fconsola');
  });
});
