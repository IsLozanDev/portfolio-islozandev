import { ConflictError, DomainError, ForbiddenError, NotFoundError, ValidationError } from '@vitrina/plataforma/kernel';

// Ningún mensaje lleva el valor del secreto, la clave de datos ni una clave maestra: los mensajes llegan a
// logs y respuestas (TR-RNF-026).

export class TipoSecretoInvalidoError extends ValidationError {
  override readonly code = 'TIPO_SECRETO_INVALIDO';

  constructor() {
    super('El tipo del secreto debe tener el formato componente.nombre, en minúsculas y hasta 60 caracteres');
  }
}

export class ValorSecretoInvalidoError extends ValidationError {
  override readonly code = 'VALOR_SECRETO_INVALIDO';

  constructor(bytesMaximos: number) {
    super(`El valor del secreto va de 1 a ${bytesMaximos} bytes`);
  }
}

export class ClaveMaestraInvalidaError extends DomainError {
  readonly code = 'CLAVE_MAESTRA_INVALIDA';
}

/** La clave de datos del tenant está envuelta con una versión de maestra que no está configurada. */
export class ClaveMaestraDesconocidaError extends DomainError {
  readonly code = 'CLAVE_MAESTRA_DESCONOCIDA';

  constructor(readonly version: number) {
    super(`La versión ${version} de la clave maestra no está configurada`);
  }
}

export class SecretoNoEncontradoError extends NotFoundError {
  override readonly code = 'SECRETO_NO_ENCONTRADO';

  constructor() {
    super('El secreto no existe en el tenant');
  }
}

export class BovedaNoConfiguradaError extends DomainError {
  readonly code = 'BOVEDA_NO_CONFIGURADA';

  constructor() {
    super('La bóveda no tiene claves maestras: configure SEC_CLAVES_MAESTRAS y SEC_CLAVE_ACTIVA');
  }
}

/** Falló la etiqueta GCM: el cifrado se alteró, se movió de fila o se descifra con otra clave. */
export class SecretoCorruptoError extends DomainError {
  readonly code = 'SECRETO_CORRUPTO';

  constructor() {
    super('El secreto no se pudo descifrar: el cifrado no corresponde a su fila o a su clave');
  }
}

/** `creado_por` y `rotado_por` exigen el usuario del contexto. */
export class SecretoSinActorError extends ForbiddenError {
  override readonly code = 'ACTOR_REQUERIDO';

  constructor() {
    super('Guardar o rotar un secreto exige un usuario en el contexto');
  }
}

export class SecretoModificadoError extends ConflictError {
  override readonly code = 'SECRETO_MODIFICADO';

  constructor() {
    super('El secreto fue rotado o eliminado por otra operación');
  }
}
