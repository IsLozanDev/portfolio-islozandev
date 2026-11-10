export const ALCANCE_ACTOR = Symbol('AlcanceActor');

/** Nivel sobre el que actúa otro componente (p. ej. un valor de parámetro en cfg). Sin unidad. */
export interface DestinoAlcance {
  alcance: 'TENANT' | 'EMPRESA' | 'SUCURSAL';
  empresaId: string | null;
  sucursalId: string | null;
}

/**
 * Para componentes que dependen de seg (PL-10): ¿el actor puede actuar sobre ese nivel del tenant del
 * contexto? Corre dentro de la UnitOfWork del llamador.
 */
export interface AlcanceActor {
  /**
   * true si el actor es propietario o una asignación vigente suya cubre el destino (TR-RN-007).
   * NotFoundError si la empresa o sucursal no existe en el tenant del contexto.
   */
  cubre(usuarioId: string, destino: DestinoAlcance, ahora: Date): Promise<boolean>;
  /**
   * true si el actor es propietario o tiene una asignación vigente de alcance TENANT cuyo rol o perfil
   * incluye el permiso (spec 20b): una asignación TENANT de otro rol no abre lo que pide ese permiso.
   */
  alcanzaTenant(usuarioId: string, permiso: string, ahora: Date): Promise<boolean>;
}
