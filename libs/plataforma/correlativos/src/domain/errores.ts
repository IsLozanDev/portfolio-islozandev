import { ConflictError, NotFoundError, ValidationError } from '@vitrina/plataforma/kernel';
import type { TipoDocumento } from './tipos.js';

/** TR-RN-017. El mensaje es el que ve el usuario (TR-CA-091). */
export class SerieInvalidaError extends ValidationError {
  override readonly code = 'SERIE_INVALIDA';
}

export class AmbitoSerieInvalidoError extends ValidationError {
  override readonly code = 'AMBITO_INVALIDO';
}

export class SerieDuplicadaError extends ConflictError {
  override readonly code = 'SERIE_DUPLICADA';

  constructor(tipo: TipoDocumento, serie: string) {
    super(`Ya existe la serie ${serie} de ${tipo} en la empresa`);
  }
}

export class SerieNoEncontradaError extends NotFoundError {
  override readonly code = 'SERIE_NO_ENCONTRADA';

  constructor() {
    super('La serie no existe');
  }
}

export class SerieInactivaError extends ConflictError {
  override readonly code = 'SERIE_INACTIVA';

  constructor() {
    super('La serie está desactivada');
  }
}

export class SerieAgotadaError extends ConflictError {
  override readonly code = 'SERIE_AGOTADA';

  constructor() {
    super('La serie llegó a su número máximo');
  }
}
