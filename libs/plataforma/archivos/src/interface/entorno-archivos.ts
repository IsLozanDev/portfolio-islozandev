import { z } from 'zod';

export const MOTORES_ANTIVIRUS = ['eicar', 'clamav'] as const;
export type MotorAntivirus = (typeof MOTORES_ANTIVIRUS)[number];

/** El antivirus con el que el worker analiza los archivos. `eicar` solo detecta la cadena de prueba. */
export type OpcionesAntivirus =
  | { motor: 'eicar' }
  | { motor: 'clamav'; host: string; puerto: number; tiempoConexionMs: number; tiempoRespuestaMs: number };

const AMBIENTE_PRODUCCION = 'production';
const PUERTO_CLAMD = 3310;
const ESPERA_RESPUESTA_MS = 60_000;
const ESPERA_CONEXION_MS = 5_000;

const entero = (defecto: number) => z.coerce.number().int().positive().default(defecto);

/** Variables del antivirus que valida apps/worker con zod. La API no habla con clamd. */
export const camposEntornoAntivirus = {
  ARC_ANTIVIRUS: z.enum(MOTORES_ANTIVIRUS).default('eicar'),
  CLAMAV_HOST: z.string().trim().min(1).optional(),
  CLAMAV_PORT: entero(PUERTO_CLAMD),
  // Espera de la respuesta de clamd y de la conexión TCP.
  CLAMAV_TIMEOUT_MS: entero(ESPERA_RESPUESTA_MS),
  CLAMAV_CONEXION_TIMEOUT_MS: entero(ESPERA_CONEXION_MS),
};

type EntornoAntivirus = z.infer<z.ZodObject<typeof camposEntornoAntivirus>>;

/**
 * Para `superRefine` del esquema de la app. En producción `eicar` no se admite (TR-RNF-114); con `clamav` el
 * host es obligatorio en cualquier ambiente. En local, test y staging se admite `eicar`.
 */
export function exigirAntivirusReal(entorno: EntornoAntivirus & { APP_ENV: string }, contexto: z.RefinementCtx): void {
  if (entorno.APP_ENV === AMBIENTE_PRODUCCION && entorno.ARC_ANTIVIRUS !== 'clamav') {
    contexto.addIssue({ code: 'custom', path: ['ARC_ANTIVIRUS'], message: 'en producción debe ser clamav' });
  }
  if (entorno.ARC_ANTIVIRUS === 'clamav' && !entorno.CLAMAV_HOST) {
    contexto.addIssue({ code: 'custom', path: ['CLAMAV_HOST'], message: 'obligatorio con clamav' });
  }
}

/** Las opciones del antivirus para `ArchivosModule.registrarWorker`, a partir de un entorno ya validado. */
export function opcionesAntivirusDe(entorno: EntornoAntivirus): OpcionesAntivirus {
  if (entorno.ARC_ANTIVIRUS === 'eicar') return { motor: 'eicar' };
  if (!entorno.CLAMAV_HOST) throw new Error('CLAMAV_HOST es obligatorio con clamav');
  return {
    motor: 'clamav',
    host: entorno.CLAMAV_HOST,
    puerto: entorno.CLAMAV_PORT,
    tiempoConexionMs: entorno.CLAMAV_CONEXION_TIMEOUT_MS,
    tiempoRespuestaMs: entorno.CLAMAV_TIMEOUT_MS,
  };
}
