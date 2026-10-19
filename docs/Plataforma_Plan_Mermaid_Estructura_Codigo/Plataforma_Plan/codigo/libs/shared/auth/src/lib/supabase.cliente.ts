import { inject, Injectable } from '@angular/core';
import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import { CONFIG_AUTH } from './config';

/**
 * Cliente de Supabase SOLO para autenticación (login, OAuth, MFA, refresco).
 * Los datos nunca se leen con este cliente: se consumen de la API NestJS.
 * La sesión se guarda en cookie del dominio padre para que el backoffice del
 * producto y la app de Administración compartan la misma sesión.
 */
@Injectable({ providedIn: 'root' })
export class SupabaseCliente {
  private readonly cfg = inject(CONFIG_AUTH);
  readonly auth: SupabaseClient['auth'] = createBrowserClient(this.cfg.supabaseUrl, this.cfg.supabasePublishableKey, {
    cookieOptions: { domain: this.cfg.dominioCookie, sameSite: 'lax', secure: true, path: '/' },
    auth: { flowType: 'pkce', autoRefreshToken: true, persistSession: true, detectSessionInUrl: true },
  }).auth;
}
