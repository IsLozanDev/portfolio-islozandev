import { ConflictError, DomainError, ForbiddenError, NotFoundError, ValidationError } from '@vitrina/plataforma/kernel';

// Ningún mensaje lleva el nombre original, la URL firmada ni el token: los mensajes llegan a logs (TR-RNF-026).

export class CategoriaDesconocidaError extends ValidationError {
  override readonly code = 'CATEGORIA_DESCONOCIDA';

  constructor() {
    super('Esa categoría de archivo no existe');
  }
}

export class MimeNoPermitidoError extends ValidationError {
  override readonly code = 'MIME_NO_PERMITIDO';

  constructor() {
    super('La categoría no admite ese tipo de archivo');
  }
}

export class TamanoExcedidoError extends ValidationError {
  override readonly code = 'TAMANO_EXCEDIDO';

  constructor(readonly tamanoMaxBytes: number) {
    super(`El archivo supera el máximo de la categoría: ${tamanoMaxBytes} bytes`);
  }
}

export class DatosArchivoInvalidosError extends ValidationError {
  override readonly code = 'DATOS_INVALIDOS';
}

export class VigenciaInvalidaError extends ValidationError {
  override readonly code = 'VIGENCIA_INVALIDA';

  constructor(minimaSegundos: number, maximaSegundos: number) {
    super(`La vigencia va de ${minimaSegundos} a ${maximaSegundos} segundos`);
  }
}

/** También para un archivo de otro tenant: no se revela que existe (TR-CA-205). */
export class ArchivoNoEncontradoError extends NotFoundError {
  override readonly code = 'NO_ENCONTRADO';

  constructor() {
    super('No existe ese archivo');
  }
}

export class ArchivoNoDisponibleError extends ConflictError {
  override readonly code = 'ARCHIVO_NO_DISPONIBLE';

  constructor(readonly estado: string) {
    super(`El archivo no está disponible: ${estado}`);
  }
}

/** Ya hay una versión nueva pendiente de carga o en análisis: se espera a que termine. */
export class VersionEnCursoError extends ConflictError {
  override readonly code = 'VERSION_EN_CURSO';

  constructor(readonly numero: number) {
    super(`El archivo ya tiene la versión ${numero} en curso`);
  }
}

/** También para la versión de un intento rechazado o limpiado: su fila se borró. */
export class VersionNoEncontradaError extends NotFoundError {
  override readonly code = 'VERSION_NO_ENCONTRADA';

  constructor() {
    super('No existe esa versión del archivo');
  }
}

/** Seguir el análisis de una carga o versión que todavía no se confirmó. */
export class AnalisisNoIniciadoError extends ConflictError {
  override readonly code = 'ANALISIS_NO_INICIADO';

  constructor() {
    super('El análisis no empezó: falta confirmar la subida');
  }
}

export class VersionNoDisponibleError extends ConflictError {
  override readonly code = 'VERSION_NO_DISPONIBLE';

  constructor(readonly estado: string) {
    super(`La versión no está disponible: ${estado}`);
  }
}

export class AccesoEntidadDenegadoError extends ForbiddenError {
  override readonly code = 'ACCESO_ENTIDAD_DENEGADO';

  constructor() {
    super('No tienes acceso a la entidad de ese archivo');
  }
}

/** Storage o la cola no respondieron: el cliente reintenta. Lleva solo el código del origen. */
export class AlmacenNoDisponibleError extends DomainError {
  readonly code = 'ALMACEN_NO_DISPONIBLE';

  constructor(readonly codigoOrigen?: string) {
    super(codigoOrigen ? `El almacén de archivos no respondió: ${codigoOrigen}` : 'El almacén de archivos no respondió');
  }
}

export const CODIGOS_ERROR_ANTIVIRUS = ['CONEXION', 'TIEMPO_AGOTADO', 'RESPUESTA_DESCONOCIDA', 'TAMANO_EXCEDIDO'] as const;
export type CodigoErrorAntivirus = (typeof CODIGOS_ERROR_ANTIVIRUS)[number];

/**
 * El antivirus no dio un veredicto: el trabajo de análisis se reintenta y el archivo sigue EN_ANALISIS. Nunca
 * equivale a «limpio». Lleva solo el código del origen, no la respuesta del motor.
 */
export class AntivirusNoDisponibleError extends DomainError {
  readonly code = 'ANTIVIRUS_NO_DISPONIBLE';

  constructor(readonly codigoOrigen: CodigoErrorAntivirus) {
    super(`El antivirus no respondió: ${codigoOrigen}`);
  }
}
