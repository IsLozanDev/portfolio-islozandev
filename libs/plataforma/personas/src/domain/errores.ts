import { ConflictError, NotFoundError, ValidationError } from '@vitrina/plataforma/kernel';
import type { MotivoInvalidez } from '@vitrina/shared/util';

/** El mensaje lleva solo el motivo: el número de documento no va a logs (TR-RNF-026 y 111). */
export class DocumentoInvalidoPersonaError extends ValidationError {
  override readonly code = 'DOCUMENTO_INVALIDO';

  constructor(readonly motivo: MotivoInvalidez) {
    super(`Documento inválido: ${motivo}`);
  }
}

/** El catálogo `TIPO_DOC_IDENTIDAD` trae más tipos de los que personas admite. */
export class TipoDocumentoNoAdmitidoError extends ValidationError {
  override readonly code = 'TIPO_DOCUMENTO_NO_ADMITIDO';

  constructor() {
    super('Ese tipo de documento no se admite para registrar personas');
  }
}

export class TipoPersonaIncoherenteError extends ValidationError {
  override readonly code = 'TIPO_PERSONA_INCOHERENTE';

  constructor() {
    super('El tipo de persona no corresponde con el documento o con los datos enviados');
  }
}

export class ContactoInvalidoError extends ValidationError {
  override readonly code = 'CONTACTO_INVALIDO';
}

export class PersonaDuplicadaError extends ConflictError {
  override readonly code = 'PERSONA_DUPLICADA';

  constructor(readonly personaId: string) {
    super('Ya existe una persona con ese documento');
  }
}

export class PersonaNoEncontradaError extends NotFoundError {
  override readonly code = 'NO_ENCONTRADA';

  constructor() {
    super('No existe esa persona');
  }
}

export class ProductoNoSuscritoError extends ValidationError {
  override readonly code = 'PRODUCTO_NO_SUSCRITO';

  constructor() {
    super('Producto no suscrito');
  }
}
