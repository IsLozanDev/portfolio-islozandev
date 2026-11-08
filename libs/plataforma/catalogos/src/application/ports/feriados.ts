import type { Feriado } from '../../domain/feriados/feriado.js';

/** Feriados globales y del tenant del contexto, dentro de la transacción activa. */
export interface RepositorioFeriados {
  /** null si no existe, el id no es un UUID o es de otro tenant (RLS). */
  buscar(id: string): Promise<Feriado | null>;
  /** Regla de duplicado de TR-CA-077 (`cat.feriado_choca`). `excluirId`: el que se está editando. */
  choca(feriado: Feriado, excluirId: string | null): Promise<boolean>;
  /**
   * Feriado del tenant del contexto o de una de sus sucursales. `versionAnterior` null crea. false si la versión
   * no coincide. SucursalNoEncontradaError si la sucursal no es del tenant.
   */
  guardarDelTenant(feriado: Feriado, versionAnterior: number | null): Promise<boolean>;
  /** false si no existe en el tenant del contexto o la versión no coincide. */
  eliminarDelTenant(id: string, version: number): Promise<boolean>;
  /** Con la función SECURITY DEFINER. `versionAnterior` null crea. false si la versión no coincide. */
  guardarGlobal(feriado: Feriado, versionAnterior: number | null): Promise<boolean>;
  eliminarGlobal(id: string, version: number): Promise<boolean>;
  /**
   * Los que pueden aplicar en `anio`: globales, del tenant y de sus sucursales (con `sucursalId`, solo los de
   * esa). Incluye los recurrentes de años anteriores; la fecha del año la calcula el agregado.
   */
  delAnio(anio: number, sucursalId: string | null): Promise<Feriado[]>;
}
