import type { ProveedorEditable } from '../../domain/proveedor-editable.js';

/** idn.proveedor para la consola del operador. Global: no depende del tenant. */
export interface RepositorioProveedores {
  /** Por prioridad, el de menor número primero. */
  listar(): Promise<ProveedorEditable[]>;
  /** Solo prioridad, TTL, timeout y activo. Bloqueo optimista: VersionObsoletaError si la versión no coincide. */
  guardar(proveedor: ProveedorEditable, versionEsperada: number): Promise<void>;
}
