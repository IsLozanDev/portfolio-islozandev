export const ESTADOS_ARCHIVO = ['PENDIENTE_CARGA', 'EN_ANALISIS', 'DISPONIBLE', 'CUARENTENA', 'RECHAZADO'] as const;

/** Estado del archivo (su primera carga) o de una versión: la API usa la misma lista para los dos. */
export type CodigoEstadoArchivo = (typeof ESTADOS_ARCHIVO)[number];

export const RESULTADOS_ANALISIS = ['DISPONIBLE', 'CUARENTENA', 'RECHAZADO'] as const;
export type ResultadoAnalisis = (typeof RESULTADOS_ANALISIS)[number];

export const DISPOSICION_ADJUNTO = 'attachment';

/** La primera carga es la versión 1; las versiones nuevas van de la 2 en adelante. */
export const NUMERO_PRIMERA_VERSION = 1;

export interface SolicitudCarga {
  categoria: string;
  nombreOriginal: string;
  tamano: number;
  mime: string;
  entidadTipo: string;
  entidadId: string;
}

export interface SolicitudVersion {
  tamano: number;
  mime: string;
}

interface CargaFirmadaRespuesta {
  url: string;
  token: string;
  expira_en: string;
}

/** URL de Storage para un solo objeto: se sube con PUT y el Content-Type declarado. */
export interface CargaFirmada {
  url: string;
  token: string;
  expiraEn: string;
}

export interface CargaSolicitadaRespuesta {
  archivo_id: string;
  carga: CargaFirmadaRespuesta;
}

export interface CargaSolicitada {
  archivoId: string;
  carga: CargaFirmada;
}

export interface VersionSolicitadaRespuesta {
  archivo_id: string;
  numero: number;
  carga: CargaFirmadaRespuesta;
}

export interface VersionSolicitada {
  archivoId: string;
  numero: number;
  carga: CargaFirmada;
}

export interface VersionRespuesta {
  numero: number;
  estado: CodigoEstadoArchivo;
  vigente: boolean;
  hash_sha256?: string;
  bytes?: number;
  mime_real?: string;
  subido_por: string;
  subido_en: string;
}

export interface VersionArchivo {
  numero: number;
  estado: CodigoEstadoArchivo;
  vigente: boolean;
  hashSha256?: string;
  bytes?: number;
  mimeReal?: string;
  subidoPor: string;
  subidoEn: string;
}

export interface VersionesArchivoRespuesta {
  archivo_id: string;
  version_vigente?: number;
  versiones: VersionRespuesta[];
}

export interface VersionesArchivo {
  archivoId: string;
  versionVigente?: number;
  versiones: VersionArchivo[];
}

interface VersionEnCurso {
  numero: number;
  estado: CodigoEstadoArchivo;
}

interface RechazoVersionRespuesta {
  motivo: string;
  version_coincidente?: number;
  mensaje: string;
}

export interface RechazoVersion {
  motivo: string;
  versionCoincidente?: number;
  mensaje: string;
}

export interface EstadoArchivoRespuesta {
  archivo_id: string;
  estado: CodigoEstadoArchivo;
  motivo_rechazo?: string;
  categoria: string;
  nombre_original: string;
  bytes?: number;
  hash_sha256?: string;
  version_vigente?: number;
  version_en_curso?: VersionEnCurso;
  rechazo_version?: RechazoVersionRespuesta;
}

export interface EstadoArchivo {
  archivoId: string;
  estado: CodigoEstadoArchivo;
  motivoRechazo?: string;
  categoria: string;
  nombreOriginal: string;
  bytes?: number;
  hashSha256?: string;
  versionVigente?: number;
  versionEnCurso?: VersionEnCurso;
  rechazoVersion?: RechazoVersion;
}

export interface UrlDescargaRespuesta {
  url: string;
  expira_en: string;
}

export interface UrlDescarga {
  url: string;
  expiraEn: string;
}

export type AvisoAnalisisRespuesta =
  | { tipo: 'estado'; numero: number; estado: 'EN_ANALISIS' }
  | { tipo: 'fin'; numero: number; resultado: ResultadoAnalisis; motivo?: string; version_coincidente?: number; mensaje?: string };

