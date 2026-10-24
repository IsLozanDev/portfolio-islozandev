import type { AlcanceParametro } from './tipos.js';

/** Eventos de cfg en el outbox, en schema_version 1. */
export const EVENTOS_CFG = {
  parametroCambiado: 'parametro.cambiado',
} as const;

/** También es el rastro de auditoría hasta TR-AUD (spec 20). `valor` es null al restablecer. */
export interface ParametroCambiado {
  codigo: string;
  alcance: AlcanceParametro;
  empresa_id: string | null;
  sucursal_id: string | null;
  valor_anterior: unknown;
  valor: unknown;
  restablecido: boolean;
  por: string;
}
