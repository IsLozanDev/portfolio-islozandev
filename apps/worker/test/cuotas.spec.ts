import type { ResultadoAperturaCuotas } from '@vitrina/plataforma/identidad';
import { ejecutarCuotasCli, type Apertura } from '../src/cli/cuotas.cli.js';
import { abrirPeriodoActual, PATRON_CUOTAS } from '../src/cuotas/tarea-cuotas.js';
import { TenantsActivosOrg } from '../src/cuotas/tenants-activos.org.js';

const resultadoDe = (periodo: string): ResultadoAperturaCuotas => ({ periodo, creadas: 2, existentes: 0, fallidas: 0 });

describe('Tarea mensual de cuotas', () => {
  it('corre el día 1 a las 00:05', () => {
    expect(PATRON_CUOTAS).toBe('5 0 1 * *');
  });

  it('a las 00:05 del 1/12 en Lima abre 2026-12; un minuto antes de medianoche en Lima, todavía 2026-11', async () => {
    const periodos: string[] = [];
    const abrir = { ejecutar: async (periodo: string) => (periodos.push(periodo), resultadoDe(periodo)) };

    await abrirPeriodoActual(abrir, { now: () => new Date('2026-12-01T05:05:00Z') });
    await abrirPeriodoActual(abrir, { now: () => new Date('2026-12-01T04:59:00Z') });

    expect(periodos).toEqual(['2026-12', '2026-11']);
  });
});

describe('TenantsActivosOrg', () => {
  it('pide solo ACTIVO, recorre las páginas y para en la última incompleta', async () => {
    const pedidos: unknown[][] = [];
    const ids = Array.from({ length: 250 }, (_, indice) => `tenant-${indice}`);
    const dataSource = {
      query: async (_sql: string, parametros: unknown[]) => {
        pedidos.push(parametros);
        const [, , , limite, desplazamiento] = parametros as [null, string, null, number, number];
        return ids.slice(desplazamiento, desplazamiento + limite).map((id) => ({ id }));
      },
    };

    const listados: string[] = [];
    for await (const id of new TenantsActivosOrg(dataSource).listar()) listados.push(id);

    expect(listados).toEqual(ids);
    expect(pedidos).toEqual([
      [null, 'ACTIVO', null, 200, 0],
      [null, 'ACTIVO', null, 200, 200],
    ]);
  });
});

describe('CLI cuotas:abrir', () => {
  const ENV = { DATABASE_URL: 'postgres://nadie:clave-local@127.0.0.1:5432/vitrina' };
  let periodos: string[];
  let cerradas: number;
  const salida = () => {
    const s = { logs: [] as string[], errores: [] as string[], log: (m: string) => s.logs.push(m), error: (m: string) => s.errores.push(m) };
    return s;
  };
  const abrir = async (): Promise<Apertura> => ({
    ejecutar: async (periodo) => (periodos.push(periodo), resultadoDe(periodo)),
    periodoActual: () => '2026-11',
    cerrar: async () => {
      cerradas += 1;
    },
  });

  beforeEach(() => {
    periodos = [];
    cerradas = 0;
  });

  it('sin --periodo abre el mes actual de Lima, imprime destino sin clave y el resultado, y cierra', async () => {
    const s = salida();
    await expect(ejecutarCuotasCli([], ENV, s, abrir)).resolves.toBe(0);
    expect(periodos).toEqual(['2026-11']);
    expect(s.logs).toEqual(['Destino: 127.0.0.1:5432/vitrina', JSON.stringify(resultadoDe('2026-11'))]);
    expect(s.logs.join()).not.toContain('clave-local');
    expect(cerradas).toBe(1);
  });

  it('--periodo 2026-12 abre ese mes', async () => {
    await expect(ejecutarCuotasCli(['--periodo', '2026-12'], ENV, salida(), abrir)).resolves.toBe(0);
    expect(periodos).toEqual(['2026-12']);
  });

  it.each([['--periodo'], ['--periodo', '2026-13'], ['--periodo', '2026-1']])('%s inválido da 1 con el uso, sin abrir', async (...args) => {
    const s = salida();
    await expect(ejecutarCuotasCli(args, ENV, s, abrir)).resolves.toBe(1);
    expect(s.errores).toEqual(['Uso: cuotas:abrir [--periodo AAAA-MM] [--remoto]']);
    expect(periodos).toEqual([]);
  });

  it('--remoto exige DATABASE_MIGRATION_URL', async () => {
    const s = salida();
    await expect(ejecutarCuotasCli(['--remoto'], ENV, s, abrir)).resolves.toBe(1);
    expect(s.errores).toEqual(['Falta DATABASE_MIGRATION_URL. Copia .env.example a .env.']);
  });

  it('si la apertura falla da 1 y cierra igual', async () => {
    const s = salida();
    const fallida = async (): Promise<Apertura> => ({ ...(await abrir()), ejecutar: async () => Promise.reject(new Error('sin base')) });
    await expect(ejecutarCuotasCli([], ENV, s, fallida)).resolves.toBe(1);
    expect(s.errores).toEqual(['Error al abrir las cuotas: sin base']);
    expect(cerradas).toBe(1);
  });
});
