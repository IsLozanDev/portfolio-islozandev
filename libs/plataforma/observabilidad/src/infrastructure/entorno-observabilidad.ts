import { esquemaAmbiente } from '@vitrina/plataforma/observabilidad-arranque';
import { z } from 'zod';

const AMBIENTES_CON_SECRETOS = ['staging', 'production'];
const LARGO_MINIMO_SAL = 32;
// Solo local y pruebas: ahí los logs no salen de la máquina.
const SAL_LOCAL = 'sal-local-no-secreta-solo-desarrollo';

/** Variables de observabilidad que valida cada app con zod; las `OTEL_*` las lee el SDK. */
export const camposEntornoObservabilidad = {
  APP_ENV: esquemaAmbiente,
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  // TR-RNF-111: sal del hash de documentos en logs.
  OBS_SAL_DOCUMENTO: z.string().min(LARGO_MINIMO_SAL).optional(),
};

type EntornoObservabilidad = z.infer<z.ZodObject<typeof camposEntornoObservabilidad>>;

/** Para `superRefine` del esquema de la app: fuera de local la sal es obligatoria. */
export function exigirSalFueraDeLocal(entorno: EntornoObservabilidad, contexto: z.RefinementCtx): void {
  if (!AMBIENTES_CON_SECRETOS.includes(entorno.APP_ENV) || entorno.OBS_SAL_DOCUMENTO) return;
  contexto.addIssue({ code: 'custom', path: ['OBS_SAL_DOCUMENTO'], message: 'obligatoria fuera de local' });
}

export function salDocumento(entorno: EntornoObservabilidad): string {
  return entorno.OBS_SAL_DOCUMENTO ?? SAL_LOCAL;
}
