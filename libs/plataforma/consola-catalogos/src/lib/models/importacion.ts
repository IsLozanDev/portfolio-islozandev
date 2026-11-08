export type EstadoImportacion = 'PREVISUALIZADA' | 'RECHAZADA' | 'EN_COLA' | 'EN_PROCESO' | 'APLICADA' | 'FALLIDA' | 'OBSOLETA' | 'VENCIDA';
export type EstadoFinalAplicacion = 'APLICADA' | 'FALLIDA' | 'OBSOLETA';

export const ESTADOS_FINALES_APLICACION: readonly EstadoImportacion[] = ['APLICADA', 'FALLIDA', 'OBSOLETA'];

export interface ResumenImportacion {
  altas: number;
  cambios: number;
  bajas: number;
  sinCambios: number;
}

interface ResumenRespuesta {
  altas: number;
  cambios: number;
  bajas: number;
  sin_cambios: number;
}

/** Fila del archivo tal como quedaría el ítem. */
export interface FilaImportada {
  fila: number;
  codigo: string;
  codigoExterno: string | null;
  nombre: string;
  abreviatura: string | null;
  orden: number;
  atributos: Readonly<Record<string, string>>;
}

interface FilaImportadaRespuesta {
  fila: number;
  codigo: string;
  codigo_externo: string | null;
  nombre: string;
  abreviatura: string | null;
  orden: number;
  atributos: Record<string, string>;
}

/** El ítem global como está hoy, antes del cambio. */
export interface ItemAntes {
  id: string;
  codigo: string;
  codigoExterno: string | null;
  nombre: string;
  abreviatura: string | null;
  orden: number;
  atributos: Readonly<Record<string, unknown>>;
}

interface ItemAntesRespuesta {
  id: string;
  codigo: string;
  codigo_externo: string | null;
  nombre: string;
  abreviatura: string | null;
  orden: number;
  atributos: Record<string, unknown>;
}

export interface CambioEnMuestra {
  antes: ItemAntes;
  despues: FilaImportada;
}

export interface BajaEnMuestra {
  itemId: string;
  codigo: string;
  nombre: string;
  vigenteHasta: string;
}

export interface Previsualizacion {
  id: string;
  /** La que se envía en `aplicar`. */
  version: number;
  estado: EstadoImportacion;
  versionOficial: string;
  fechaVigencia: string;
  resumen: ResumenImportacion & { totalFilas: number };
  muestra: { altas: FilaImportada[]; cambios: CambioEnMuestra[]; bajas: BajaEnMuestra[] };
  /** ISO 8601: hasta cuándo se puede aplicar. */
  venceEn: string;
}

export interface PrevisualizacionRespuesta {
  id: string;
  version: number;
  estado: EstadoImportacion;
  version_oficial: string;
  fecha_vigencia: string;
  archivo_sha256: string;
  resumen: ResumenRespuesta & { total_filas: number };
  muestra: {
    altas: FilaImportadaRespuesta[];
    cambios: { antes: ItemAntesRespuesta; despues: FilaImportadaRespuesta }[];
    bajas: { item_id: string; codigo: string; nombre: string; vigente_hasta: string }[];
  };
  vence_en: string;
}

export interface ErrorFila {
  fila: number;
  columna: string;
  valor: string;
  mensaje: string;
}

/** Cuerpo del 422 FILAS_INVALIDAS: la importación quedó RECHAZADA. */
export interface FilasInvalidas {
  importacionId: string;
  totalErrores: number;
  /** Los primeros 100. */
  errores: ErrorFila[];
}

export interface FilasInvalidasRespuesta {
  importacion_id: string;
  total_errores: number;
  errores: ErrorFila[];
}

export interface ImportacionListada {
  id: string;
  estado: EstadoImportacion;
  versionOficial: string;
  fechaVigencia: string;
  archivoNombre: string;
  resumen: ResumenImportacion;
  totalErrores: number;
  motivoFallo: string | null;
  creadoEn: string;
  terminadoEn: string | null;
}

export interface ImportacionListadaRespuesta {
  id: string;
  estado: EstadoImportacion;
  version_oficial: string;
  fecha_vigencia: string;
  archivo_nombre: string;
  archivo_sha256: string;
  resumen: ResumenRespuesta;
  total_errores: number;
  motivo_fallo: string | null;
  lanzado_por: string;
  creado_en: string;
  aplicado_por: string | null;
  terminado_en: string | null;
}

export interface HistorialImportaciones {
  items: ImportacionListada[];
  total: number;
}

export interface HistorialImportacionesRespuesta {
  items: ImportacionListadaRespuesta[];
  total: number;
}

