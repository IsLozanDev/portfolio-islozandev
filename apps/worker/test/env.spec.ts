import { cargarConfig } from '../src/config/env.js';

const ENV_MINIMO = {
  DATABASE_URL: 'postgres://postgres:clave-secreta@localhost:5432/vitrina',
  REDIS_URL: 'redis://localhost:6379',
};

describe('configuración del worker', () => {
  test('aplica los valores por defecto del spec', () => {
    const config = cargarConfig(ENV_MINIMO);

    expect(config).toMatchObject({
      EVT_INTERVALO_MS: 1000,
      EVT_MARGEN_SEG: 2,
      EVT_LOTE: 500,
      EVT_REBARRIDO_SEG: 60,
      EVT_VENTANA_SEG: 300,
      EVT_INTENTOS: 8,
      EVT_BACKOFF_MS: 5000,
      EVT_BACKOFF_MAX_MS: 600_000,
      EVT_CONCURRENCIA: 5,
    });
  });

  test('no lee SUPABASE_SECRET_KEY (regla 9)', () => {
    const config = cargarConfig({ ...ENV_MINIMO, SUPABASE_SECRET_KEY: 'sb_secret_prueba' });

    expect(config).not.toHaveProperty('SUPABASE_SECRET_KEY');
  });

  test('un valor inválido falla sin mostrar la URL con la clave', () => {
    const invocar = () => cargarConfig({ ...ENV_MINIMO, REDIS_URL: 'http://localhost', EVT_LOTE: '0' });

    expect(invocar).toThrow('Variables de entorno inválidas: REDIS_URL: invalid_format; EVT_LOTE: too_small');
    expect(invocar).not.toThrow(/clave-secreta/);
  });
});
