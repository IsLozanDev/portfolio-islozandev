import { ConflictError, NotFoundError, ValidationError } from '@vitrina/plataforma/kernel';
import type { AlcanceParametro } from './tipos.js';

export class ParametroNoDefinidoError extends NotFoundError {
  override readonly code = 'PARAMETRO_NO_DEFINIDO';

  constructor(readonly codigo: string) {
    super(`El parámetro ${codigo} no está definido`);
  }
}

export class ParametroObsoletoError extends ConflictError {
  override readonly code = 'PARAMETRO_OBSOLETO';

  constructor(readonly codigo: string) {
    super('El parámetro fue retirado y no admite valores nuevos');
  }
}

const NIVEL: Record<AlcanceParametro, string> = { TENANT: 'tenant', EMPRESA: 'empresa', SUCURSAL: 'sucursal' };

/** TR-CA-081. */
export class AlcanceNoPermitidoError extends ValidationError {
  override readonly code = 'ALCANCE_NO_PERMITIDO';

  constructor(readonly maximo: AlcanceParametro) {
    super(`Este parámetro se configura como máximo a nivel de ${NIVEL[maximo]}`);
  }
}

/** TR-RN-015. El mensaje es el que ve el usuario (TR-CA-079, TR-CA-082). */
export class ValorInvalidoError extends ValidationError {
  override readonly code = 'VALOR_INVALIDO';
}

export class AmbitoValorInvalidoError extends ValidationError {
  override readonly code = 'AMBITO_INVALIDO';

  constructor(alcance: string) {
    super(`El alcance ${alcance} no corresponde a la empresa o sucursal indicadas`);
  }
}

/** Cada detalle lleva su campo (p. ej. `valor_defecto: Se esperaba un valor NUMERO`). */
export class DefinicionInvalidaError extends ValidationError {
  override readonly code = 'DEFINICION_INVALIDA';

  constructor(readonly detalles: readonly string[]) {
    super(`Definición de parámetro inválida: ${detalles.join('; ')}`);
  }
}

export class ValorNoConfiguradoError extends NotFoundError {
  override readonly code = 'VALOR_NO_CONFIGURADO';

  constructor() {
    super('No hay valor en ese nivel');
  }
}
