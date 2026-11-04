import type { Fecha } from '../../domain/asignacion.js';
import type { Listado, Pagina } from './lectura-miembros.js';
import type { TipoEventoSeguridad } from './repositorios.js';

export interface FiltroBitacora extends Pagina {
  /** Días calendario en America/Lima, ambos incluidos. */
  desde: Fecha;
  hasta: Fecha;
  tipo?: TipoEventoSeguridad;
  /** Parte del correo o del nombre, sin distinguir mayúsculas. */
  usuario?: string;
}

export interface UsuarioDelEvento {
  id: string;
  nombre: string;
  correo: string;
}

export interface EventoBitacora {
  /** bigserial como texto. */
  id: string;
  tipo: TipoEventoSeguridad;
  ocurridoEn: Date;
  usuario: UsuarioDelEvento | null;
  /** Permiso faltante, ticket o rol, según el tipo (TR-CA-051). */
  resumen: string | null;
}

export interface EventoBitacoraDetalle extends EventoBitacora {
  ip: string | null;
  detalle: Record<string, unknown>;
}

/** Eventos del tenant del contexto, del más reciente al más antiguo (TR-RF-019). */
export interface LecturaBitacora {
  listar(filtro: FiltroBitacora): Promise<Listado<EventoBitacora>>;
  detalle(id: string): Promise<EventoBitacoraDetalle | null>;
}
