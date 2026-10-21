import type { Ambito } from '../../domain/alcance.js';
import type { Asignacion, Fecha } from '../../domain/asignacion.js';
import type { Perfil } from '../../domain/perfil.js';
import type { PermisoCatalogo, Rol } from '../../domain/rol.js';
import type { CambiosManifiesto, CatalogoProducto, Manifiesto, ResumenCambios } from '../../domain/manifiesto.js';

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

export interface RepositorioAsignaciones {
  guardar(asignacion: Asignacion): Promise<void>;
  /** Vigentes en `hoy` (inclusive en ambos extremos). */
  vigentesDe(membresiaId: string, hoy: Fecha): Promise<Asignacion[]>;
}

/** Completa un ámbito con la jerarquía de org (empresa de la sucursal, sucursal y empresa de la unidad). */
export interface UbicacionesOrg {
  /** NotFoundError si la empresa, sucursal o unidad no existe en el tenant del contexto. */
  resolver(ambito: Ambito): Promise<Ambito>;
}

export type TipoEventoSeguridad = 'ASIGNACION_OTORGADA' | 'ACCESO_DENEGADO';

/** `seg.evento_seguridad`, de solo inserción. `usuarioId` es quien actúa. */
export interface BitacoraSeguridad {
  registrar(tipo: TipoEventoSeguridad, usuarioId: string, detalle: Record<string, unknown>): Promise<void>;
}

/** Lo que hace falta para aplicar un manifiesto dentro de una transacción. Es global: no usa tenant. */
export interface SesionManifiesto {
  catalogoActual(productoCodigo: string): Promise<CatalogoProducto>;
  aplicar(manifiesto: Manifiesto, cambios: CambiosManifiesto, registro: { hash: string; resumen: ResumenCambios }): Promise<void>;
}

/**
 * El manifiesto escribe catálogo global y roles predefinidos, que la RLS de la aplicación no
 * permite: el adaptador usa la conexión de migración y su propia transacción, fuera de UnitOfWork.
 */
export interface RepositorioManifiestos {
  transaccion<T>(trabajo: (sesion: SesionManifiesto) => Promise<T>): Promise<T>;
}
