import type { Alcance } from './asignacion';

export const ESTADOS_MEMBRESIA = ['INVITADO', 'ACTIVO', 'SUSPENDIDO', 'FINALIZADO'] as const;
export type EstadoMembresia = (typeof ESTADOS_MEMBRESIA)[number];
export type OrdenMiembros = 'nombre' | 'correo' | 'estado';
export type DireccionOrden = 'asc' | 'desc';
export type EstadoAsignacion = 'VIGENTE' | 'FUTURA' | 'VENCIDA' | 'REVOCADA';

export interface FiltroMiembros {
  estado?: EstadoMembresia;
  busqueda?: string;
  orden: OrdenMiembros;
  direccion: DireccionOrden;
  /** Empieza en 1, como la API. */
  pagina: number;
  tamano: number;
}

/** Respuestas tal cual de `/v1/seg/miembros` (spec 16a). */
export interface MiembroRespuesta {
  membresia_id: string;
  usuario_id: string;
  nombre: string;
  correo: string;
  estado: EstadoMembresia;
  es_propietario: boolean;
  asignaciones_vigentes: number;
  invitacion_expira_en: string | null;
}

export interface Referencia {
  id: string;
  nombre: string;
}

export interface AsignacionDelMiembroRespuesta {
  id: string;
  rol: Referencia | null;
  perfil: Referencia | null;
  alcance: Alcance;
  empresa: Referencia | null;
  sucursal: Referencia | null;
  unidad: Referencia | null;
  vigente_desde: string;
  vigente_hasta: string | null;
  estado: EstadoAsignacion;
  revocada_en: string | null;
  motivo_revocacion: string | null;
}

export interface MiembroDetalleRespuesta extends MiembroRespuesta {
  desde: string;
  hasta: string | null;
  asignaciones: AsignacionDelMiembroRespuesta[];
}

export interface Miembro {
  membresiaId: string;
  usuarioId: string;
  nombre: string;
  correo: string;
  estado: EstadoMembresia;
  esPropietario: boolean;
  asignacionesVigentes: number;
  invitacionExpiraEn: Date | null;
}

export interface AsignacionDelMiembro {
  id: string;
  rol: Referencia | null;
  perfil: Referencia | null;
  alcance: Alcance;
  empresa: Referencia | null;
  sucursal: Referencia | null;
  unidad: Referencia | null;
  /** Fecha calendario `YYYY-MM-DD`. */
  vigenteDesde: string;
  vigenteHasta: string | null;
  estado: EstadoAsignacion;
  revocadaEn: Date | null;
  motivoRevocacion: string | null;
}

export interface MiembroDetalle extends Miembro {
  desde: Date;
  hasta: Date | null;
  asignaciones: AsignacionDelMiembro[];
}

const aFecha = (valor: string | null): Date | null => (valor === null ? null : new Date(valor));

export function aMiembro(respuesta: MiembroRespuesta): Miembro {
  return {
    membresiaId: respuesta.membresia_id,
    usuarioId: respuesta.usuario_id,
    nombre: respuesta.nombre,
    correo: respuesta.correo,
    estado: respuesta.estado,
    esPropietario: respuesta.es_propietario,
    asignacionesVigentes: respuesta.asignaciones_vigentes,
    invitacionExpiraEn: aFecha(respuesta.invitacion_expira_en),
  };
}

function aAsignacionDelMiembro(respuesta: AsignacionDelMiembroRespuesta): AsignacionDelMiembro {
  return {
    id: respuesta.id,
    rol: respuesta.rol,
    perfil: respuesta.perfil,
    alcance: respuesta.alcance,
    empresa: respuesta.empresa,
    sucursal: respuesta.sucursal,
    unidad: respuesta.unidad,
    vigenteDesde: respuesta.vigente_desde,
    vigenteHasta: respuesta.vigente_hasta,
    estado: respuesta.estado,
    revocadaEn: aFecha(respuesta.revocada_en),
    motivoRevocacion: respuesta.motivo_revocacion,
  };
}

export function aMiembroDetalle(respuesta: MiembroDetalleRespuesta): MiembroDetalle {
  return {
    ...aMiembro(respuesta),
    desde: new Date(respuesta.desde),
    hasta: aFecha(respuesta.hasta),
    asignaciones: respuesta.asignaciones.map(aAsignacionDelMiembro),
  };
}
