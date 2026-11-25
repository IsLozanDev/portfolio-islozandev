import type { NotificacionProgramada, ReferenciaProgramacion } from '@vitrina/plataforma/notificaciones';
import { ejecutarProgramacionesCli, type Programador } from '../src/cli/programaciones.cli.js';

const ENV_MINIMO = { DATABASE_URL: 'postgres://postgres:clave-secreta@localhost:5432/vitrina' };
const TENANT = '45000000-0000-7000-8000-00000000000a';
const AHORA = new Date('2026-11-24T15:00:00.000Z');

function salidaEnMemoria() {
  const lineas: string[] = [];
  return { lineas, log: (mensaje: string) => lineas.push(mensaje), error: (mensaje: string) => lineas.push(`ERROR ${mensaje}`) };
}

function programadorFalso(reprogramada = false) {
  const llamadas: { accion: string; tenantId: string; referencia: ReferenciaProgramacion; correo?: string; enviarEn?: Date }[] = [];
  const programador: Programador & { cerrado: boolean } = {
    cerrado: false,
    programar: async (tenantId, correo, referencia, enviarEn): Promise<NotificacionProgramada> => {
      llamadas.push({ accion: 'programar', tenantId, correo, referencia, enviarEn });
      return { programacionId: 'p-1', enviarEn, reprogramada };
    },
    cancelar: async (tenantId, referencia) => {
      llamadas.push({ accion: 'cancelar', tenantId, referencia });
      return 1;
    },
    cerrar: async () => {
      programador.cerrado = true;
    },
  };
  return { programador, llamadas };
}

describe('CLI notificaciones:programar (spec 45)', () => {
  const ejecutarCon = (args: string[], programador: Programador, salida = salidaEnMemoria()) =>
    ejecutarProgramacionesCli(args, ENV_MINIMO, salida, async () => programador, () => AHORA);

  it('exige --tenant con UUID, --referencia tipo:id y --correo o --cancelar, y un --en válido', async () => {
    const salida = salidaEnMemoria();
    const { programador } = programadorFalso();

    expect(await ejecutarCon(['--tenant', 'x', '--referencia', 'cita:1', '--correo', 'a@b.pe'], programador, salida)).toBe(1);
    expect(await ejecutarCon(['--tenant', TENANT, '--referencia', 'sin-separador', '--correo', 'a@b.pe'], programador, salida)).toBe(1);
    expect(await ejecutarCon(['--tenant', TENANT, '--referencia', 'cita:1'], programador, salida)).toBe(1);
    expect(await ejecutarCon(['--tenant', TENANT, '--referencia', 'cita:1', '--correo', 'a@b.pe', '--en', '2 minutos'], programador, salida)).toBe(1);
    expect(salida.lineas.every((linea) => linea.startsWith('ERROR Uso:'))).toBe(true);
  });

  it('programa PRUEBA_CORREO a 2 min por defecto e imprime el id y la hora', async () => {
    const salida = salidaEnMemoria();
    const { programador, llamadas } = programadorFalso();

    expect(await ejecutarCon(['--tenant', TENANT, '--referencia', 'humo.cita:c-1', '--correo', 'a@b.pe'], programador, salida)).toBe(0);

    expect(llamadas).toEqual([
      { accion: 'programar', tenantId: TENANT, correo: 'a@b.pe', referencia: { tipo: 'humo.cita', id: 'c-1' }, enviarEn: new Date('2026-11-24T15:02:00.000Z') },
    ]);
    expect(salida.lineas).toEqual(['Destino: localhost:5432/vitrina', 'Programación p-1: 2026-11-24T15:02:00.000Z']);
    expect(programador.cerrado).toBe(true);
  });

  it('--en acepta segundos, minutos, horas y días; avisa si fue una reprogramación', async () => {
    const salida = salidaEnMemoria();
    const { programador, llamadas } = programadorFalso(true);

    await ejecutarCon(['--tenant', TENANT, '--referencia', 'cita:1', '--correo', 'a@b.pe', '--en', '90s'], programador, salida);
    await ejecutarCon(['--tenant', TENANT, '--referencia', 'cita:1', '--correo', 'a@b.pe', '--en', '1d'], programador, salida);

    expect(llamadas.map((llamada) => llamada.enviarEn)).toEqual([new Date('2026-11-24T15:01:30.000Z'), new Date('2026-11-25T15:00:00.000Z')]);
    expect(salida.lineas[1]).toBe('Programación p-1: 2026-11-24T15:01:30.000Z (reprogramada)');
  });

  it('--cancelar cancela las vivas de la referencia e imprime cuántas', async () => {
    const salida = salidaEnMemoria();
    const { programador, llamadas } = programadorFalso();

    expect(await ejecutarCon(['--tenant', TENANT, '--referencia', 'cita:1', '--cancelar'], programador, salida)).toBe(0);

    expect(llamadas).toEqual([{ accion: 'cancelar', tenantId: TENANT, referencia: { tipo: 'cita', id: '1' } }]);
    expect(salida.lineas).toEqual(['Destino: localhost:5432/vitrina', 'Canceladas: 1']);
  });

  it('un error imprime solo su nombre, sin el correo, y devuelve 1', async () => {
    const salida = salidaEnMemoria();
    const { programador } = programadorFalso();
    programador.programar = () => Promise.reject(Object.assign(new Error('a@b.pe no válido'), { name: 'FechaEnvioNoFuturaError' }));

    expect(await ejecutarCon(['--tenant', TENANT, '--referencia', 'cita:1', '--correo', 'a@b.pe'], programador, salida)).toBe(1);

    expect(salida.lineas[1]).toBe('ERROR Error al programar la notificación: FechaEnvioNoFuturaError');
    expect(programador.cerrado).toBe(true);
  });
});
