export class TokenInvalidoError extends Error {
  constructor(public readonly motivo: string) { super(`Token inválido: ${motivo}`); }
}
export class AccesoDenegadoError extends Error {
  constructor(public readonly codigo: 'SIN_TENANT' | 'SIN_SUCURSAL' | 'SIN_PERMISO' | 'MFA_REQUERIDA' | 'SUCURSAL_NO_ASIGNADA', mensaje: string) { super(mensaje); }
}
