export const BOVEDA_SECRETOS = Symbol('BovedaSecretos');

/**
 * Secretos del tenant cifrados por sobre (TR-RNF-113). Tenant y usuario salen del TenantContext. Cada operación se une
 * a la transacción del llamador si la hay (UnitOfWork.run): si el caso de uso del consumidor se revierte, no queda
 * secreto ni auditoría. Sin claves maestras configuradas, guardar, leer y rotar lanzan BovedaNoConfiguradaError.
 */
export interface BovedaSecretos {
  /** `tipo` con formato `componente.nombre`; valor de 1 byte a 64 KiB. Devuelve el id del secreto. */
  guardar(tipo: string, valor: Uint8Array): Promise<string>;
  /** SecretoNoEncontradoError si no existe en el tenant. */
  leer(secretoId: string): Promise<Uint8Array>;
  /** Mismo id, versión + 1. SecretoModificadoError si otra rotación ganó. */
  rotar(secretoId: string, valor: Uint8Array): Promise<void>;
  /** Borrado físico; idempotente. */
  eliminar(secretoId: string): Promise<void>;
}
