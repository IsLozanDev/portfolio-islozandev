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

// Los mensajes de contactos y direcciones no llevan el valor ni la dirección (TR-RNF-026).

export class ContactoDuplicadoError extends ConflictError {
  override readonly code = 'CONTACTO_DUPLICADO';

  constructor() {
    super('La persona ya tiene ese contacto');
  }
}

export class CelularPrincipalObligatorioError extends ValidationError {
  override readonly code = 'CELULAR_PRINCIPAL_OBLIGATORIO';

  constructor() {
    super('La persona debe conservar un celular principal');
  }
}

export class DireccionInvalidaError extends ValidationError {
  override readonly code = 'DIRECCION_INVALIDA';
}

export class UbigeoNoVigenteError extends ValidationError {
  override readonly code = 'UBIGEO_NO_VIGENTE';

  constructor() {
    super('El ubigeo no existe o no está vigente');
  }
}

export class ContactoNoEncontradoError extends NotFoundError {
  override readonly code = 'CONTACTO_NO_ENCONTRADO';

  constructor() {
    super('La persona no tiene ese contacto');
  }
}

export class DireccionNoEncontradaError extends NotFoundError {
  override readonly code = 'DIRECCION_NO_ENCONTRADA';

  constructor() {
    super('La persona no tiene esa dirección');
  }
}

/** La versión que leyó el cliente ya no es la de la persona. La carrera dentro de la transacción sigue como `conflict`. */
export class VersionObsoletaPersonaError extends ConflictError {
  override readonly code = 'VERSION_OBSOLETA';

  constructor() {
    super('La persona cambió desde que se leyó; vuelva a cargarla');
  }
}
