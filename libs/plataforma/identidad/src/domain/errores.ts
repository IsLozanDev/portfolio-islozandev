import { DomainError, NotFoundError, ValidationError } from '@vitrina/plataforma/kernel';
import type { MotivoInvalidez } from '@vitrina/shared/util';

export class DocumentoInvalidoError extends ValidationError {
  override readonly code = 'DOCUMENTO_INVALIDO';

  constructor(readonly motivo: MotivoInvalidez) {
    super(`Documento inválido: ${motivo}`);
  }
}

/** CE y pasaporte solo se validan: ningún proveedor los consulta. */
export class TipoNoConsultableError extends ValidationError {
  override readonly code = 'TIPO_NO_CONSULTABLE';

  constructor() {
    super('Ese tipo de documento no se puede consultar');
  }
}

export class DocumentoNoEncontradoError extends NotFoundError {
  override readonly code = 'NO_ENCONTRADO';

  constructor() {
    super('El documento no existe en el proveedor');
  }
}

/** TR-RNF-007: el cliente sigue con el registro manual. */
export class ProveedorNoDisponibleError extends DomainError {
  readonly code = 'PROVEEDOR_NO_DISPONIBLE';

  constructor() {
    super('Ningún proveedor de identidad respondió');
  }
}
