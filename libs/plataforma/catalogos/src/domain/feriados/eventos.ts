import type { DomainEvent } from '@vitrina/plataforma/kernel';
import { EVENTOS_CAT } from '../eventos.js';
import type { Feriado } from './feriado.js';
import type { AlcanceFeriado } from './tipos.js';

export const AGREGADO_FERIADO = 'feriado';
const VERSION_ESQUEMA = 1;

export type AccionFeriado = 'CREADO' | 'MODIFICADO' | 'ELIMINADO';

/** Lo que audita el spec 20. Sin datos personales (TR-RNF-026). */
export interface FeriadoActualizado {
  feriado_id: string;
  accion: AccionFeriado;
  alcance: AlcanceFeriado;
  /** null si es global. */
  tenant_id: string | null;
  sucursal_id: string | null;
  fecha: string;
  nombre: string;
  recurrente_anual: boolean;
  version: number;
  por: string;
}

export interface DatosFeriadoActualizado {
  feriado: Feriado;
  accion: AccionFeriado;
  /** La que quedó tras escribir; al eliminar, la del feriado borrado. */
  version: number;
  por: string;
  ahora: Date;
}

/** Se arma después de escribir, con la versión que quedó: la de un global la sube la función de la base. */
export function eventoFeriadoActualizado(datos: DatosFeriadoActualizado): DomainEvent<FeriadoActualizado> {
  const { feriado } = datos;
  return {
    eventType: EVENTOS_CAT.feriadoActualizado,
    aggregateType: AGREGADO_FERIADO,
    aggregateId: feriado.id,
    aggregateVersion: datos.version,
    schemaVersion: VERSION_ESQUEMA,
    occurredAt: datos.ahora,
    payload: {
      feriado_id: feriado.id,
      accion: datos.accion,
      alcance: feriado.alcance,
      tenant_id: feriado.tenantId,
      sucursal_id: feriado.sucursalId,
      fecha: feriado.fecha,
      nombre: feriado.nombre,
      recurrente_anual: feriado.recurrenteAnual,
      version: datos.version,
      por: datos.por,
    },
  };
}
