import { z } from 'zod';
import { camposEntornoNotificaciones, type EntornoNotificaciones, type NotificacionProgramada, type ReferenciaProgramacion } from '@vitrina/plataforma/notificaciones';
import {
  abrirContextoNotificaciones,
  CODIGO_ERROR,
  CODIGO_OK,
  PLANTILLA_PRUEBA,
  urlDeBaseDatos,
  UUID,
  valorDe,
  VARIABLES_PRUEBA,
  type Salida,
} from './notificaciones.cli.js';

const USO =
  'Uso: notificaciones:programar --tenant <uuid> --referencia <tipo:id> (--correo <dirección> [--en <N>s|m|h|d] | --cancelar) [--remoto]';
/** `--en` por defecto: el humo del spec 45 programa a 2 min. */
const EN_POR_DEFECTO = '2m';
const DURACION = /^(\d+)([smhd])$/;
const MILISEGUNDOS_POR_UNIDAD: Record<string, number> = { s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000 };
const SEPARADOR_REFERENCIA = ':';

export interface Programador {
  programar(tenantId: string, correo: string, referencia: ReferenciaProgramacion, enviarEn: Date): Promise<NotificacionProgramada>;
  cancelar(tenantId: string, referencia: ReferenciaProgramacion): Promise<number>;
  cerrar(): Promise<void>;
}

type Orden = { tipo: 'programar'; correo: string; retardoMs: number } | { tipo: 'cancelar' };

/**
 * `pnpm notificaciones:programar` (spec 45): programa `PRUEBA_CORREO` a un correo directo dentro de `--en` (por
 * defecto 2 min) con la referencia dada, o con `--cancelar` cancela las vivas de la referencia. La misma referencia
 * dos veces reprograma. El envío lo hace el worker a la hora.
 */
export async function ejecutarProgramacionesCli(
  args: readonly string[],
  env: NodeJS.ProcessEnv,
  salida: Salida,
  abrirProgramador: (url: string, entorno: EntornoNotificaciones) => Promise<Programador> = abrirProgramadorNest,
  ahora: () => Date = () => new Date(),
): Promise<number> {
  const tenantId = valorDe(args, '--tenant');
  const referencia = referenciaDe(valorDe(args, '--referencia'));
  const orden = ordenDe(args);
  if (!tenantId || !UUID.test(tenantId) || !referencia || !orden) {
    salida.error(USO);
    return CODIGO_ERROR;
  }
  const url = urlDeBaseDatos(args, env, salida);
  if (!url) return CODIGO_ERROR;

  let programador: Programador | null = null;
  try {
    programador = await abrirProgramador(url, z.object(camposEntornoNotificaciones).parse(env));
    if (orden.tipo === 'cancelar') {
      salida.log(`Canceladas: ${await programador.cancelar(tenantId, referencia)}`);
      return CODIGO_OK;
    }
    const enviarEn = new Date(ahora().getTime() + orden.retardoMs);
    const programada = await programador.programar(tenantId, orden.correo, referencia, enviarEn);
    salida.log(`Programación ${programada.programacionId}: ${programada.enviarEn.toISOString()}${programada.reprogramada ? ' (reprogramada)' : ''}`);
    return CODIGO_OK;
  } catch (error) {
    // Solo el nombre: el mensaje puede traer la URL o el correo (TR-RNF-026).
    salida.error(`Error al programar la notificación: ${(error as Error).name}`);
    return CODIGO_ERROR;
  } finally {
    await programador?.cerrar();
  }
}

function referenciaDe(valor: string | undefined): ReferenciaProgramacion | null {
  if (!valor) return null;
  const posicion = valor.indexOf(SEPARADOR_REFERENCIA);
  if (posicion <= 0) return null;
  return { tipo: valor.slice(0, posicion), id: valor.slice(posicion + 1) };
}

function ordenDe(args: readonly string[]): Orden | null {
  if (args.includes('--cancelar')) return { tipo: 'cancelar' };
  const correo = valorDe(args, '--correo');
  const retardoMs = duracionEnMs(valorDe(args, '--en') ?? EN_POR_DEFECTO);
  if (!correo || retardoMs === null) return null;
  return { tipo: 'programar', correo, retardoMs };
}

function duracionEnMs(valor: string): number | null {
  const partes = DURACION.exec(valor);
  if (!partes) return null;
  const [, cantidad, unidad] = partes;
  return Number(cantidad) * MILISEGUNDOS_POR_UNIDAD[unidad];
}

async function abrirProgramadorNest(url: string, entorno: EntornoNotificaciones): Promise<Programador> {
  const { notificaciones, contexto, cerrar } = await abrirContextoNotificaciones(url, entorno);
  return {
    programar: (tenantId, correo, referencia, enviarEn) =>
      contexto.run({ tenantId }, () =>
        notificaciones.programar({
          plantilla: PLANTILLA_PRUEBA,
          destinatario: { correo },
          variables: VARIABLES_PRUEBA,
          finalidad: 'TRANSACCIONAL',
          enviarEn,
          referencia,
        }),
      ),
    cancelar: (tenantId, referencia) => contexto.run({ tenantId }, () => notificaciones.cancelar(referencia, PLANTILLA_PRUEBA)),
    cerrar,
  };
}
