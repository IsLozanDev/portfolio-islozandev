import { ConflictError, DomainError, NotFoundError, ValidationError } from '@vitrina/plataforma/kernel';
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

/** TR-RNF-128: con la cuota del mes agotada el cliente pasa a ingreso manual (429 sin Retry-After). */
export class CuotaAgotadaError extends DomainError {
  readonly code = 'CUOTA_AGOTADA';

  constructor() {
    super('Se agotó la cuota mensual de consultas');
  }
}

export class PeriodoInvalidoError extends ValidationError {
  override readonly code = 'PERIODO_INVALIDO';

  constructor() {
    super('El periodo debe tener el formato AAAA-MM');
  }
}

export class PeriodoCerradoError extends ValidationError {
  override readonly code = 'PERIODO_CERRADO';

  constructor() {
    super('No se puede ajustar la cuota de un mes cerrado');
  }
}

export class IncluidasMenorQueConsumidasError extends ValidationError {
  override readonly code = 'INCLUIDAS_MENOR_QUE_CONSUMIDAS';

  constructor() {
    super('Las incluidas no pueden quedar por debajo de las consultas ya consumidas');
  }
}

export class UltimoProveedorActivoError extends ValidationError {
  override readonly code = 'ULTIMO_PROVEEDOR_ACTIVO';

  constructor(readonly tipoDocumento: string) {
    super(`Desactivarlo deja ${tipoDocumento} sin proveedor activo`);
  }
}

export class CuotaNoEncontradaError extends NotFoundError {
  override readonly code = 'CUOTA_NO_ENCONTRADA';

  constructor() {
    super('No hay cuota para ese tenant y periodo');
  }
}

export class ProveedorNoEncontradoError extends NotFoundError {
  override readonly code = 'PROVEEDOR_NO_ENCONTRADO';

  constructor() {
    super('No existe ese proveedor de identidad');
  }
}

export class VersionObsoletaError extends ConflictError {
  override readonly code = 'VERSION_OBSOLETA';

  constructor() {
    super('Otro usuario modificó el registro; recargue');
  }
}
