import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { ProveedorIdentidad } from '../../application/ports/proveedor-identidad.port.js';
import { IdentidadNoDisponibleError } from '../../domain/errores.js';

export interface OpcionesSupabaseAdmin {
  url: string;
  /** Secret key del proyecto. Solo `apps/api` (regla 9). */
  secretKey: string;
}

/**
 * Cliente de servidor sin sesión: no guarda ni refresca tokens. `implicit` deja el token de sesión
 * en el fragmento del enlace; PKCE necesitaría guardar el verificador entre peticiones.
 */
export class SupabaseAdminProveedor implements ProveedorIdentidad {
  private readonly cliente: SupabaseClient;

  constructor(op: OpcionesSupabaseAdmin) {
    this.cliente = createClient(op.url, op.secretKey, {
      auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false, flowType: 'implicit' },
    });
  }

  async invitar(correo: string, nombre: string, redirectTo: string): Promise<{ usuarioId: string }> {
    const { data, error } = await this.cliente.auth.admin.inviteUserByEmail(correo, { data: { nombre }, redirectTo });
    if (error || !data.user) throw new IdentidadNoDisponibleError(error?.code ?? 'sin_usuario');
    return { usuarioId: data.user.id };
  }

  async enviarEnlace(correo: string, redirectTo: string): Promise<void> {
    const { error } = await this.cliente.auth.signInWithOtp({ email: correo, options: { shouldCreateUser: false, emailRedirectTo: redirectTo } });
    if (error) throw new IdentidadNoDisponibleError(error.code ?? 'otp');
  }
}
