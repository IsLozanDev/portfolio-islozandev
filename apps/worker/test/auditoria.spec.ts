import type { Verificacion } from '@vitrina/plataforma/auditoria';
import { PATRON_VERIFICACION_DEFECTO } from '../src/auditoria/tarea-verificacion.js';
import { ejecutarAuditoriaCli, type Verificador } from '../src/cli/auditoria.cli.js';
import { cargarConfig } from '../src/config/env.js';

const TENANT = '0193f3a0-0000-7000-8000-000000000001';
const ENV = { DATABASE_URL: 'postgres://nadie:clave-local@127.0.0.1:5432/vitrina' };
const verificacion = (estado: 'OK' | 'ROTA'): Verificacion =>
  ({ id: '0193f3a0-0000-7000-8000-00000000b001', tenantId: TENANT, modo: 'COMPLETA', estado }) as Verificacion;

describe('verificación de integridad en el worker (spec 20b)', () => {
  it('AUD_VERIFICACION_CRON es por defecto las 03:30 y se puede cambiar; un cron inválido no arranca', () => {
    const base = { ...ENV, REDIS_URL: 'redis://localhost:6379' };
    expect(cargarConfig(base).AUD_VERIFICACION_CRON).toBe(PATRON_VERIFICACION_DEFECTO);
    expect(PATRON_VERIFICACION_DEFECTO).toBe('30 3 * * *');
    expect(cargarConfig({ ...base, AUD_VERIFICACION_CRON: '0 2 * * *' }).AUD_VERIFICACION_CRON).toBe('0 2 * * *');
    expect(() => cargarConfig({ ...base, AUD_VERIFICACION_CRON: 'todos los días' })).toThrow('AUD_VERIFICACION_CRON');
  });
});

describe('CLI auditoria:verificar (spec 20b)', () => {
  let pedidos: [string, boolean][];
  let resultado: Verificacion | null;
  let cerrados: number;
  const salida = () => {
    const registro = { logs: [] as string[], errores: [] as string[], log: (m: string) => registro.logs.push(m), error: (m: string) => registro.errores.push(m) };
    return registro;
  };
  const abrir = async (): Promise<Verificador> => ({
    ejecutar: async (tenantId, completa) => {
      pedidos.push([tenantId, completa]);
      return resultado;
    },
    cerrar: async () => {
      cerrados += 1;
    },
  });

  beforeEach(() => {
    pedidos = [];
    resultado = verificacion('OK');
    cerrados = 0;
  });

  it('con --completa verifica desde el inicio, imprime el destino sin clave y termina en 0 si quedó OK', async () => {
    const consola = salida();
    expect(await ejecutarAuditoriaCli(['--tenant', TENANT, '--completa'], ENV, consola, abrir)).toBe(0);
    expect(pedidos).toEqual([[TENANT, true]]);
    expect(consola.logs[0]).toBe('Destino: 127.0.0.1:5432/vitrina');
    expect(consola.logs.join('\n')).not.toContain('clave-local');
    expect(cerrados).toBe(1);
  });

  it('sin --completa es incremental; una cadena ROTA termina en 1', async () => {
    resultado = verificacion('ROTA');
    expect(await ejecutarAuditoriaCli(['--tenant', TENANT], ENV, salida(), abrir)).toBe(1);
    expect(pedidos).toEqual([[TENANT, false]]);
  });

  it('un tenant sin filas termina en 0', async () => {
    resultado = null;
    const consola = salida();
    expect(await ejecutarAuditoriaCli(['--tenant', TENANT], ENV, consola, abrir)).toBe(0);
    expect(consola.logs).toContain('El tenant no tiene filas de auditoría');
  });

  it('sin --tenant válido o sin DATABASE_URL termina en 1 sin abrir la base', async () => {
    for (const argumentos of [[], ['--tenant'], ['--tenant', 'sabores']]) expect(await ejecutarAuditoriaCli(argumentos, ENV, salida(), abrir)).toBe(1);
    expect(await ejecutarAuditoriaCli(['--tenant', TENANT], {}, salida(), abrir)).toBe(1);
    expect(await ejecutarAuditoriaCli(['--tenant', TENANT, '--remoto'], ENV, salida(), abrir)).toBe(1);
    expect(pedidos).toEqual([]);
  });

  it('un error de la verificación termina en 1 con el nombre del error y cierra', async () => {
    const consola = salida();
    const conFallo = async (): Promise<Verificador> => ({ ejecutar: async () => Promise.reject(new RangeError('detalle')), cerrar: async () => void (cerrados += 1) });
    expect(await ejecutarAuditoriaCli(['--tenant', TENANT], ENV, consola, conFallo)).toBe(1);
    expect(consola.errores).toEqual(['Error al verificar la auditoría: RangeError']);
    expect(cerrados).toBe(1);
  });
});
