// Mismos valores que el CHECK de idn.consulta_log.motivo.
export const MOTIVOS_CONSULTA = ['REGISTRO_CLIENTE', 'EMISION_COMPROBANTE', 'VERIFICACION_IDENTIDAD', 'OTRO'] as const;

export type MotivoConsulta = (typeof MOTIVOS_CONSULTA)[number];

export function esMotivoConsulta(valor: string): valor is MotivoConsulta {
  return (MOTIVOS_CONSULTA as readonly string[]).includes(valor);
}