/** Lo que empuja el SSE del análisis: `estado` mientras analiza y un `fin` con el resultado. */
export type AvisoAnalisis =
  | { tipo: 'estado'; numero: number }
  | { tipo: 'fin'; numero: number; resultado: ResultadoAnalisis; motivo?: string; versionCoincidente?: number; mensaje?: string };

export function aCuerpoSolicitudCarga(solicitud: SolicitudCarga) {
  return {
    categoria: solicitud.categoria,
    nombre_original: solicitud.nombreOriginal,
    tamano: solicitud.tamano,
    mime: solicitud.mime,
    entidad_tipo: solicitud.entidadTipo,
    entidad_id: solicitud.entidadId,
  };
}

export function aCargaSolicitada(respuesta: CargaSolicitadaRespuesta): CargaSolicitada {
  return { archivoId: respuesta.archivo_id, carga: aCargaFirmada(respuesta.carga) };
}

export function aVersionSolicitada(respuesta: VersionSolicitadaRespuesta): VersionSolicitada {
  return { archivoId: respuesta.archivo_id, numero: respuesta.numero, carga: aCargaFirmada(respuesta.carga) };
}

export function aVersionArchivo(respuesta: VersionRespuesta): VersionArchivo {
  return {
    numero: respuesta.numero,
    estado: respuesta.estado,
    vigente: respuesta.vigente,
    ...(respuesta.hash_sha256 !== undefined && { hashSha256: respuesta.hash_sha256 }),
    ...(respuesta.bytes !== undefined && { bytes: respuesta.bytes }),
    ...(respuesta.mime_real !== undefined && { mimeReal: respuesta.mime_real }),
    subidoPor: respuesta.subido_por,
    subidoEn: respuesta.subido_en,
  };
}

export function aVersionesArchivo(respuesta: VersionesArchivoRespuesta): VersionesArchivo {
  return {
    archivoId: respuesta.archivo_id,
    ...(respuesta.version_vigente !== undefined && { versionVigente: respuesta.version_vigente }),
    versiones: respuesta.versiones.map(aVersionArchivo),
  };
}

export function aEstadoArchivo(respuesta: EstadoArchivoRespuesta): EstadoArchivo {
  const { rechazo_version: rechazo } = respuesta;
  return {
    archivoId: respuesta.archivo_id,
    estado: respuesta.estado,
    ...(respuesta.motivo_rechazo !== undefined && { motivoRechazo: respuesta.motivo_rechazo }),
    categoria: respuesta.categoria,
    nombreOriginal: respuesta.nombre_original,
    ...(respuesta.bytes !== undefined && { bytes: respuesta.bytes }),
    ...(respuesta.hash_sha256 !== undefined && { hashSha256: respuesta.hash_sha256 }),
    ...(respuesta.version_vigente !== undefined && { versionVigente: respuesta.version_vigente }),
    ...(respuesta.version_en_curso !== undefined && { versionEnCurso: { ...respuesta.version_en_curso } }),
    ...(rechazo !== undefined && {
      rechazoVersion: {
        motivo: rechazo.motivo,
        ...(rechazo.version_coincidente !== undefined && { versionCoincidente: rechazo.version_coincidente }),
        mensaje: rechazo.mensaje,
      },
    }),
  };
}

export function aUrlDescarga(respuesta: UrlDescargaRespuesta): UrlDescarga {
  return { url: respuesta.url, expiraEn: respuesta.expira_en };
}

export function aAvisoAnalisis(respuesta: AvisoAnalisisRespuesta): AvisoAnalisis {
  if (respuesta.tipo === 'estado') return { tipo: 'estado', numero: respuesta.numero };
  return {
    tipo: 'fin',
    numero: respuesta.numero,
    resultado: respuesta.resultado,
    ...(respuesta.motivo !== undefined && { motivo: respuesta.motivo }),
    ...(respuesta.version_coincidente !== undefined && { versionCoincidente: respuesta.version_coincidente }),
    ...(respuesta.mensaje !== undefined && { mensaje: respuesta.mensaje }),
  };
}

function aCargaFirmada(respuesta: CargaFirmadaRespuesta): CargaFirmada {
  return { url: respuesta.url, token: respuesta.token, expiraEn: respuesta.expira_en };
}
