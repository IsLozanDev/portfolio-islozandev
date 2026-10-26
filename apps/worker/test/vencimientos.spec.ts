import type { ResultadoVencimientos } from '@vitrina/plataforma/org';
import { ejecutarVencimientosCli, type Revisor } from '../src/cli/vencimientos.cli.js';
import { DiasGraciaParametros } from '../src/vencimientos/dias-gracia.parametros.js';
import { revisarHoy } from '../src/vencimientos/tarea-vencimientos.js';

const resultadoDe = (fecha: string): ResultadoVencimientos => ({ fecha, avisos: 1, vencidas: 0, suspendidos: 0, fallidos: 0 });

describe('Tarea diaria de vencimientos', () => {
  it('a las 05:30 UTC del 10/10 revisa el 10/10 de Lima (00:30); a las 04:30 UTC, todavía el 09/10', async () => {
    const fechas: string[] = [];
    const revisar = { ejecutar: async (fecha: string) => (fechas.push(fecha), resultadoDe(fecha)) };

    await revisarHoy(revisar, { now: () => new Date('2026-10-10T05:30:00Z') });
    await revisarHoy(revisar, { now: () => new Date('2026-10-10T04:30:00Z') });

    expect(fechas).toEqual(['2026-10-10', '2026-10-09']);
  });

  it('DiasGraciaParametros lee plat.suscripcion.dias_gracia', async () => {
    const pedidos: string[] = [];
    const parametros = { valor: async <T>(codigo: string) => (pedidos.push(codigo), { valor: 3 as T, origen: 'TENANT' as const }) };

    await expect(new DiasGraciaParametros(parametros).de()).resolves.toBe(3);
    expect(pedidos).toEqual(['plat.suscripcion.dias_gracia']);
  });
});

describe('CLI vencimientos:ejecutar', () => {
  const ENV = { DATABASE_URL: 'postgres://nadie:clave-local@127.0.0.1:5432/vitrina' };
  let fechas: string[];
  let urls: string[];
  let cerrados: number;
  let fallo: Error | null;
  const salida = () => {
    const s = { logs: [] as string[], errores: [] as string[], log: (m: string) => s.logs.push(m), error: (m: string) => s.errores.push(m) };
    return s;
  };
  const abrir = async (url: string): Promise<Revisor> => {
    urls.push(url);
    return {
      ejecutar: async (fecha) => {
        fechas.push(fecha);
        if (fallo) throw fallo;
        return resultadoDe(fecha);
      },
      hoy: () => '2026-10-26',
      cerrar: async () => {
        cerrados += 1;
      },
    };
  };

  beforeEach(() => {
    fechas = [];
    urls = [];
    cerrados = 0;
    fallo = null;
  });

  it('sin --fecha revisa hoy en Lima, imprime destino sin clave y el resultado, y cierra', async () => {
    const s = salida();
    expect(await ejecutarVencimientosCli([], ENV, s, abrir)).toBe(0);
    expect(fechas).toEqual(['2026-10-26']);
    expect(s.logs).toEqual(['Destino: 127.0.0.1:5432/vitrina', JSON.stringify(resultadoDe('2026-10-26'))]);
    expect(s.logs.join()).not.toContain('clave-local');
    expect(cerrados).toBe(1);
  });

  it('con --fecha revisa esa fecha (reejecución manual de TR-CA-021)', async () => {
    expect(await ejecutarVencimientosCli(['--fecha', '2026-10-10'], ENV, salida(), abrir)).toBe(0);
    expect(fechas).toEqual(['2026-10-10']);
  });

  it.each([[['--fecha']], [['--fecha', '10/10/2026']]])('una fecha mal formada %j sale con 1 sin conectarse', async (args) => {
    const s = salida();
    expect(await ejecutarVencimientosCli(args, ENV, s, abrir)).toBe(1);
    expect(s.errores).toEqual(['Uso: vencimientos:ejecutar [--fecha AAAA-MM-DD] [--remoto]']);
    expect(urls).toEqual([]);
  });

  it('con --remoto exige DATABASE_MIGRATION_URL y la usa', async () => {
    const s = salida();
    expect(await ejecutarVencimientosCli(['--remoto'], ENV, s, abrir)).toBe(1);
    expect(s.errores).toEqual(['Falta DATABASE_MIGRATION_URL. Copia .env.example a .env.']);

    const remota = 'postgres://dueno:secreto@pooler.ejemplo.com:5432/postgres';
    expect(await ejecutarVencimientosCli(['--remoto'], { DATABASE_MIGRATION_URL: remota }, salida(), abrir)).toBe(0);
    expect(urls).toEqual([remota]);
  });

  it('si la tarea no puede correr sale con 1 y cierra', async () => {
    const s = salida();
    fallo = new Error('base caída');
    expect(await ejecutarVencimientosCli([], ENV, s, abrir)).toBe(1);
    expect(s.errores).toEqual(['Error al revisar vencimientos: base caída']);
    expect(cerrados).toBe(1);
  });
});
