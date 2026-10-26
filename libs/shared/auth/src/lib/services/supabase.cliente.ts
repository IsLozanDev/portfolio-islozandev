import { DOCUMENT, inject, Injectable } from '@angular/core';
import { createBrowserClient, type CookieOptionsWithName } from '@supabase/ssr';
import type { InitializeResult, SupabaseClient } from '@supabase/supabase-js';
import { CONFIG_AUTH } from '../config/config';

const PROTOCOLO_SEGURO = 'https:';

/** `secure` solo en HTTPS, para que la sesión funcione en `http://localhost`. */
export function opcionesCookie(protocolo: string, dominioCookie: string | undefined): CookieOptionsWithName {
  return {
    path: '/',
    sameSite: 'lax',
    secure: protocolo === PROTOCOLO_SEGURO,
    ...(dominioCookie ? { domain: dominioCookie } : {}),
  };
}

/**
 * Cliente de Supabase solo para autenticación (ingreso, OAuth, MFA, renovación).
 * Los datos se leen de la API NestJS, nunca con este cliente (regla 8).
 */
@Injectable({ providedIn: 'root' })
export class SupabaseCliente {
  private readonly config = inject(CONFIG_AUTH);
  private readonly documento = inject(DOCUMENT);
  private inicializacion: Promise<InitializeResult> | null = null;

  readonly auth: SupabaseClient['auth'] = createBrowserClient(this.config.supabaseUrl, this.config.supabasePublishableKey, {
    isSingleton: false,
    cookieOptions: opcionesCookie(this.documento.location.protocol, this.config.dominioCookie),
    // Se inicializa a mano para recibir el error que trae la URL del callback.
    auth: { flowType: 'pkce', autoRefreshToken: true, persistSession: true, detectSessionInUrl: true, skipAutoInitialize: true },
  }).auth;

  /** Lee la sesión de la cookie o la canjea desde la URL (PKCE). Se ejecuta una sola vez. */
  inicializar(): Promise<InitializeResult> {
    this.inicializacion ??= this.auth.initialize();
    return this.inicializacion;
  }
}
