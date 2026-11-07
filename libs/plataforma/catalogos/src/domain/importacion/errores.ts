import { ConflictError, DomainError, NotFoundError, ValidationError } from '@vitrina/plataforma/kernel';
import type { ErrorFila, EstadoImportacion } from './tipos.js';

export class TablaNoImportableError extends ValidationError {
  override readonly code = 'TABLA_NO_IMPORTABLE';

  constructor() {
    super('El catálogo no es una tabla oficial importable');
  }
}

export class ArchivoInvalidoError extends ValidationError {
  override readonly code = 'ARCHIVO_INVALIDO';
}

/** 413. */
export class ArchivoDemasiadoGrandeError extends ValidationError {
  override readonly code = 'ARCHIVO_DEMASIADO_GRANDE';

  constructor() {
    super('El archivo supera los 20 MB');
  }
}

/** TR-CA-073. */
export class ColumnasInvalidasError extends ValidationError {
  override readonly code = 'COLUMNAS_INVALIDAS';
}

/** 422. Lleva los errores de la respuesta, no todos los guardados. */
export class FilasInvalidasError extends ValidationError {
  override readonly code = 'FILAS_INVALIDAS';

  constructor(
    readonly importacionId: string,
    readonly errores: readonly ErrorFila[],
    readonly totalErrores: number,
  ) {
    super('El archivo tiene filas inválidas; no se importó nada');
  }
}

export class ImportacionNoEncontradaError extends NotFoundError {
  override readonly code = 'IMPORTACION_NO_ENCONTRADA';

  constructor() {
    super('La importación no existe');
  }
}

export class ImportacionNoAplicableError extends ConflictError {
  override readonly code = 'IMPORTACION_NO_APLICABLE';

  constructor(readonly estado: EstadoImportacion) {
    super(`La importación está en estado ${estado} y no se puede aplicar`);
  }
}

export class ImportacionEnCursoError extends ConflictError {
  override readonly code = 'IMPORTACION_EN_CURSO';

  constructor() {
    super('Ya hay una importación en curso para este catálogo');
  }
}

/** 503. */
export class ColaNoDisponibleError extends DomainError {
  readonly code = 'COLA_NO_DISPONIBLE';

  constructor() {
    super('No se pudo encolar la importación; intente de nuevo');
  }
}
