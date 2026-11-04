import type { CausaCierreSoporte, EstadoSoporte, ModoSoporte } from '../../domain/acceso-soporte.js';
import type { Listado, Pagina } from './lectura-miembros.js';
import type { UsuarioDelEvento } from './lectura-bitacora.js';

export interface FiltroSolicitudesSoporte extends Pagina {
  /** Sin estados, todos. La bandeja usa PENDIENTE, APROBADO o los cerrados. */
  estados?: readonly EstadoSoporte[];
}

/** Lo que ve el administrador del cliente. */
export interface SolicitudSoporte {
  id: string;
  agente: UsuarioDelEvento;
  ticket: string;
  motivo: string;
  modo: ModoSoporte;
  horasSolicitadas: number;
  estado: EstadoSoporte;
  solicitadoEn: Date;
  caducaEn: Date;
  horasAprobadas: number | null;
  desde: Date | null;
  hasta: Date | null;
  aprobadoPor: UsuarioDelEvento | null;
  cerradoPor: UsuarioDelEvento | null;
  cerradoEn: Date | null;
  motivoCierre: string | null;
  causaCierre: CausaCierreSoporte | null;
}

/** Lo que ve el agente de sus accesos, en todos los tenants (seg.accesos_soporte_de_agente). */
export interface AccesoDelAgente {
  id: string;
  tenantId: string;
  tenantNombre: string;
  ticket: string;
  modo: ModoSoporte;
  estado: EstadoSoporte;
  horasSolicitadas: number;
  solicitadoEn: Date;
  desde: Date | null;
  hasta: Date | null;
  motivoCierre: string | null;
  causaCierre: CausaCierreSoporte | null;
}

/** Acceso vigente del usuario en el tenant: banner, modo y auditoría por petición. */
export interface SesionSoporte {
  accesoId: string;
  ticket: string;
  modo: ModoSoporte;
  hasta: Date;
}

export interface AccesoPorVencer {
  id: string;
  tenantId: string;
}

/**
 * `delTenant`, `pendientes` y `vigenteDe` leen en el tenant del contexto. `deAgente` y `porVencer`
 * cruzan tenants por funciones SECURITY DEFINER y no necesitan transacción.
 */
export interface LecturaSoporte {
  delTenant(filtro: FiltroSolicitudesSoporte): Promise<Listado<SolicitudSoporte>>;
  /** PENDIENTE sin caducar. */
  pendientes(ahora: Date): Promise<number>;
  deAgente(agenteId: string): Promise<AccesoDelAgente[]>;
  porVencer(ahora: Date): Promise<AccesoPorVencer[]>;
  vigenteDe(usuarioId: string, ahora: Date): Promise<SesionSoporte | null>;
}
