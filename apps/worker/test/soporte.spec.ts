import type { ResultadoVencimientoSoporte } from '@vitrina/plataforma/seguridad';
import { ejecutarVencimientoSoporteCli, type VencedorSoporte } from '../src/cli/soporte.cli.js';
import { cargarConfig } from '../src/config/env.js';

const ENV_BASE = { DATABASE_URL: 'postgres://nadie:clave-local@127.0.0.1:5432/vitrina', REDIS_URL: 'redis://127.0.0.1:6379' };

describe('Configuración del vencimiento de soporte', () => {
  it('corre cada 60 s por defecto y acepta otro intervalo', () => {
    expect(cargarConfig(ENV_BASE).SOPORTE_VENCIMIENTO_CADA_MS).toBe(60_000);
    expect(cargarConfig({ ...ENV_BASE, SOPORTE_VENCIMIENTO_CADA_MS: '30000' }).SOPORTE_VENCIMIENTO_CADA_MS).toBe(30_000);
  });

  it('un intervalo no positivo no arranca', () => {
    expect(() => cargarConfig({ ...ENV_BASE, SOPORTE_VENCIMIENTO_CADA_MS: '0' })).toThrow('SOPORTE_VENCIMIENTO_CADA_MS');
  });
});

describe('CLI soporte:vencer', () => {
  const salida = () => {
    const capturada = { logs: [] as string[], errores: [] as string[], log: (m: string) => capturada.logs.push(m), error: (m: string) => capturada.errores.push(m) };
    return capturada;
  };
  const vencedor = (resultado: ResultadoVencimientoSoporte | Error, cierres: string[]): VencedorSoporte => ({
    ejecutar: async () => {
      if (resultado instanceof Error) throw resultado;
      return resultado;
    },
    cerrar: async () => void cierres.push('cerrado'),
  });

  it('corre una vez, imprime el resultado y cierra', async () => {
    const cierres: string[] = [];
    const urls: string[] = [];
    const capturada = salida();

    const codigo = await ejecutarVencimientoSoporteCli([], ENV_BASE, capturada, async (url) => (urls.push(url), vencedor({ vencidos: 2, fallidos: 0 }, cierres)));

    expect(codigo).toBe(0);
    expect(urls).toEqual([ENV_BASE.DATABASE_URL]);
    expect(capturada.logs).toEqual(['Destino: 127.0.0.1:5432/vitrina', '{"vencidos":2,"fallidos":0}']);
    expect(cierres).toEqual(['cerrado']);
  });

  it('con --remoto usa DATABASE_MIGRATION_URL y sin ella sale con 1', async () => {
    const capturada = salida();
    expect(await ejecutarVencimientoSoporteCli(['--remoto'], ENV_BASE, capturada, async () => vencedor({ vencidos: 0, fallidos: 0 }, []))).toBe(1);
    expect(capturada.errores).toEqual(['Falta DATABASE_MIGRATION_URL. Copia .env.example a .env.']);
  });

  it('si la tarea no puede correr sale con 1, sin la URL en el mensaje, y cierra igual', async () => {
    const cierres: string[] = [];
    const capturada = salida();

    const codigo = await ejecutarVencimientoSoporteCli([], ENV_BASE, capturada, async () => vencedor(new Error('conexión rechazada'), cierres));

    expect(codigo).toBe(1);
    expect(capturada.errores).toEqual(['Error al vencer accesos de soporte: conexión rechazada']);
    expect(capturada.errores.join()).not.toContain('clave-local');
    expect(cierres).toEqual(['cerrado']);
  });
});
