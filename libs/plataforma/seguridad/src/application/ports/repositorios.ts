import type { Ambito } from '../../domain/alcance.js';
import type { Asignacion, Fecha } from '../../domain/asignacion.js';
import type { Invitacion } from '../../domain/invitacion.js';
import type { EstadoMembresia, Membresia } from '../../domain/membresia.js';
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

export type { EstadoMembresia };

export interface MembresiaLeida {
  id: string;
  usuarioId: string;
  estado: EstadoMembresia;
  esPropietario: boolean;
  ultimaSucursalId: string | null;
}

/** Lectura de membresías para autorización; el ciclo de vida va por RepositorioMembresias. */
export interface MembresiasLectura {
  buscar(membresiaId: string): Promise<MembresiaLeida | null>;
  /** La del usuario en el tenant del contexto. */
  deUsuario(usuarioId: string): Promise<MembresiaLeida | null>;
}

/** `seg.membresia.ultima_sucursal_id`: preferencia, no acceso; no sube la versión de seguridad. */
export interface PreferenciaSucursal {
  recordar(membresiaId: string, sucursalId: string): Promise<void>;
}

export interface RepositorioAsignaciones {
  buscar(id: string): Promise<Asignacion | null>;
  guardar(asignacion: Asignacion): Promise<void>;
  /** Vigentes en `hoy` (inclusive en ambos extremos) y no revocadas. */
  vigentesDe(membresiaId: string, hoy: Fecha): Promise<Asignacion[]>;
  /** Todas las no revocadas, vigentes o no: finalizar las revoca (TR-RF-014). */
  noRevocadasDe(membresiaId: string): Promise<Asignacion[]>;
}

export interface RepositorioMembresias {
  buscar(id: string): Promise<Membresia | null>;
  /** La del usuario en el tenant del contexto. */
  deUsuario(usuarioId: string): Promise<Membresia | null>;
  /** ConflictError si ya existe una del usuario en el tenant o si otro la cambió desde que se leyó. */
  guardar(membresia: Membresia): Promise<void>;
  /**
   * Ids de las membresías de propietario ACTIVO del tenant, bloqueadas con FOR UPDATE hasta el
   * commit (TR-RN-010): dos propietarios que se suspenden a la vez no dejan el tenant sin ninguno.
   */
  propietariosActivosParaActualizar(): Promise<string[]>;
}

/** Fila de `seg.invitacion_por_token`: la única lectura antes de conocer el tenant. */
export interface InvitacionResuelta {
  invitacionId: string;
  tenantId: string;
  membresiaId: string;
  usuarioId: string;
  tenantNombre: string;
  expiraEn: Date;
  usadaEn: Date | null;
  anuladaEn: Date | null;
}

export interface RepositorioInvitaciones {
  buscar(id: string): Promise<Invitacion | null>;
  /** Ni usada ni anulada (puede estar vencida). Hay una como máximo por membresía. */
  pendienteDe(membresiaId: string): Promise<Invitacion | null>;
  guardar(invitacion: Invitacion): Promise<void>;
  /** No usa el tenant del contexto. */
  porToken(tokenHash: string): Promise<InvitacionResuelta | null>;
}

/** `seg.usuario` (global, sin RLS): lo crea el trigger de `auth.users`, no la API. */
export interface UsuariosIdentidad {
  porCorreo(correo: string): Promise<{ id: string; nombre: string; tipo: string } | null>;
  /** Solo para usuarios creados por la invitación (el hook lee `seg.usuario.tipo`). */
  marcarInterno(usuarioId: string): Promise<void>;
  /** El hook elige este tenant para el próximo token (PL-06). */
  fijarTenantPreferido(usuarioId: string, tenantId: string): Promise<void>;
}

/** Límite de usuarios por producto del plan (TR-RN-006). */
export interface LimitesPlan {
  /** `limite_usuarios` de la suscripción vigente; null si no tiene límite o no hay suscripción vigente. */
  limite(producto: string): Promise<number | null>;
  /**
   * Usuarios que cuentan para el producto: membresía ACTIVO o INVITADO con invitación pendiente y
   * vigente en `ahora`, con una asignación vigente y no revocada de un rol del producto (directo o
   * por perfil). `excluirUsuarioId` no se cuenta: invitarlo otra vez no suma.
   */
  usados(producto: string, ahora: Date, excluirUsuarioId?: string): Promise<number>;
}

/** Completa un ámbito con la jerarquía de org (empresa de la sucursal, sucursal y empresa de la unidad). */
export interface UbicacionesOrg {
  /** NotFoundError si la empresa, sucursal o unidad no existe en el tenant del contexto. */
  resolver(ambito: Ambito): Promise<Ambito>;
}

export type TipoEventoSeguridad = 'ASIGNACION_OTORGADA' | 'ASIGNACION_REVOCADA' | 'ACCESO_DENEGADO';

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
