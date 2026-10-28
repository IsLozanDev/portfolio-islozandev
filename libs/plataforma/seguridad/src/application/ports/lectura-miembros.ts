import type { Alcance } from '../../domain/alcance.js';
import type { EstadoAsignacion, Fecha } from '../../domain/asignacion.js';
import type { EstadoMembresia } from '../../domain/membresia.js';

export const ORDENES_MIEMBROS = ['nombre', 'correo', 'estado'] as const;
export type OrdenMiembros = (typeof ORDENES_MIEMBROS)[number];
export type DireccionOrden = 'asc' | 'desc';

export interface Pagina {
  pagina: number;
  tamano: number;
}

export interface Listado<T> {
  items: T[];
  total: number;
}

export interface FiltroMiembros extends Pagina {
  estado?: EstadoMembresia;
  /** Parte del nombre o del correo, sin distinguir mayúsculas. */
  busqueda?: string;
  orden: OrdenMiembros;
  direccion: DireccionOrden;
}

export interface MiembroListado {
  membresiaId: string;
  usuarioId: string;
  nombre: string;
  correo: string;
  estado: EstadoMembresia;
  esPropietario: boolean;
  /** No revocadas y vigentes en `hoy`. */
  asignacionesVigentes: number;
  /** Solo con una invitación pendiente (ni usada ni anulada), aunque esté vencida. */
  invitacionExpiraEn: Date | null;
}

export interface Referencia {
  id: string;
  nombre: string;
}

export interface AsignacionDelMiembro {
  id: string;
  rol: Referencia | null;
  perfil: Referencia | null;
  alcance: Alcance;
  /** El nombre de la empresa es su razón social. */
  empresa: Referencia | null;
  sucursal: Referencia | null;
  unidad: Referencia | null;
  vigenteDesde: Fecha;
  vigenteHasta: Fecha | null;
  estado: EstadoAsignacion;
  revocadaEn: Date | null;
  motivoRevocacion: string | null;
}

export interface MiembroDetalle extends MiembroListado {
  desde: Date;
  hasta: Date | null;
  /** Por estado (VIGENTE, FUTURA, VENCIDA, REVOCADA) y luego de la más reciente a la más antigua. */
  asignaciones: AsignacionDelMiembro[];
}

export interface Asignable {
  id: string;
  codigo: string;
  nombre: string;
  /** Algún permiso del rol, o de los roles activos del perfil, es sensible (TR-RN-009). */
  sensible: boolean;
}

export interface RolAsignable extends Asignable {
  productoCodigo: string;
}

export interface Asignables {
  roles: RolAsignable[];
  perfiles: Asignable[];
}

/** Lecturas de administración del tenant del contexto (spec 16a). `hoy` es la fecha de Lima. */
export interface LecturaMiembros {
  listar(filtro: FiltroMiembros, hoy: Fecha): Promise<Listado<MiembroListado>>;
  detalle(membresiaId: string, hoy: Fecha): Promise<MiembroDetalle | null>;
  /** Roles activos de `productos` y perfiles con al menos uno de esos roles, propios o predefinidos. */
  asignables(productos: readonly string[]): Promise<Asignables>;
}