/** Una importación en cola del usuario, con el código del catálogo y el avance que da Redis (0-99). */
export interface ImportacionActiva extends ImportacionListada {
  codigo: string;
  avance: number | null;
}

export interface ImportacionActivaRespuesta extends ImportacionListadaRespuesta {
  codigo: string;
  avance: number | null;
}

export interface DetalleImportacion extends ImportacionActiva {
  venceEn: string;
}

export interface DetalleImportacionRespuesta extends ImportacionActivaRespuesta {
  vence_en: string;
}

export interface ImportacionEncolada {
  id: string;
  estado: 'EN_COLA';
}

/** Lo que llega por el stream SSE de una importación. */
export type AvisoImportacion =
  | { tipo: 'avance'; estado: 'EN_COLA' | 'EN_PROCESO'; avance: number }
  | { tipo: 'fin'; estado: EstadoFinalAplicacion; resumen: ResumenImportacion | null; motivo: string | null };

export type AvisoImportacionRespuesta =
  | { tipo: 'avance'; estado: 'EN_COLA' | 'EN_PROCESO'; avance: number }
  | { tipo: 'fin'; estado: EstadoFinalAplicacion; resumen: ResumenRespuesta | null; motivo: string | null };

export function aResumen(respuesta: ResumenRespuesta): ResumenImportacion {
  return { altas: respuesta.altas, cambios: respuesta.cambios, bajas: respuesta.bajas, sinCambios: respuesta.sin_cambios };
}

function aFilaImportada(respuesta: FilaImportadaRespuesta): FilaImportada {
  return {
    fila: respuesta.fila,
    codigo: respuesta.codigo,
    codigoExterno: respuesta.codigo_externo,
    nombre: respuesta.nombre,
    abreviatura: respuesta.abreviatura,
    orden: respuesta.orden,
    atributos: respuesta.atributos,
  };
}

function aItemAntes(respuesta: ItemAntesRespuesta): ItemAntes {
  return {
    id: respuesta.id,
    codigo: respuesta.codigo,
    codigoExterno: respuesta.codigo_externo,
    nombre: respuesta.nombre,
    abreviatura: respuesta.abreviatura,
    orden: respuesta.orden,
    atributos: respuesta.atributos,
  };
}

export function aPrevisualizacion(respuesta: PrevisualizacionRespuesta): Previsualizacion {
  return {
    id: respuesta.id,
    version: respuesta.version,
    estado: respuesta.estado,
    versionOficial: respuesta.version_oficial,
    fechaVigencia: respuesta.fecha_vigencia,
    resumen: { ...aResumen(respuesta.resumen), totalFilas: respuesta.resumen.total_filas },
    muestra: {
      altas: respuesta.muestra.altas.map(aFilaImportada),
      cambios: respuesta.muestra.cambios.map((cambio) => ({ antes: aItemAntes(cambio.antes), despues: aFilaImportada(cambio.despues) })),
      bajas: respuesta.muestra.bajas.map((baja) => ({ itemId: baja.item_id, codigo: baja.codigo, nombre: baja.nombre, vigenteHasta: baja.vigente_hasta })),
    },
    venceEn: respuesta.vence_en,
  };
}

export function aFilasInvalidas(respuesta: FilasInvalidasRespuesta): FilasInvalidas {
  return { importacionId: respuesta.importacion_id, totalErrores: respuesta.total_errores, errores: respuesta.errores };
}

export function aImportacionListada(respuesta: ImportacionListadaRespuesta): ImportacionListada {
  return {
    id: respuesta.id,
    estado: respuesta.estado,
    versionOficial: respuesta.version_oficial,
    fechaVigencia: respuesta.fecha_vigencia,
    archivoNombre: respuesta.archivo_nombre,
    resumen: aResumen(respuesta.resumen),
    totalErrores: respuesta.total_errores,
    motivoFallo: respuesta.motivo_fallo,
    creadoEn: respuesta.creado_en,
    terminadoEn: respuesta.terminado_en,
  };
}

export function aImportacionActiva(respuesta: ImportacionActivaRespuesta): ImportacionActiva {
  return { ...aImportacionListada(respuesta), codigo: respuesta.codigo, avance: respuesta.avance };
}

export function aDetalleImportacion(respuesta: DetalleImportacionRespuesta): DetalleImportacion {
  return { ...aImportacionActiva(respuesta), venceEn: respuesta.vence_en };
}

export function aAvisoImportacion(respuesta: AvisoImportacionRespuesta): AvisoImportacion {
  if (respuesta.tipo === 'avance') return respuesta;
  return { ...respuesta, resumen: respuesta.resumen === null ? null : aResumen(respuesta.resumen) };
}
