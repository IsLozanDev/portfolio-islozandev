import { ConflictError, NotFoundError, ValidationError } from '@vitrina/plataforma/kernel';

export class CatalogoInvalidoError extends ValidationError {
  override readonly code = 'CATALOGO_INVALIDO';
}

export class ItemInvalidoError extends ValidationError {
  override readonly code = 'ITEM_INVALIDO';
}

/** TR-CA-065. */
export class CatalogoNoExisteError extends NotFoundError {
  override readonly code = 'CATALOGO_NO_EXISTE';

  constructor() {
    super('El catálogo no existe');
  }
}

export class ItemNoEncontradoError extends NotFoundError {
  override readonly code = 'ITEM_NO_ENCONTRADO';

  constructor() {
    super('El ítem no existe');
  }
}

export class CatalogoDuplicadoError extends ConflictError {
  override readonly code = 'CATALOGO_DUPLICADO';

  constructor() {
    super('Ya existe un catálogo con ese código');
  }
}

/** TR-CA-069, TR-RN-013. */
export class CodigoItemDuplicadoError extends ConflictError {
  override readonly code = 'CODIGO_DUPLICADO';

  constructor() {
    super('El código ya existe en el catálogo');
  }
}

/** TR-CA-061. */
export class ItemReferenciadoError extends ConflictError {
  override readonly code = 'ITEM_REFERENCIADO';

  constructor() {
    super('El ítem está en uso; cierre su vigencia o inactívelo');
  }
}

/** TR-RN-012, TR-CA-067. */
export class AlcanceNoPermiteError extends ConflictError {
  override readonly code = 'ALCANCE_NO_PERMITE';

  constructor() {
    super('El alcance del catálogo no permite esta operación');
  }
}

export class VersionObsoletaError extends ConflictError {
  override readonly code = 'VERSION_OBSOLETA';

  constructor() {
    super('Otro usuario modificó el registro; recargue');
  }
}
