import type { UsuarioDelEvento } from './evento-seguridad';

export const ESTADOS_SOPORTE = ['PENDIENTE', 'APROBADO', 'RECHAZADO', 'REVOCADO', 'EXPIRADO'] as const;
export type EstadoSoporte = (typeof ESTADOS_SOPORTE)[number];
export type ModoSoporte = 'LECTURA' | 'ESCRITURA';
export type CausaCierreSoporte = 'RECHAZO' | 'ADMINISTRADOR' | 'TICKET_CERRADO' | 'VENCIMIENTO';

/** Pestañas de la bandeja (spec 18): cada una pide sus estados a la API. */
export const VISTAS_SOPORTE = ['pendientes', 'vigentes', 'historial'] as const;
export type VistaSoporte = (typeof VISTAS_SOPORTE)[number];
export const ESTADOS_DE_VISTA: Readonly<Record<VistaSoporte, readonly EstadoSoporte[]>> = {
  pendientes: ['PENDIENTE'],
  vigentes: ['APROBADO'],
  historial: ['RECHAZADO', 'REVOCADO', 'EXPIRADO'],
};

/** 1 a 4 horas (TR-RN-011); la API rechaza más con «La vigencia máxima es 4 horas» (TR-CA-054). */
export const HORAS_SOPORTE = [1, 2, 3, 4] as const;

export interface FiltroSolicitudesSoporte {
  vista: VistaSoporte;
  pagina: number;
  tamano: number;
}

export interface SolicitudSoporteRespuesta {
  id: string;
  agente: UsuarioDelEvento;
  ticket: string;
  motivo: string;
  modo: ModoSoporte;
  horas_solicitadas: number;
  estado: EstadoSoporte;
  solicitado_en: string;
  caduca_en: string;
  horas_aprobadas: number | null;
  desde: string | null;
  hasta: string | null;
  aprobado_por: UsuarioDelEvento | null;
  cerrado_por: UsuarioDelEvento | null;
  cerrado_en: string | null;
  motivo_cierre: string | null;
  causa_cierre: CausaCierreSoporte | null;
}

export interface SolicitudSoporte {
  id: string;
  agente: UsuarioDelEvento;
  ticket: string;
  motivo: string;
  modo: ModoSoporte;
  horasSolicitadas: number;
  horasAprobadas: number | null;
  estado: EstadoSoporte;
  solicitadoEn: Date;
  hasta: Date | null;
  cerradoPor: UsuarioDelEvento | null;
  cerradoEn: Date | null;
  motivoCierre: string | null;
  causaCierre: CausaCierreSoporte | null;
}

/** Lo que manda el formulario de aprobar: un rol o un perfil, no ambos. */
export interface AprobacionSoporte {
  horas: number;
  rolId: string | null;
  perfilId: string | null;
}

export interface AccesoAprobado {
  desde: Date;
  hasta: Date;
}

function fechaOpcional(valor: string | null): Date | null {
  return valor ? new Date(valor) : null;
}

export function aSolicitudSoporte(respuesta: SolicitudSoporteRespuesta): SolicitudSoporte {
  return {
    id: respuesta.id,
    agente: respuesta.agente,
    ticket: respuesta.ticket,
    motivo: respuesta.motivo,
    modo: respuesta.modo,
    horasSolicitadas: respuesta.horas_solicitadas,
    horasAprobadas: respuesta.horas_aprobadas,
    estado: respuesta.estado,
    solicitadoEn: new Date(respuesta.solicitado_en),
    hasta: fechaOpcional(respuesta.hasta),
    cerradoPor: respuesta.cerrado_por,
    cerradoEn: fechaOpcional(respuesta.cerrado_en),
    motivoCierre: respuesta.motivo_cierre,
    causaCierre: respuesta.causa_cierre,
  };
}
