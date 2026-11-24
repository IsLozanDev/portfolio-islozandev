import { z } from 'zod';
import type { ReglasEntornoFe } from '../application/dependencias-fe.js';

const VERDADERO = 'true';
const FALSO = 'false';

// `VARIABLE=` en un .env llega como texto vacío: cuenta como no configurada y vale `false`.
const bandera = z.preprocess((valor) => (valor === '' ? undefined : valor), z.enum([VERDADERO, FALSO]).default(FALSO));

/**
 * Variables de TR-FE que validan apps/api y apps/worker con zod (spec 50). Por defecto `false`: dev y CI activan el
 * simulador; solo producción permite pasar emisores a producción. Ver docs/ops/supabase-ambientes.md.
 */
export const camposEntornoFe = {
  FE_PRODUCCION_PERMITIDA: bandera,
  FE_SIMULADO_PERMITIDO: bandera,
};

export type EntornoFe = z.infer<z.ZodObject<typeof camposEntornoFe>>;

export function reglasEntornoFe(entorno: EntornoFe): ReglasEntornoFe {
  return { produccionPermitida: entorno.FE_PRODUCCION_PERMITIDA === VERDADERO, simuladoPermitido: entorno.FE_SIMULADO_PERMITIDO === VERDADERO };
}
