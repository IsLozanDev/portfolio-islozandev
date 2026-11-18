import { cargarConfig } from '../src/config/env.js';

const ENV_MINIMO = {
  DATABASE_URL: 'postgres://postgres:clave-secreta@localhost:5432/vitrina',
  REDIS_URL: 'redis://localhost:6379',
  SUPABASE_URL: 'https://prueba.supabase.co',
  SUPABASE_SECRET_KEY: 'sb_secret_prueba',
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

  test('exige SUPABASE_URL y SUPABASE_SECRET_KEY: el worker lee y borra objetos de TR-ARC (regla 9, spec 33)', () => {
    const sinClave = { ...ENV_MINIMO, SUPABASE_SECRET_KEY: undefined };
    const sinUrl = { ...ENV_MINIMO, SUPABASE_URL: undefined };

    expect(() => cargarConfig(sinClave)).toThrow('SUPABASE_SECRET_KEY');
    expect(() => cargarConfig(sinUrl)).toThrow('SUPABASE_URL');
    expect(() => cargarConfig(sinClave)).not.toThrow(/sb_secret/);
  });

  test('ARC_BUCKET es archivos y ARC_LIMPIEZA_CRON las 03:45 por defecto; un cron inválido no arranca', () => {
    expect(cargarConfig(ENV_MINIMO)).toMatchObject({ ARC_BUCKET: 'archivos', ARC_LIMPIEZA_CRON: '45 3 * * *' });
    expect(cargarConfig({ ...ENV_MINIMO, ARC_LIMPIEZA_CRON: '0 4 * * *' }).ARC_LIMPIEZA_CRON).toBe('0 4 * * *');
    expect(() => cargarConfig({ ...ENV_MINIMO, ARC_LIMPIEZA_CRON: 'cada noche' })).toThrow('ARC_LIMPIEZA_CRON');
  });

  test('un valor inválido falla sin mostrar la URL con la clave', () => {
    const invocar = () => cargarConfig({ ...ENV_MINIMO, REDIS_URL: 'http://localhost', EVT_LOTE: '0' });

    expect(invocar).toThrow('Variables de entorno inválidas: REDIS_URL: invalid_format; EVT_LOTE: too_small');
    expect(invocar).not.toThrow(/clave-secreta/);
  });
});
