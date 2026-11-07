import type { ItemGlobalActual } from '../../domain/importacion/calcular-diferencias.js';
import type { Importacion, ResumenImportacion } from '../../domain/importacion/importacion.js';
import type { EstadoImportacion } from '../../domain/importacion/tipos.js';

export type TipoArchivo = 'CSV' | 'XLSX';

/** Fila de datos; `numero` es la fila del archivo, con la cabecera en la 1. */
export interface FilaLeida {
  numero: number;
  /** Por nombre de columna tal como viene en la cabecera, siempre como texto. */
  celdas: Record<string, string>;
}

export interface TablaLeida {
  cabecera: string[];
  /** En streaming. Falla con ArchivoInvalidoError si el archivo no tiene filas o pasa de FILAS_MAXIMAS. */
  filas: AsyncIterable<FilaLeida>;
}

/** Lee la cabecera antes de las filas para validarla sin recorrer el archivo. */
export interface LectorTabla {
  leer(archivo: Buffer, tipo: TipoArchivo): Promise<TablaLeida>;
}

export interface Pagina {
  pagina: number;
  tamano: number;
}

export interface Listado<T> {
  items: T[];
  total: number;
}

/** Fila del historial: sin operaciones ni errores, que pesan megas. */
export interface ImportacionListada {
  id: string;
  catalogoId: string;
  estado: EstadoImportacion;
  versionOficial: string;
  fechaVigencia: string;
  archivoNombre: string;
  archivoSha256: string;
  resumen: ResumenImportacion;
  totalErrores: number;
  motivoFallo: string | null;
  lanzadoPor: string;
  creadoEn: Date;
  aplicadoPor: string | null;
  terminadoEn: Date | null;
}

/** Importaciones del tenant del contexto (RLS), dentro de la transacción activa. */
export interface RepositorioImportaciones {
  /** null si no existe, el id no es un UUID o es de otro tenant. */
  buscar(id: string): Promise<Importacion | null>;
  /** `versionAnterior` null crea. false si la versión no coincide. ImportacionEnCursoError si ya hay otra EN_COLA del catálogo. */
  guardar(importacion: Importacion, versionAnterior: number | null): Promise<boolean>;
  /** La más reciente primero. */
  listarPorCatalogo(catalogoId: string, pagina: Pagina): Promise<Listado<ImportacionListada>>;
  /** EN_COLA lanzadas por el usuario. */
  activasDe(usuarioId: string): Promise<ImportacionListada[]>;
  /** La EN_COLA del catálogo, si hay (ux_importacion_activa admite una). */
  enColaDe(catalogoId: string): Promise<Importacion | null>;
  /** PREVISUALIZADA o RECHAZADA del catálogo pasan a VENCIDA, sin operaciones ni errores. */
  vencerPrevias(catalogoId: string, ahora: Date): Promise<void>;
}

/** Ítems globales del catálogo, cerrados e inactivos incluidos. */
export interface LecturaItemsGlobales {
  de(catalogoId: string): Promise<ItemGlobalActual[]>;
}

export type TipoLote = 'ALTA' | 'CAMBIO';

/**
 * Las funciones SECURITY DEFINER que aplican una importación, todas en la transacción activa. Fuera de
 * `iniciar` fallan si la transacción no está aplicando esa importación.
 */
export interface EscrituraImportacion {
  /** Bloquea el catálogo. false si ya no está EN_COLA o el catálogo cambió desde la previsualización. */
  iniciar(importacionId: string): Promise<boolean>;
  /** Operaciones [desde, hasta) del tipo. Devuelve las filas escritas. */
  aplicarLote(importacionId: string, tipo: TipoLote, desde: number, hasta: number): Promise<number>;
  cerrarBajas(importacionId: string): Promise<number>;
  /** Sube la versión del catálogo una vez y deja la importación APLICADA. Devuelve la versión nueva. */
  finalizar(importacionId: string, por: string): Promise<number>;
}

export const COLA_IMPORTACIONES = Symbol('ColaImportaciones');

export interface TrabajoImportacion {
  importacionId: string;
  tenantId: string;
  usuarioId: string;
}

/** Cola del worker. Un trabajo por importación: el id del trabajo es el de la importación. */
export interface ColaImportaciones {
  encolar(trabajo: TrabajoImportacion): Promise<void>;
}

export type EstadoFinalAplicacion = 'APLICADA' | 'FALLIDA' | 'OBSOLETA';

export interface ResumenAviso {
  altas: number;
  cambios: number;
  bajas: number;
  sin_cambios: number;
}

/** Lo que recibe el front por SSE. El 100 solo llega con el `fin`, después del commit. */
export type AvisoImportacion =
  | { tipo: 'avance'; estado: 'EN_COLA' | 'EN_PROCESO'; avance: number }
  | { tipo: 'fin'; estado: EstadoFinalAplicacion; resumen: ResumenAviso | null; motivo: string | null };

/** Avance informativo del worker a la API. El estado verdadero está en la base. */
export interface CanalAvance {
  /** Guarda el último aviso (con TTL) y lo publica. */
  publicar(importacionId: string, aviso: AvisoImportacion): Promise<void>;
  ultimo(importacionId: string): Promise<AvisoImportacion | null>;
  /** Cada aviso publicado desde que se suscribe, hasta que `senal` se aborta: entonces suelta la suscripción. */
  suscribir(importacionId: string, senal: AbortSignal): AsyncIterable<AvisoImportacion>;
}
