export const ESTADO_ACTIVO = 'ACTIVO';
export const CONDICION_HABIDO = 'HABIDO';

/** Lo que el dominio necesita del padrón; `DatosPadron` (puerto de aplicación) lo cumple. */
export interface SituacionContribuyente {
  estado: string;
  condicion: string;
}

const CONSECUENCIA = 'no podrá emitir comprobantes hasta regularizar';

/** TR-RN-019, TR-CA-006: el registro sigue; se advierte que no podrá facturar. */
export function advertenciasDelPadron(padron: SituacionContribuyente | null): string[] {
  if (padron === null) return [];

  const advertencias: string[] = [];
  if (padron.condicion !== CONDICION_HABIDO) advertencias.push(`Contribuyente ${padron.condicion}: ${CONSECUENCIA}`);
  if (padron.estado !== ESTADO_ACTIVO) advertencias.push(`Contribuyente en estado ${padron.estado}: ${CONSECUENCIA}`);
  return advertencias;
}
