import type { CodigoEstadoArchivo, MotivoRechazo } from '../../domain/archivo.js';
import type { Disposicion } from '../../domain/vigencia-descarga.js';
import type { CargaFirmada } from './almacen-archivos.js';

export const ARCHIVO_PORT = Symbol('ArchivoPort');

export interface SolicitarCargaComando {
  categoria: string;
  nombreOriginal: string;
  /** Bytes que el cliente dice que va a subir; el análisis los compara con los reales. */
  tamano: number;
  mime: string;
  entidadTipo: string;
  entidadId: string;
}

export interface CargaSolicitada {
  archivoId: string;
  carga: CargaFirmada;
}

/** `bytes` y `hashSha256` solo existen después del análisis; `motivoRechazo`, solo en un archivo rechazado. */
export interface EstadoArchivo {
  archivoId: string;
  estado: CodigoEstadoArchivo;
  motivoRechazo?: MotivoRechazo;
  categoria: string;
  nombreOriginal: string;
  bytes?: number;
  hashSha256?: string;
}

export interface UrlDescargaConsulta {
  archivoId: string;
  /** Por defecto `attachment`. */
  disposicion?: Disposicion;
  /** De 60 a 900; por defecto 900. */
  vigenciaSegundos?: number;
}

export interface UrlDescarga {
  url: string;
  expiraEn: Date;
}

/** Archivos del tenant del contexto, para consumidores en proceso. */
export interface ArchivoPort {
  solicitarCarga(comando: SolicitarCargaComando): Promise<CargaSolicitada>;
  /** Idempotente: confirmar un archivo ya confirmado devuelve su estado actual. */
  confirmarCarga(archivoId: string): Promise<EstadoArchivo>;
  /** Solo de un archivo `DISPONIBLE`. Audita la descarga si la categoría es sensible. */
  urlDescarga(consulta: UrlDescargaConsulta): Promise<UrlDescarga>;
  estado(archivoId: string): Promise<EstadoArchivo>;
}
