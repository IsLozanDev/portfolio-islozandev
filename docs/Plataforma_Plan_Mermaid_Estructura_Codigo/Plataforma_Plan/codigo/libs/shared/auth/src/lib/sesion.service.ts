import { computed, inject, Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import type { Session } from '@supabase/supabase-js';
import { SupabaseCliente } from './supabase.cliente';
import { CONFIG_AUTH } from './config';

export interface ContextoUsuario {
  tenantId: string;
  sucursales: { id: string; nombre: string; empresa: string }[];
  permisos: string[];
  menu: { codigo: string; nombre: string; ruta: string }[];
}

/** Estado de sesión con signals. Autenticación en Supabase; contexto y permisos desde la API. */
@Injectable({ providedIn: 'root' })
export class SesionService {
  private readonly sb = inject(SupabaseCliente);
  private readonly http = inject(HttpClient);
  private readonly cfg = inject(CONFIG_AUTH);

  readonly sesion = signal<Session | null>(null);
  readonly contexto = signal<ContextoUsuario | null>(null);
  readonly sucursalId = signal<string | null>(null);
  readonly autenticado = computed(() => this.sesion() !== null);
  readonly permisos = computed(() => new Set(this.contexto()?.permisos ?? []));

  constructor() {
    this.sb.auth.getSession().then(({ data }) => this.sesion.set(data.session));
    this.sb.auth.onAuthStateChange((_evento, s) => this.sesion.set(s));
  }

  token(): string | null { return this.sesion()?.access_token ?? null; }
  tiene(permiso: string): boolean { return this.permisos().has(permiso); }

  async ingresarConClave(email: string, password: string) {
    const { error } = await this.sb.auth.signInWithPassword({ email, password });
    if (error) throw error;
    await this.cargarContexto();
  }

  async ingresarConProveedor(proveedor: 'google' | 'azure') {
    const { error } = await this.sb.auth.signInWithOAuth({ provider: proveedor, options: { redirectTo: `${location.origin}/auth/callback` } });
    if (error) throw error;
  }

  async recuperarClave(email: string) {
    const { error } = await this.sb.auth.resetPasswordForEmail(email, { redirectTo: `${location.origin}/auth/nueva-clave` });
    if (error) throw error; // la UI muestra siempre el mismo mensaje: no revela si la cuenta existe
  }

  /** ¿Debe pedir el segundo factor ahora? (tiene factor TOTP y la sesión está en aal1) */
  async requiereMfa(): Promise<boolean> {
    const { data, error } = await this.sb.auth.mfa.getAuthenticatorAssuranceLevel();
    if (error) throw error;
    return data.nextLevel === 'aal2' && data.currentLevel !== 'aal2';
  }

  async enrolarTotp() {
    const { data, error } = await this.sb.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'App autenticadora' });
    if (error) throw error;
    return { factorId: data.id, qr: data.totp.qr_code, secreto: data.totp.secret };
  }

  async verificarTotp(factorId: string, codigo: string) {
    const { data: ch, error: e1 } = await this.sb.auth.mfa.challenge({ factorId });
    if (e1) throw e1;
    const { error: e2 } = await this.sb.auth.mfa.verify({ factorId, challengeId: ch.id, code: codigo });
    if (e2) throw e2; // el nuevo token ya viene con aal2
  }

  /** Cambia el tenant activo: la API guarda el preferido y se refresca el token (el hook pone el nuevo tenant_id). */
  async cambiarTenant(tenantId: string) {
    await firstValueFrom(this.http.put(`${this.cfg.apiUrl}/seg/mi-tenant`, { tenantId }));
    const { error } = await this.sb.auth.refreshSession();
    if (error) throw error;
    this.sucursalId.set(null);
    await this.cargarContexto();
  }

  async cargarContexto() {
    const ctx = await firstValueFrom(this.http.get<ContextoUsuario>(`${this.cfg.apiUrl}/seg/mi-contexto`, { params: this.sucursalId() ? { sucursalId: this.sucursalId()! } : {} }));
    this.contexto.set(ctx);
    if (!this.sucursalId() && ctx.sucursales.length === 1) this.sucursalId.set(ctx.sucursales[0].id);
  }

  async seleccionarSucursal(id: string) { this.sucursalId.set(id); await this.cargarContexto(); }

  async salir() {
    await this.sb.auth.signOut({ scope: 'local' });
    this.contexto.set(null); this.sucursalId.set(null);
  }
}
