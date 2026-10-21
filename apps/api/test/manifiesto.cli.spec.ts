import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { aplicarManifiestoCli } from '../src/cli/manifiesto.cli.js';

// La conexión se abre después de validar: estos casos no necesitan base y la URL no se usa.
const ENV = { DATABASE_URL: 'postgres://nadie:nada@127.0.0.1:1/ninguna' };

describe('CLI manifiesto:aplicar', () => {
  let dir: string;
  const salida = () => {
    const s = { logs: [] as string[], errores: [] as string[], log: (m: string) => s.logs.push(m), error: (m: string) => s.errores.push(m) };
    return s;
  };
  const archivo = async (nombre: string, contenido: string) => {
    const ruta = join(dir, nombre);
    await writeFile(ruta, contenido);
    return ruta;
  };

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'manifiesto-'));
  });

  it('sin archivo muestra el uso y sale con 1', async () => {
    const s = salida();
    expect(await aplicarManifiestoCli([], ENV, s)).toBe(1);
    expect(s.errores).toEqual(['Uso: manifiesto:aplicar <archivo.json> [--remoto]']);
  });

  it('sin --remoto usa DATABASE_URL aunque exista DATABASE_MIGRATION_URL', async () => {
    const s = salida();
    expect(await aplicarManifiestoCli(['m.json'], { DATABASE_MIGRATION_URL: 'postgres://x@remoto/db' }, s)).toBe(1);
    expect(s.errores).toEqual(['Falta DATABASE_URL. Copia .env.example a .env.']);
  });

  it('con --remoto exige DATABASE_MIGRATION_URL e imprime el destino', async () => {
    const s = salida();
    expect(await aplicarManifiestoCli(['m.json', '--remoto'], ENV, s)).toBe(1);
    expect(s.errores).toEqual(['Falta DATABASE_MIGRATION_URL. Copia .env.example a .env.']);

    const r = salida();
    const env = { DATABASE_MIGRATION_URL: 'postgres://nadie:nada@pooler.ejemplo.com:5432/postgres' };
    expect(await aplicarManifiestoCli([await archivo('vacio.json', '{}'), '--remoto'], env, r)).toBe(1);
    expect(r.logs).toEqual(['Destino remoto: pooler.ejemplo.com:5432/postgres']);
    expect(r.logs.join()).not.toContain('nada');
  });

  it('un JSON roto sale con 1', async () => {
    const s = salida();
    expect(await aplicarManifiestoCli([await archivo('roto.json', '{ no es json')], ENV, s)).toBe(1);
    expect(s.errores[0]).toMatch(/^No se pudo leer/);
  });

  it('TR-CA-024: un permiso mal formado sale con 1, lo nombra y no se conecta a la base', async () => {
    const manifiesto = {
      producto_codigo: 'REST',
      nombre: 'Restaurantes',
      version: '1.5.0',
      modulos: [],
      opciones: [],
      permisos: [{ codigo: 'rest-caja-cerrar', descripcion: 'Mal', alcance_minimo: 'SUCURSAL' }],
      roles_predefinidos: [],
    };
    const s = salida();
    expect(await aplicarManifiestoCli([await archivo('malo.json', JSON.stringify(manifiesto))], ENV, s)).toBe(1);
    expect(s.errores).toEqual(['MANIFIESTO_INVALIDO: Manifiesto inválido: permisos[0].codigo: rest-caja-cerrar']);
    expect(s.logs).toEqual([]);
  });
});
