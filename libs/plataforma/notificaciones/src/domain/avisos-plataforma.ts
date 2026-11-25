import type { ValoresVariables } from './renderizador-plantilla.js';

/** Plantillas base de los avisos de plataforma (db/01s_not_avisos_plataforma.sql). */
export const CODIGOS_AVISO = {
  suscripcionPorVencer: 'SUSCRIPCION_POR_VENCER',
  tenantSuspendido: 'TENANT_SUSPENDIDO',
  soporteSolicitado: 'SOPORTE_SOLICITADO',
  integridadRota: 'INTEGRIDAD_ROTA',
} as const;

export type CodigoAviso = (typeof CODIGOS_AVISO)[keyof typeof CODIGOS_AVISO];

/** Eventos de ORG, SEG y AUD que NOT convierte en correo (spec 44). */
export const EVENTOS_AVISADOS = {
  suscripcionPorVencer: 'suscripcion.por_vencer',
  tenantSuspendido: 'tenant.suspendido',
  soporteSolicitado: 'soporte.solicitado',
  integridadRota: 'aud.integridad.rota',
} as const;

/** Carga de `suscripcion.por_vencer` (org). `vigente_hasta` es una fecha de calendario `YYYY-MM-DD`. */
export interface CargaSuscripcionPorVencer {
  producto_codigo: string;
  vigente_hasta: string;
  dias_antes: number;
}

/** Carga de `tenant.suspendido` (org). `fecha_efectiva` en ISO 8601 UTC. */
export interface CargaTenantSuspendido {
  estado_anterior: string;
  motivo: string;
  fecha_efectiva: string;
}

/** Carga de `soporte.solicitado` (seguridad). */
export interface CargaSoporteSolicitado {
  ticket: string;
  modo: string;
  horas_solicitadas: number;
}

/** Carga de `aud.integridad.rota` (auditoría): sin datos personales. */
export interface CargaIntegridadRota {
  numero_roto: string;
  motivo: string;
  modo: string;
}

const FECHA_DE_CALENDARIO = /^(\d{4})-(\d{2})-(\d{2})$/;
/** en-GB formatea como dd/mm/aaaa. */
const LOCALE_DIA_MES_ANIO = 'en-GB';

/** `YYYY-MM-DD` → `dd/mm/aaaa`. Una fecha de calendario no tiene zona: no se convierte. */
export function fechaDeCalendarioDiaMesAnio(fecha: string): string {
  const partes = FECHA_DE_CALENDARIO.exec(fecha);
  if (!partes) return fecha;
  const [, anio, mes, dia] = partes;
  return `${dia}/${mes}/${anio}`;
}

/** Un instante ISO 8601 → `dd/mm/aaaa` en la zona dada (America/Lima en los avisos). */
export function instanteDiaMesAnio(instante: string, zonaHoraria: string): string {
  const fecha = new Date(instante);
  if (Number.isNaN(fecha.getTime())) return instante;
  return new Intl.DateTimeFormat(LOCALE_DIA_MES_ANIO, { timeZone: zonaHoraria, year: 'numeric', month: '2-digit', day: '2-digit' }).format(fecha);
}

export function variablesSuscripcionPorVencer(carga: CargaSuscripcionPorVencer, tenant: string): ValoresVariables {
  return { tenant, producto: carga.producto_codigo, vigente_hasta: fechaDeCalendarioDiaMesAnio(carga.vigente_hasta), dias: carga.dias_antes };
}

export function variablesTenantSuspendido(carga: CargaTenantSuspendido, tenant: string, zonaHoraria: string): ValoresVariables {
  return { tenant, motivo: carga.motivo, fecha_efectiva: instanteDiaMesAnio(carga.fecha_efectiva, zonaHoraria) };
}

export function variablesSoporteSolicitado(carga: CargaSoporteSolicitado, tenant: string): ValoresVariables {
  return { tenant, ticket: carga.ticket, modo: carga.modo, horas: carga.horas_solicitadas };
}

export function variablesIntegridadRota(carga: CargaIntegridadRota, tenantId: string): ValoresVariables {
  return { tenant_id: tenantId, numero_roto: carga.numero_roto, motivo: carga.motivo, modo: carga.modo };
}
