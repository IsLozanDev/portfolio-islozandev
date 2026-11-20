import { randomBytes } from 'node:crypto';
import { BYTES_CLAVE, type ClavesMaestras, type ResultadoReenvoltura } from '@vitrina/plataforma/secretos';
import { ejecutarReenvolturaCli, type Reenvolvedor } from '../src/cli/secretos.cli.js';
import { cargarConfig } from '../src/config/env.js';

const CLAVE_UNO = randomBytes(BYTES_CLAVE).toString('base64');
const CLAVE_DOS = randomBytes(BYTES_CLAVE).toString('base64');
const ENV = {
  DATABASE_URL: 'postgres://nadie:clave-local@127.0.0.1:5432/vitrina',
  REDIS_URL: 'redis://localhost:6379',
  SUPABASE_URL: 'https://prueba.supabase.co',
  SUPABASE_SECRET_KEY: 'sb_secret_prueba',
  SEC_CLAVES_MAESTRAS: `1:${CLAVE_UNO};2:${CLAVE_DOS}`,
  SEC_CLAVE_ACTIVA: '2',
};

describe('entorno de la bóveda en el worker (spec 41)', () => {
  const produccion = { ...ENV, APP_ENV: 'production', OBS_SAL_DOCUMENTO: 's'.repeat(32), ARC_ANTIVIRUS: 'clamav', CLAMAV_HOST: 'clamav.interno' };

  it('en development arranca sin claves maestras', () => {
    expect(cargarConfig({ ...ENV, SEC_CLAVES_MAESTRAS: undefined, SEC_CLAVE_ACTIVA: undefined }).SEC_CLAVES_MAESTRAS).toBeUndefined();
  });

  it('en production no arranca sin claves, con una que no es de 32 bytes o con la activa fuera de la lista', () => {
    expect(() => cargarConfig({ ...produccion, SEC_CLAVES_MAESTRAS: undefined, SEC_CLAVE_ACTIVA: undefined })).toThrow(
      'SEC_CLAVES_MAESTRAS: custom; SEC_CLAVE_ACTIVA: custom',
    );
    expect(() => cargarConfig({ ...produccion, SEC_CLAVES_MAESTRAS: `1:${randomBytes(24).toString('base64')}`, SEC_CLAVE_ACTIVA: '1' })).toThrow(
      'SEC_CLAVES_MAESTRAS',
    );
    expect(() => cargarConfig({ ...produccion, SEC_CLAVE_ACTIVA: '3' })).toThrow('SEC_CLAVES_MAESTRAS');
    expect(() => cargarConfig({ ...produccion, SEC_CLAVE_ACTIVA: '3' })).not.toThrow(CLAVE_UNO);
    expect(cargarConfig(produccion).SEC_CLAVE_ACTIVA).toBe(2);
  });
});

