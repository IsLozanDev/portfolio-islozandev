import { ejecutarNotificacionesCli, type Probador } from '../src/cli/notificaciones.cli.js';
import { cargarConfig } from '../src/config/env.js';
import { intentoDe } from '../src/notificaciones/tarea-envios.js';

const ENV_MINIMO = {
  DATABASE_URL: 'postgres://postgres:clave-secreta@localhost:5432/vitrina',
  REDIS_URL: 'redis://localhost:6379',
  SUPABASE_URL: 'https://prueba.supabase.co',
  SUPABASE_SECRET_KEY: 'sb_secret_prueba',
};
const TENANT = '42000000-0000-7000-8000-00000000000a';
const ESPERA_CORTA = { esperaMaximaMs: 50, cadaMs: 5 };

function salidaEnMemoria() {
  const lineas: string[] = [];
  return { lineas, log: (mensaje: string) => lineas.push(mensaje), error: (mensaje: string) => lineas.push(`ERROR ${mensaje}`) };
}

function probadorCon(estados: (string | null)[]): Probador & { cerrado: boolean; enviados: { tenantId: string; correo: string }[] } {
  const probador = {
    cerrado: false,
    enviados: [] as { tenantId: string; correo: string }[],
    enviar: async (tenantId: string, correo: string) => {
      probador.enviados.push({ tenantId, correo });
      return { mensajeId: 'm-1', estado: 'ENCOLADO' };
    },
    estado: async () => (estados.length > 1 ? (estados.shift() ?? null) : (estados[0] ?? null)),
    cerrar: async () => {
      probador.cerrado = true;
    },
  };
  return probador;
}

describe('notificaciones en el worker (spec 42)', () => {
  it('el intento en curso es attemptsMade + 1 y el último es el de attempts', () => {
    expect(intentoDe({ attemptsMade: 0, opts: { attempts: 3 } })).toEqual({ numero: 1, esUltimo: false });
    expect(intentoDe({ attemptsMade: 2, opts: { attempts: 3 } })).toEqual({ numero: 3, esUltimo: true });
    expect(intentoDe({ attemptsMade: 0, opts: {} })).toEqual({ numero: 1, esUltimo: true });
  });

  it('en production sin las variables de Resend el worker no arranca; en development sí', () => {
    const produccion = { ...ENV_MINIMO, APP_ENV: 'production', OBS_SAL_DOCUMENTO: 's'.repeat(32), SEC_CLAVES_MAESTRAS: `1:${Buffer.alloc(32).toString('base64')}`, SEC_CLAVE_ACTIVA: '1', ARC_ANTIVIRUS: 'clamav' };

    expect(() => cargarConfig(produccion)).toThrow(/RESEND_API_KEY.*RESEND_WEBHOOK_SECRET.*NOT_REMITENTE.*NOT_SAL_DESTINO/);
    expect(cargarConfig(ENV_MINIMO).RESEND_API_KEY).toBeUndefined();
  });

  describe('CLI notificaciones:probar', () => {
    it('exige --tenant con UUID y --correo', async () => {
      const salida = salidaEnMemoria();

      expect(await ejecutarNotificacionesCli(['--tenant', 'x', '--correo', 'a@b.pe'], ENV_MINIMO, salida)).toBe(1);
      expect(await ejecutarNotificacionesCli(['--tenant', TENANT], ENV_MINIMO, salida)).toBe(1);
      expect(salida.lineas.every((linea) => linea.startsWith('ERROR Uso:'))).toBe(true);
    });

    it('con --remoto exige DATABASE_MIGRATION_URL', async () => {
      const salida = salidaEnMemoria();

      expect(await ejecutarNotificacionesCli(['--tenant', TENANT, '--correo', 'a@b.pe', '--remoto'], ENV_MINIMO, salida)).toBe(1);
      expect(salida.lineas).toEqual(['ERROR Falta DATABASE_MIGRATION_URL. Copia .env.example a .env.']);
    });

    it('envía, espera el estado final y devuelve 0 si quedó ENVIADO; imprime el destino sin la clave', async () => {
      const salida = salidaEnMemoria();
      const probador = probadorCon(['ENCOLADO', 'ENVIADO']);

      const codigo = await ejecutarNotificacionesCli(['--tenant', TENANT, '--correo', 'a@b.pe'], ENV_MINIMO, salida, async () => probador, ESPERA_CORTA);

      expect(codigo).toBe(0);
      expect(probador.enviados).toEqual([{ tenantId: TENANT, correo: 'a@b.pe' }]);
      expect(salida.lineas).toEqual(['Destino: localhost:5432/vitrina', 'Mensaje m-1: ENCOLADO', 'Estado tras la espera: ENVIADO']);
      expect(probador.cerrado).toBe(true);
    });

    it('devuelve 1 si al vencer la espera sigue ENCOLADO o quedó FALLIDO', async () => {
      expect(await ejecutarNotificacionesCli(['--tenant', TENANT, '--correo', 'a@b.pe'], ENV_MINIMO, salidaEnMemoria(), async () => probadorCon(['ENCOLADO']), ESPERA_CORTA)).toBe(1);
      expect(await ejecutarNotificacionesCli(['--tenant', TENANT, '--correo', 'a@b.pe'], ENV_MINIMO, salidaEnMemoria(), async () => probadorCon(['FALLIDO']), ESPERA_CORTA)).toBe(1);
    });
  });
});
