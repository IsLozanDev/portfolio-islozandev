import { HttpClient, HttpHeaders } from '@angular/common/http';
import { computed, DOCUMENT, inject, Injectable, signal } from '@angular/core';
import type { AuthChangeEvent, AuthError, EmailOtpType, Session } from '@supabase/supabase-js';
import { firstValueFrom } from 'rxjs';
import { CONFIG_AUTH } from '../config/config';
import { aErrorAuth, ErrorAuth, type CodigoErrorAuth } from '../models/errores';
import { aContextoUsuario, type ContextoUsuario, type MiContextoRespuesta } from '../models/mi-contexto';
import { PARAMETRO_RETORNO } from '../utils/navegacion';
import { SupabaseCliente } from './supabase.cliente';

export type ProveedorExterno = 'google' | 'azure';
/** Tipos de enlace de correo que llegan con `token_hash` (invitación, enlace mágico, recuperación). */
export type TipoEnlace = Extract<EmailOtpType, 'invite' | 'email' | 'recovery'>;

export const CABECERA_SUCURSAL = 'X-Sucursal-Id';
const RUTA_MI_CONTEXTO = '/seg/mi-contexto';
const EVENTO_SALIDA: AuthChangeEvent = 'SIGNED_OUT';
const PARAMETROS_ERROR_CALLBACK = ['error', 'error_code', 'error_description'];
/** Errores de `recuperarClave` que sí se muestran; el resto se calla para no revelar si la cuenta existe. */
const ERRORES_VISIBLES_AL_RECUPERAR: readonly CodigoErrorAuth[] = ['DEMASIADOS_INTENTOS', 'SIN_CONEXION'];

/** Estado de sesión con signals. Autenticación en Supabase; contexto y permisos desde la API. */
@Injectable({ providedIn: 'root' })
export class SesionService {
  private readonly supabase = inject(SupabaseCliente);
  private readonly config = inject(CONFIG_AUTH);
  private readonly documento = inject(DOCUMENT);
  private readonly http = inject(HttpClient);

  private readonly sesionActual = signal<Session | null>(null);
  private readonly contextoActual = signal<ContextoUsuario | null>(null);
  private inicio: Promise<void> | null = null;
  private errorDeInicio: AuthError | null = null;

  readonly sesion = this.sesionActual.asReadonly();
  readonly contexto = this.contextoActual.asReadonly();
  readonly autenticado = computed(() => this.sesionActual() !== null);
  readonly sucursalId = computed(() => this.contextoActual()?.sucursalActual ?? null);
  readonly permisos = computed<ReadonlySet<string>>(() => new Set(this.contextoActual()?.permisos ?? []));

  /** Idempotente: lo llaman el inicializador de la app y los guards. */
  iniciar(): Promise<void> {
    this.inicio ??= this.leerSesionInicial();
    return this.inicio;
  }

  token(): string | null {
    return this.sesionActual()?.access_token ?? null;
  }

  /** Con una lista basta con tener cualquiera (OR). */
  tiene(permisoOPermisos: string | readonly string[]): boolean {
    const requeridos = typeof permisoOPermisos === 'string' ? [permisoOPermisos] : permisoOPermisos;
    const permisos = this.permisos();
    return requeridos.some((permiso) => permisos.has(permiso));
  }

  /** La API elige la sucursal actual (la indicada, la única o la última usada) y la recuerda. */
  async cargarContexto(sucursalId?: string): Promise<ContextoUsuario> {
    const headers = sucursalId ? new HttpHeaders({ [CABECERA_SUCURSAL]: sucursalId }) : undefined;
    const respuesta = await firstValueFrom(
      this.http.get<MiContextoRespuesta>(this.config.apiUrl + RUTA_MI_CONTEXTO, { headers }),
    );
    const contexto = aContextoUsuario(respuesta);
    this.contextoActual.set(contexto);
    return contexto;
  }

  /** TR-CA-045: recarga permisos y menú con la nueva sucursal, sin volver a autenticar. */
  async seleccionarSucursal(sucursalId: string): Promise<void> {
    await this.cargarContexto(sucursalId);
  }

  async ingresarConClave(correo: string, clave: string): Promise<void> {
    const { error } = await this.supabase.auth.signInWithPassword({ email: correo, password: clave });
    if (error) throw aErrorAuth(error);
  }