describe('CLI secretos:reenvolver (spec 41)', () => {
  let resultado: ResultadoReenvoltura;
  let pendientes: number;
  let llamadas: string[];
  let clavesRecibidas: ClavesMaestras | undefined;
  let urlRecibida: string | undefined;

  const salida = () => {
    const registro = { logs: [] as string[], errores: [] as string[], log: (mensaje: string) => registro.logs.push(mensaje), error: (mensaje: string) => registro.errores.push(mensaje) };
    return registro;
  };
  const abrir = async (url: string, claves: ClavesMaestras): Promise<Reenvolvedor> => {
    urlRecibida = url;
    clavesRecibidas = claves;
    return {
      ejecutar: async () => {
        llamadas.push('ejecutar');
        return resultado;
      },
      contarPendientes: async () => {
        llamadas.push('contar');
        return pendientes;
      },
      cerrar: async () => {
        llamadas.push('cerrar');
      },
    };
  };

  beforeEach(() => {
    resultado = { reenvueltas: 3, pendientes: 0 };
    pendientes = 0;
    llamadas = [];
    clavesRecibidas = undefined;
    urlRecibida = undefined;
  });

  it('re-envuelve con la activa, imprime el resultado y el destino sin clave, y termina en 0 sin pendientes', async () => {
    const consola = salida();

    expect(await ejecutarReenvolturaCli([], ENV, consola, abrir)).toBe(0);

    expect(llamadas).toEqual(['ejecutar', 'cerrar']);
    expect(clavesRecibidas?.activa).toBe(2);
    expect(clavesRecibidas?.versiones).toEqual([1, 2]);
    expect(consola.logs).toEqual(['Destino: 127.0.0.1:5432/vitrina · clave maestra activa: 2', '{"reenvueltas":3,"pendientes":0}']);
    const todo = [...consola.logs, ...consola.errores].join('\n');
    for (const secreto of ['clave-local', CLAVE_UNO, CLAVE_DOS]) expect(todo).not.toContain(secreto);
  });

  it('con pendientes al terminar sale en 1', async () => {
    resultado = { reenvueltas: 1, pendientes: 2 };

    expect(await ejecutarReenvolturaCli([], ENV, salida(), abrir)).toBe(1);
  });

  it('--verificar solo cuenta: 0 pendientes termina en 0 y alguno en 1', async () => {
    const consola = salida();

    expect(await ejecutarReenvolturaCli(['--verificar'], ENV, consola, abrir)).toBe(0);
    expect(llamadas).toEqual(['contar', 'cerrar']);
    expect(consola.logs.at(-1)).toBe('Claves pendientes de re-envolver: 0');

    pendientes = 4;
    expect(await ejecutarReenvolturaCli(['--verificar'], ENV, salida(), abrir)).toBe(1);
  });

  it('--remoto usa DATABASE_MIGRATION_URL y sin ella no abre nada', async () => {
    const consola = salida();
    expect(await ejecutarReenvolturaCli(['--remoto'], ENV, consola, abrir)).toBe(1);
    expect(consola.errores).toEqual(['Falta DATABASE_MIGRATION_URL. Copia .env.example a .env.']);

    await ejecutarReenvolturaCli(['--remoto'], { ...ENV, DATABASE_MIGRATION_URL: 'postgres://migrador@db.remota:5432/postgres' }, salida(), abrir);
    expect(urlRecibida).toBe('postgres://migrador@db.remota:5432/postgres');
  });

  it('sin claves, con claves inválidas o con una opción desconocida no abre nada y sale en 1', async () => {
    const sinClaves = salida();
    expect(await ejecutarReenvolturaCli([], { ...ENV, SEC_CLAVES_MAESTRAS: undefined, SEC_CLAVE_ACTIVA: undefined }, sinClaves, abrir)).toBe(1);
    expect(sinClaves.errores).toEqual(['Faltan SEC_CLAVES_MAESTRAS y SEC_CLAVE_ACTIVA']);

    const invalidas = salida();
    expect(await ejecutarReenvolturaCli([], { ...ENV, SEC_CLAVE_ACTIVA: '3' }, invalidas, abrir)).toBe(1);
    expect(invalidas.errores[0]).toMatch(/^SEC_CLAVES_MAESTRAS inválida/);
    expect(invalidas.errores.join('\n')).not.toContain(CLAVE_UNO);

    const desconocida = salida();
    expect(await ejecutarReenvolturaCli(['--todo'], ENV, desconocida, abrir)).toBe(1);
    expect(desconocida.errores).toEqual(['Uso: secretos:reenvolver [--verificar] [--remoto]']);
    expect(llamadas).toEqual([]);
  });

  it('un error al re-envolver imprime solo su nombre, cierra y sale en 1', async () => {
    const consola = salida();
    const fallar = async (): Promise<Reenvolvedor> => ({
      ejecutar: async () => {
        throw new TypeError(`detalle con ${CLAVE_UNO}`);
      },
      contarPendientes: async () => 0,
      cerrar: async () => {
        llamadas.push('cerrar');
      },
    });

    expect(await ejecutarReenvolturaCli([], ENV, consola, fallar)).toBe(1);
    expect(consola.errores).toEqual(['Error al re-envolver las claves: TypeError']);
    expect(llamadas).toEqual(['cerrar']);
  });
});
