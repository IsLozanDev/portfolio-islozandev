import type { Fecha } from '../../domain/asignacion.js';
import type { Listado, Pagina } from './lectura-miembros.js';
import type { TipoEventoSeguridad } from './repositorios.js';

export interface FiltroBitacora extends Pagina {
  /** Días calendario en America/Lima, ambos incluidos. */
  desde: Fecha;
  hasta: Fecha;
  tipo?: TipoEventoSeguridad;
  /** Parte del correo o del nombre de quien actuó o de quien recibió la asignación, sin distinguir mayúsculas. */
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
  /** Permiso faltante, ticket, o «rol → destinatario» en las asignaciones (TR-CA-051). */
  resumen: string | null;
}

export type TipoAsignado = 'ROL' | 'PERFIL';

export interface AsignadoDelEvento {
  tipo: TipoAsignado;
  nombre: string;
}

export interface EventoBitacoraDetalle extends EventoBitacora {
  ip: string | null;
  /** A quién se le otorgó o revocó, en los eventos de asignación. */
  destinatario: UsuarioDelEvento | null;
  asignado: AsignadoDelEvento | null;
  detalle: Record<string, unknown>;
}

/** Los filtros de la lista sin la página: la exportación lleva todo lo filtrado (spec 18b). */
export type FiltroExportacion = Omit<FiltroBitacora, 'pagina' | 'tamano'>;

export interface EventoBitacoraExportado extends EventoBitacora {
  ip: string | null;
}

/** Eventos del tenant del contexto, del más reciente al más antiguo (TR-RF-019). */
export interface LecturaBitacora {
  listar(filtro: FiltroBitacora): Promise<Listado<EventoBitacora>>;
  detalle(id: string): Promise<EventoBitacoraDetalle | null>;
  contar(filtro: FiltroExportacion): Promise<number>;
  /** Todo lo filtrado en el orden de la lista, por lotes, sin offset (keyset por fecha e id). */
  recorrer(filtro: FiltroExportacion, alLote: (eventos: EventoBitacoraExportado[]) => Promise<void>): Promise<void>;
}
