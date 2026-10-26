import type { FechaCalendario } from './fecha-calendario.js';

/** Días antes de `vigente_hasta` en que se avisa al propietario (TR-RF-007). */
export const DIAS_AVISO = [7, 3, 1] as const;
export type DiasAviso = (typeof DIAS_AVISO)[number];

export function esDiaDeAviso(dias: number | null): dias is DiasAviso {
  return DIAS_AVISO.includes(dias as DiasAviso);
}

/** Registro de un aviso ya publicado; su clave única evita repetirlo el mismo día (TR-CA-021). */
export interface AvisoVencimiento {
  id: string;
  tenantId: string;
  suscripcionId: string;
  diasAntes: DiasAviso;
  vigenteHasta: FechaCalendario;
  fechaEjecucion: FechaCalendario;
}
