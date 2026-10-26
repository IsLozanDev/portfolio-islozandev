import { ConflictError } from '@vitrina/plataforma/kernel';
import { sembrarPlataformaCli, type EntornoSiembra, type Sembrador } from '../src/cli/plataforma.cli.js';
import type { ResultadoSiembra, SembrarPlataformaComando } from '../src/org/sembrar-plataforma.js';

const ENV = {
  DATABASE_URL: 'postgres://nadie:clave-local@127.0.0.1:5432/vitrina',
  SUPABASE_URL: 'https://proyecto-prueba.supabase.co',
  SUPABASE_SECRET_KEY: 'sb_secret_prueba',
  SEG_URL_INVITACION: 'https://app.vitrina.pe/auth/invitacion',
  ORG_OPERADOR_RUC: '20601234565',
};
const TENANT = '0193f3a0-0000-7000-8000-0000000000aa';

describe('CLI plataforma:sembrar', () => {
  let comandos: SembrarPlataformaComando[];
  let entornos: EntornoSiembra[];
  let cerrados: number;
  let resultado: ResultadoSiembra | Error;
  const salida = () => {
    const s = { logs: [] as string[], errores: [] as string[], log: (m: string) => s.logs.push(m), error: (m: string) => s.errores.push(m) };
    return s;
  };
  const abrir = async (entorno: EntornoSiembra): Promise<Sembrador> => {
    entornos.push(entorno);
    return {
      ejecutar: async (comando) => {
        comandos.push(comando);
        if (resultado instanceof Error) throw resultado;
        return resultado;
      },
      cerrar: async () => {
        cerrados += 1;
      },
    };
  };

  beforeEach(() => {
    comandos = [];
    entornos = [];
    cerrados = 0;
    resultado = { sinCambios: false, tenantId: TENANT, tenantCreado: true, membresiaId: 'm-1', usuarioNuevo: true, correoEnviado: true };
  });

  it('sin correo muestra el uso, sale con 1 y no abre conexión', async () => {
    const s = salida();
    expect(await sembrarPlataformaCli(['--remoto'], ENV, s, abrir)).toBe(1);
    expect(s.errores).toEqual(['Uso: plataforma:sembrar <correo> [--nombre <nombre>] [--remoto]']);
    expect(entornos).toEqual([]);
  });

  it('con --remoto exige DATABASE_MIGRATION_URL', async () => {
    const s = salida();
    expect(await sembrarPlataformaCli(['ana@vitrina.pe', '--remoto'], ENV, s, abrir)).toBe(1);
    expect(s.errores).toEqual(['Falta DATABASE_MIGRATION_URL. Copia .env.example a .env.']);
  });

  it('un RUC del operador inválido o sin secret key sale con 1, nombra la variable y no repite su valor', async () => {
    const s = salida();
    const { SUPABASE_SECRET_KEY: _clave, ...sinClave } = ENV;
    expect(await sembrarPlataformaCli(['ana@vitrina.pe'], { ...sinClave, ORG_OPERADOR_RUC: '20601234560' }, s, abrir)).toBe(1);
    expect(s.errores).toEqual(['Variables de entorno inválidas: SUPABASE_SECRET_KEY, ORG_OPERADOR_RUC']);
    expect(entornos).toEqual([]);
  });

  it('siembra con el nombre dado, imprime el destino sin la clave y el resumen sin el correo', async () => {
    const s = salida();

    expect(await sembrarPlataformaCli(['ana@vitrina.pe', '--nombre', 'Ana Torres'], ENV, s, abrir)).toBe(0);

    expect(comandos).toEqual([{ correo: 'ana@vitrina.pe', nombre: 'Ana Torres' }]);
    expect(entornos[0]).toMatchObject({ url: ENV.DATABASE_URL, ORG_TENANT_OPERADOR: 'plataforma', ORG_OPERADOR_RUC: '20601234565', SEG_INVITACION_HORAS: 72 });
    expect(s.logs).toEqual([
      'Destino: 127.0.0.1:5432/vitrina',
      JSON.stringify({ sin_cambios: false, tenant_id: TENANT, tenant_creado: true, membresia_id: 'm-1', usuario_nuevo: true, correo_enviado: true }),
    ]);
    expect(s.logs.join()).not.toMatch(/clave-local|ana@vitrina/);
    expect(cerrados).toBe(1);
  });

  it('sin --nombre usa «Administrador de plataforma»; con --remoto toma DATABASE_MIGRATION_URL', async () => {
    const s = salida();
    const env = { ...ENV, DATABASE_MIGRATION_URL: 'postgres://dueno:secreto@pooler.ejemplo.com:5432/postgres' };

    expect(await sembrarPlataformaCli(['--remoto', 'ana@vitrina.pe'], env, s, abrir)).toBe(0);

    expect(comandos).toEqual([{ correo: 'ana@vitrina.pe', nombre: 'Administrador de plataforma' }]);
    expect(entornos[0].url).toBe(env.DATABASE_MIGRATION_URL);
    expect(s.logs[0]).toBe('Destino: pooler.ejemplo.com:5432/postgres');
  });

  it('sin cambios sale con 0 e informa el tenant', async () => {
    const s = salida();
    resultado = { sinCambios: true, tenantId: TENANT };
    expect(await sembrarPlataformaCli(['ana@vitrina.pe'], ENV, s, abrir)).toBe(0);
    expect(s.logs[1]).toBe(JSON.stringify({ sin_cambios: true, tenant_id: TENANT }));
  });

  it('un error de dominio sale con 1, muestra código y mensaje, y cierra la conexión', async () => {
    const s = salida();
    resultado = new ConflictError('El rol PLAT_PROPIETARIO no existe; aplique el manifiesto PLAT');
    expect(await sembrarPlataformaCli(['ana@vitrina.pe'], ENV, s, abrir)).toBe(1);
    expect(s.errores).toEqual(['conflict: El rol PLAT_PROPIETARIO no existe; aplique el manifiesto PLAT']);
    expect(cerrados).toBe(1);
  });
});
