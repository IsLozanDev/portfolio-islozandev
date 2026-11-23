import type { ResultadoAvisos } from '@vitrina/plataforma/comprobantes';
import { ejecutarAvisosFeCli, type Avisador } from '../src/cli/certificados-fe.cli.js';
import { avisarHoy, PATRON_CERTIFICADOS_FE } from '../src/certificados-fe/tarea-certificados-fe.js';

const RESULTADO: ResultadoAvisos = { revisados: 2, avisados: 1, fallidos: 0 };

describe('Tarea diaria de certificados por vencer (spec 49)', () => {
  it('corre a las 07:00 y avisa con la fecha de Lima: a las 04:30 UTC del 06/10 todavía es el 05/10', async () => {
    const fechas: string[] = [];
    const avisar = { ejecutar: async (fecha: string) => (fechas.push(fecha), RESULTADO) };

    await avisarHoy(avisar, { now: () => new Date('2026-10-06T05:30:00Z') });
    await avisarHoy(avisar, { now: () => new Date('2026-10-06T04:30:00Z') });

    expect(fechas).toEqual(['2026-10-06', '2026-10-05']);
    expect(PATRON_CERTIFICADOS_FE).toBe('0 7 * * *');
  });
});

describe('CLI fe:avisos:ejecutar', () => {
  const ENV = { DATABASE_URL: 'postgres://nadie:clave-local@127.0.0.1:5432/vitrina', DATABASE_MIGRATION_URL: 'postgres://dev:clave-remota@db.supabase.co:5432/postgres' };
  let fechas: string[];
  let urls: string[];
  let cerrados: number;
  const salida = () => {
    const consola = {
      logs: [] as string[],
      errores: [] as string[],
      log: (mensaje: string) => consola.logs.push(mensaje),
      error: (mensaje: string) => consola.errores.push(mensaje),
    };
    return consola;
  };
  const avisadorDoble = (ejecutar: Avisador['ejecutar']): Avisador => ({
    ejecutar,
    hoy: () => '2026-10-06',
    cerrar: async () => {
      cerrados += 1;
    },
  });
  const abrir = async (url: string): Promise<Avisador> => {
    urls.push(url);
    return avisadorDoble(async (fecha) => (fechas.push(fecha), RESULTADO));
  };

  beforeEach(() => {
    fechas = [];
    urls = [];
    cerrados = 0;
  });

  it('sin --fecha avisa hoy en Lima, imprime destino sin clave y el resultado, y cierra', async () => {
    const consola = salida();
    expect(await ejecutarAvisosFeCli([], ENV, consola, abrir)).toBe(0);
    expect(fechas).toEqual(['2026-10-06']);
    expect(consola.logs).toEqual(['Destino: 127.0.0.1:5432/vitrina', JSON.stringify(RESULTADO)]);
    expect(consola.logs.join()).not.toContain('clave-local');
    expect(cerrados).toBe(1);
  });

  it('con --remoto usa DATABASE_MIGRATION_URL y con --fecha esa fecha', async () => {
    expect(await ejecutarAvisosFeCli(['--remoto', '--fecha', '2026-10-20'], ENV, salida(), abrir)).toBe(0);
    expect([urls, fechas]).toEqual([[ENV.DATABASE_MIGRATION_URL], ['2026-10-20']]);
  });

  it('una fecha mal formada o sin URL sale con 1 sin conectarse', async () => {
    const consola = salida();
    expect(await ejecutarAvisosFeCli(['--fecha', '06/10/2026'], ENV, consola, abrir)).toBe(1);
    expect(await ejecutarAvisosFeCli([], {}, consola, abrir)).toBe(1);
    expect(consola.errores).toEqual(['Uso: fe:avisos:ejecutar [--fecha AAAA-MM-DD] [--remoto]', 'Falta DATABASE_URL. Copia .env.example a .env.']);
    expect(urls).toEqual([]);
  });

  it('si la tarea falla sale con 1, solo con el nombre del error, y cierra', async () => {
    const consola = salida();
    const fallar = async (): Promise<Avisador> =>
      avisadorDoble(async () => {
        throw new TypeError('conexión a postgres://dev:clave-remota@host');
      });
    expect(await ejecutarAvisosFeCli([], ENV, consola, fallar)).toBe(1);
    expect(consola.errores).toEqual(['Error al avisar certificados por vencer: TypeError']);
    expect(cerrados).toBe(1);
  });
});
