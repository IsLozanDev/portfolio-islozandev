import { ConflictError, NotFoundError, ValidationError } from '@vitrina/plataforma/kernel';

export class FeriadoInvalidoError extends ValidationError {
  override readonly code = 'FERIADO_INVALIDO';
}

/** TR-CA-077. */
export class FeriadoDuplicadoError extends ConflictError {
  override readonly code = 'FERIADO_DUPLICADO';

  constructor() {
    super('La fecha ya está registrada como feriado');
  }
}

export class FeriadoNoEncontradoError extends NotFoundError {
  override readonly code = 'FERIADO_NO_ENCONTRADO';

  constructor() {
    super('El feriado no existe');
  }
}

/** Violación de la FK compuesta (tenant_id, sucursal_id) hacia org.sucursal. */
export class SucursalNoEncontradaError extends NotFoundError {
  override readonly code = 'SUCURSAL_NO_ENCONTRADA';

  constructor() {
    super('La sucursal no existe');
  }
}
