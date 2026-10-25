import type { Reinicio, TipoDocumento } from '../../domain/tipos.js';

export interface FiltroSeries {
  empresaId?: string;
  sucursalId?: string;
  tipo?: TipoDocumento;
  activa?: boolean;
}

export interface SerieListada {
  id: string;
  empresaId: string;
  sucursalId: string | null;
  unidadId: string | null;
  tipo: TipoDocumento;
  serie: string;
  digitos: number;
  reinicio: Reinicio;
  ultimoNumero: number;
  periodo: string | null;
  activa: boolean;
  /** Vista previa con el reinicio del periodo aplicado al instante pedido. No reserva el número. */
  siguienteNumero: number;
}

export interface SerieDetalle extends SerieListada {
  empresaNombre: string;
  sucursalNombre: string | null;
  unidadNombre: string | null;
  creadoPor: string;
  creadoEn: Date;
  modificadoPor: string;
  modificadoEn: Date;
}

/** Series del tenant del contexto, en la transacción activa. */
export interface LecturaSeries {
  /** Ordenadas por tipo y serie. */
  listar(filtro: FiltroSeries, instante: Date): Promise<SerieListada[]>;
  consultar(id: string, instante: Date): Promise<SerieDetalle | null>;
}
