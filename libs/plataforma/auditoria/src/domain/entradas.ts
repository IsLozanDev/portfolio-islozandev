import { AccionInvalidaError, LongitudExcedidaError, TicketRequeridoError } from './errores.js';

export const TIPOS_RECURSO_SENSIBLE = ['HISTORIA_CLINICA', 'NOTA_SESION', 'EXPEDIENTE', 'DATOS_PORTABLES'] as const;
export type TipoRecursoSensible = (typeof TIPOS_RECURSO_SENSIBLE)[number];

export const FINALIDADES = ['ATENCION', 'AUDITORIA_MEDICA', 'SOPORTE', 'OTRO'] as const;
export type Finalidad = (typeof FINALIDADES)[number];

export interface EntradaAuditoria {
  /** Formato producto.recurso.accion, p. ej. rest.venta.anular. */
  accion: string;
  entidadTipo: string;
  entidadId: string;
  antes?: unknown;
  despues?: unknown;
  motivo?: string;
  /** Claves que se enmascaran además de CAMPOS_ENMASCARADOS. */
  enmascarar?: readonly string[];
}

export interface EntradaAccesoSensible {
  recursoTipo: TipoRecursoSensible;
  recursoId: string;
  personaTitularId: string;
  finalidad: Finalidad;
  /** Obligatorio con finalidad SOPORTE (TR-RN-011). */
  ticket?: string;
}

export const ACCION_ACCESO_SENSIBLE = 'aud.dato_sensible.acceder';

/** El mismo formato que el CHECK de aud.evento_auditoria.accion. */
const FORMATO_ACCION = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*){1,3}$/;
export const LONGITUD_MAXIMA_MOTIVO = 500;
export const LONGITUD_MAXIMA_ENTIDAD_ID = 80;
export const LONGITUD_MAXIMA_TICKET = 40;
const FINALIDAD_CON_TICKET: Finalidad = 'SOPORTE';

export function validarEntradaAuditoria(entrada: EntradaAuditoria): void {
  if (!FORMATO_ACCION.test(entrada.accion)) throw new AccionInvalidaError(entrada.accion);
  exigirLongitud('entidadId', entrada.entidadId, LONGITUD_MAXIMA_ENTIDAD_ID);
  exigirLongitud('motivo', entrada.motivo, LONGITUD_MAXIMA_MOTIVO);
}

export function validarEntradaAccesoSensible(entrada: EntradaAccesoSensible): void {
  exigirLongitud('recursoId', entrada.recursoId, LONGITUD_MAXIMA_ENTIDAD_ID);
  exigirLongitud('ticket', entrada.ticket, LONGITUD_MAXIMA_TICKET);
  if (entrada.finalidad === FINALIDAD_CON_TICKET && !entrada.ticket?.trim()) throw new TicketRequeridoError();
}

function exigirLongitud(campo: string, valor: string | undefined, maximo: number): void {
  if (valor !== undefined && valor.length > maximo) throw new LongitudExcedidaError(campo, maximo);
}
