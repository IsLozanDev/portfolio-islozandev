import { BACKOFF_EXPONENCIAL_CON_TOPE, esperaAntesDelReintento, opcionesDeTrabajo } from '../src/infrastructure/bullmq/politica-reintentos.js';

const POLITICA = { intentos: 8, esperaBaseMs: 5000, esperaMaximaMs: 600_000 };

describe('Política de reintentos', () => {
  test('backoff exponencial desde la base hasta el tope de 10 min', () => {
    const esperas = [1, 2, 3, 4, 5, 6, 7, 8].map((intentosHechos) => esperaAntesDelReintento(POLITICA, intentosHechos));

    expect(esperas).toEqual([5000, 10_000, 20_000, 40_000, 80_000, 160_000, 320_000, 600_000]);
  });

  test('las opciones del trabajo llevan jobId, intentos, backoff propio y retención', () => {
    expect(opcionesDeTrabajo(POLITICA, 'e-1')).toEqual({
      jobId: 'e-1',
      attempts: 8,
      backoff: { type: BACKOFF_EXPONENCIAL_CON_TOPE, delay: 5000 },
      removeOnComplete: { age: 3600 },
      removeOnFail: { age: 604_800 },
    });
  });
});
