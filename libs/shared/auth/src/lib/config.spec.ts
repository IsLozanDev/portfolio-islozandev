import { INACTIVIDAD_MINUTOS_POR_DEFECTO, RUTAS_AUTH_POR_DEFECTO, resolverConfigAuth } from './config';

const BASE = { supabaseUrl: 'https://sb.test', supabasePublishableKey: 'sb_publishable_x', apiUrl: 'https://api.test/v1' };

describe('resolverConfigAuth', () => {
  it('aplica las rutas y la inactividad por defecto', () => {
    const config = resolverConfigAuth(BASE);

    expect(config.rutas).toEqual(RUTAS_AUTH_POR_DEFECTO);
    expect(config.inactividadMinutos).toBe(INACTIVIDAD_MINUTOS_POR_DEFECTO);
    expect(config.dominioCookie).toBeUndefined();
  });

  it('respeta las rutas e inactividad configuradas sin perder el resto', () => {
    const config = resolverConfigAuth({ ...BASE, inactividadMinutos: 5, rutas: { ingresar: '/entrar' } });

    expect(config.inactividadMinutos).toBe(5);
    expect(config.rutas.ingresar).toBe('/entrar');
    expect(config.rutas.mfa).toBe(RUTAS_AUTH_POR_DEFECTO.mfa);
  });

  it('quita la barra final de apiUrl', () => {
    expect(resolverConfigAuth({ ...BASE, apiUrl: 'https://api.test/v1/' }).apiUrl).toBe('https://api.test/v1');
  });
});
