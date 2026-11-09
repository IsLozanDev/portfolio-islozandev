import type { EntradaAccesoSensible, EntradaAuditoria } from '../../domain/entradas.js';

/**
 * Registro de auditoría en la transacción del caso de uso que lo llama (TR-RF-084, TR-RF-085). Exige
 * `UnitOfWork.run` activo: si la operación se revierte no queda registro, y si el registro falla la
 * operación no se confirma (TR-RNF-013).
 *
 * La inserción toma un bloqueo por tenant hasta el fin de la transacción: conviene llamarlo al final
 * del caso de uso para no frenar a otras transacciones del mismo tenant.
 */
export interface AuditoriaPort {
  registrar(entrada: EntradaAuditoria): Promise<void>;
  registrarAccesoSensible(entrada: EntradaAccesoSensible): Promise<void>;
}

export const AUDITORIA = Symbol('AUDITORIA');