  /** `retorno` viaja como `?returnUrl=` en `redirectTo` y Supabase lo devuelve tal cual al callback. */
  async ingresarConProveedor(proveedor: ProveedorExterno, retorno?: string): Promise<void> {
    const { error } = await this.supabase.auth.signInWithOAuth({
      provider: proveedor,
      options: { redirectTo: this.urlDeCallback(retorno) },
    });
    if (error) throw aErrorAuth(error);
  }

  /** Para la página de callback: el canje PKCE ya ocurrió en `iniciar()`. */
  async completarCallback(): Promise<void> {
    await this.iniciar();
    if (this.errorDeInicio || this.urlTraeError() || !this.autenticado()) {
      throw new ErrorAuth('ENLACE_INVALIDO', { cause: this.errorDeInicio });
    }
  }

  async recuperarClave(correo: string): Promise<void> {
    const { error } = await this.supabase.auth.resetPasswordForEmail(correo, {
      redirectTo: this.urlAbsoluta(this.config.rutas.nuevaClave),
    });
    if (!error) return;
    const errorAuth = aErrorAuth(error);
    if (ERRORES_VISIBLES_AL_RECUPERAR.includes(errorAuth.codigo)) throw errorAuth;
  }

  /** Canjea el `token_hash` de un correo por una sesión. Cualquier fallo es un enlace inválido. */
  async verificarEnlace(tokenHash: string, tipo: TipoEnlace): Promise<void> {
    await this.iniciar();
    const { data, error } = await this.supabase.auth.verifyOtp({ token_hash: tokenHash, type: tipo });
    if (error || !data.session) throw new ErrorAuth('ENLACE_INVALIDO', { cause: error });
    this.sesionActual.set(data.session);
  }

  /** Token nuevo para que el hook ponga el `tenant_id` recién aceptado; luego recarga el contexto. */
  async refrescarSesion(): Promise<void> {
    const { data, error } = await this.supabase.auth.refreshSession();
    if (error || !data.session) throw aErrorAuth(error);
    this.sesionActual.set(data.session);
    await this.cargarContexto();
  }

  async actualizarClave(nueva: string): Promise<void> {
    const { error } = await this.supabase.auth.updateUser({ password: nueva });
    if (error) throw aErrorAuth(error);
  }

  async salir(): Promise<void> {
    await this.supabase.auth.signOut({ scope: 'local' });
    this.limpiar();
  }

  private async leerSesionInicial(): Promise<void> {
    const { error } = await this.supabase.inicializar();
    this.errorDeInicio = error;
    const { data } = await this.supabase.auth.getSession();
    this.sesionActual.set(data.session);
    this.supabase.auth.onAuthStateChange((evento, sesion) => this.alCambiarSesion(evento, sesion));
    if (data.session) await this.intentarCargarContexto();
  }

  /** Un fallo de la API no debe tumbar el arranque: `autenticadoGuard` vuelve a pedirlo. */
  private async intentarCargarContexto(): Promise<void> {
    try {
      await this.cargarContexto();
    } catch {
      this.contextoActual.set(null);
    }
  }

  /** Sin llamadas a Supabase aquí: el callback corre dentro de su lock. */
  private alCambiarSesion(evento: AuthChangeEvent, sesion: Session | null): void {
    if (evento === EVENTO_SALIDA) {
      this.limpiar();
      return;
    }
    this.sesionActual.set(sesion);
  }

  private limpiar(): void {
    this.sesionActual.set(null);
    this.contextoActual.set(null);
  }

  private urlAbsoluta(ruta: string): string {
    return this.documento.location.origin + ruta;
  }

  private urlDeCallback(retorno?: string): string {
    const url = new URL(this.urlAbsoluta(this.config.rutas.callback));
    if (retorno) url.searchParams.set(PARAMETRO_RETORNO, retorno);
    return url.toString();
  }

  private urlTraeError(): boolean {
    const { search, hash } = this.documento.location;
    const parametros = [new URLSearchParams(search), new URLSearchParams(hash.replace(/^#/, ''))];
    return parametros.some((lista) => PARAMETROS_ERROR_CALLBACK.some((nombre) => lista.has(nombre)));
  }
}
