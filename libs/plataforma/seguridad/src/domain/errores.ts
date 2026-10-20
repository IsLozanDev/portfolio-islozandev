import { DomainError } from '@vitrina/plataforma/kernel';

/** El motivo es solo para el log; la respuesta HTTP no lo expone. */
export class TokenInvalidoError extends DomainError {
  readonly code = 'TOKEN_INVALIDO';

  constructor(readonly motivo: string) {
    super(`Token inválido: ${motivo}`);
  }
}

export class MfaRequeridaError extends DomainError {
  readonly code = 'MFA_REQUERIDA';

  constructor(readonly maxEdadSeg: number) {
    super(`Se requiere MFA de ${maxEdadSeg} s como máximo`);
  }
}

export class AutenticacionNoDisponibleError extends DomainError {
  readonly code = 'AUTENTICACION_NO_DISPONIBLE';

  constructor() {
    super('No se pudo obtener el JWKS del proveedor de identidad');
  }
}
