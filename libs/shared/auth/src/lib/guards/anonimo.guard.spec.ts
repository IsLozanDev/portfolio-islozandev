import { PaginaDePrueba, RutasDePrueba } from '../../testing/rutas-de-prueba';
import { anonimoGuard } from './anonimo.guard';

describe('anonimoGuard', () => {
  let rutas: RutasDePrueba;

  beforeEach(() => {
    rutas = new RutasDePrueba([{ path: 'auth/ingresar', component: PaginaDePrueba, canActivate: [anonimoGuard] }]);
  });

  afterEach(() => rutas.verificar());

  it('sin sesión deja entrar a ingresar', async () => {
    expect(await rutas.navegarSinSesion('/auth/ingresar')).toBe('/auth/ingresar');
  });

  it('con sesión manda a la portada', async () => {
    expect(await rutas.navegarConSesion('/auth/ingresar')).toBe('/');
  });
});
