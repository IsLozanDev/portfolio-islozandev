import type { CodigoEstadoArchivo, CodigoEstadoVersion, MotivoRechazo, MotivoRechazoVersion } from '../../domain/archivo.js';
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

/** Una versión nueva de un archivo `DISPONIBLE`. El MIME puede cambiar dentro de la categoría. */
export interface NuevaVersionComando {
  archivoId: string;
  tamano: number;
  mime: string;
}

export interface VersionSolicitada {
  archivoId: string;
  numero: number;
  carga: CargaFirmada;
}

/** `hashSha256`, `bytes` y `mimeReal` solo existen después del análisis. */
export interface VersionListada {
  numero: number;
  estado: CodigoEstadoVersion;
  vigente: boolean;
  hashSha256?: string;
  bytes?: number;
  mimeReal?: string;
  subidoPor: string;
  subidoEn: Date;
}

/** Las versiones existentes por número; las rechazadas no figuran. Sin vigente si el archivo no está `DISPONIBLE`. */
export interface VersionesArchivo {
  archivoId: string;
  versionVigente?: number;
  versiones: VersionListada[];
}

export interface RechazoVersionVisible {
  motivo: MotivoRechazoVersion;
  versionCoincidente?: number;
  mensaje: string;
}

/**
 * `bytes` y `hashSha256` son los de la versión vigente (sin vigente, los de la versión 1) y solo existen
 * después del análisis; `motivoRechazo`, solo en un archivo rechazado; `rechazoVersion`, si el último intento
 * de versión se rechazó.
 */
export interface EstadoArchivo {
  archivoId: string;
  estado: CodigoEstadoArchivo;
  motivoRechazo?: MotivoRechazo;
  categoria: string;
  nombreOriginal: string;
  bytes?: number;
  hashSha256?: string;
  versionVigente?: number;
  versionEnCurso?: { numero: number; estado: CodigoEstadoVersion };
  rechazoVersion?: RechazoVersionVisible;
}

export interface UrlDescargaConsulta {
  archivoId: string;
  /** Por defecto la vigente. */
  version?: number;
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
  nuevaVersion(comando: NuevaVersionComando): Promise<VersionSolicitada>;
  /** Idempotente: confirmar una versión ya confirmada la devuelve tal cual. */
  confirmarVersion(archivoId: string, numero: number): Promise<VersionListada>;
  versiones(archivoId: string): Promise<VersionesArchivo>;
  /** Idempotente: marcar la que ya es vigente no publica evento. */
  marcarVigente(archivoId: string, numero: number): Promise<EstadoArchivo>;
  /** Solo de una versión `DISPONIBLE` de un archivo `DISPONIBLE`. Audita la descarga si la categoría es sensible. */
  urlDescarga(consulta: UrlDescargaConsulta): Promise<UrlDescarga>;
  estado(archivoId: string): Promise<EstadoArchivo>;
}
