import type { Perfil } from '../../domain/perfil.js';
import type { PermisoCatalogo, Rol } from '../../domain/rol.js';

// Todas las operaciones corren dentro de UnitOfWork.run y solo ven el tenant del contexto
// (más lo predefinido, que es global). guardar inserta si el agregado es nuevo y, si no,
// actualiza con bloqueo optimista por version: ConflictError si otro lo cambió desde que se leyó.

export interface RepositorioRoles {
  /** Propio del tenant o predefinido. */
  buscar(id: string): Promise<Rol | null>;
  /** Si hay uno propio y uno predefinido con el mismo código, gana el propio. */
  buscarPorCodigo(codigo: string): Promise<Rol | null>;
  buscarVarios(ids: readonly string[]): Promise<Rol[]>;
  guardar(rol: Rol): Promise<void>;
  /** Membresías distintas con una asignación vigente hoy al rol o a un perfil que lo contiene (TR-CA-033). */
  contarMembresiasAfectadas(rolId: string): Promise<number>;
}

export interface RepositorioPerfiles {
  buscar(id: string): Promise<Perfil | null>;
  guardar(perfil: Perfil): Promise<void>;
}

/** Catálogo global de permisos (`seg.permiso`). */
export interface CatalogoPermisos {
  permisos(codigos: readonly string[]): Promise<PermisoCatalogo[]>;
  sensible(codigo: string): Promise<boolean>;
}

/** Productos con suscripción PRUEBA o ACTIVA vigente del tenant del contexto (TR-RN-006). */
export interface ProductosContratados {
  vigentes(): Promise<string[]>;
}

export type EstadoMembresia = 'INVITADO' | 'ACTIVO' | 'SUSPENDIDO';

export interface MembresiaLeida {
  id: string;
  usuarioId: string;
  estado: EstadoMembresia;
  esPropietario: boolean;
  ultimaSucursalId: string | null;
}

/** Lectura de membresías: su ciclo de vida es del spec 08. */
export interface MembresiasLectura {
  buscar(membresiaId: string): Promise<MembresiaLeida | null>;
  /** La del usuario en el tenant del contexto. */
  deUsuario(usuarioId: string): Promise<MembresiaLeida | null>;
}
