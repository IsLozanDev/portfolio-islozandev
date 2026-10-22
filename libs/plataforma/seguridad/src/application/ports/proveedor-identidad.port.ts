/**
 * Admin API del proveedor de identidad (Supabase Auth, ADR-29). Los correos los envía el proveedor;
 * `redirectTo` lleva el token propio de la invitación. Un fallo lanza IdentidadNoDisponibleError.
 */
export interface ProveedorIdentidad {
  /** Crea el usuario y le envía la invitación. El trigger de `auth.users` crea `seg.usuario` con el mismo id. */
  invitar(correo: string, nombre: string, redirectTo: string): Promise<{ usuarioId: string }>;
  /** Enlace de acceso (magic link) para un usuario que ya existe; nunca crea uno. */
  enviarEnlace(correo: string, redirectTo: string): Promise<void>;
}

export const PROVEEDOR_IDENTIDAD = Symbol('PROVEEDOR_IDENTIDAD');
