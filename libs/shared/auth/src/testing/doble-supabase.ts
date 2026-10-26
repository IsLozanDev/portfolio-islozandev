import { provideHttpClient, withInterceptors, type HttpInterceptorFn } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting, type TestRequest } from '@angular/common/http/testing';
import type { EnvironmentProviders, Provider } from '@angular/core';
import type { AuthChangeEvent, AuthError, Session } from '@supabase/supabase-js';
import { vi } from 'vitest';
import { CONFIG_AUTH, resolverConfigAuth, type ConfigAuth } from '../lib/config/config';
import type { MiContextoRespuesta } from '../lib/models/mi-contexto';
import { SupabaseCliente } from '../lib/services/supabase.cliente';

export const API_URL = 'https://api.test/v1';
export const URL_MI_CONTEXTO = `${API_URL}/seg/mi-contexto`;

export const MIRAFLORES = { id: 'sucursal-miraflores', empresa_id: 'empresa-1', codigo: 'MIR', nombre: 'Miraflores' };
export const SURCO = { id: 'sucursal-surco', empresa_id: 'empresa-1', codigo: 'SUR', nombre: 'Surco' };

export function contextoDePrueba(cambios: Partial<MiContextoRespuesta> = {}): MiContextoRespuesta {
  return {
    usuario_id: 'u-1',
    tenant_id: 't-1',
    tipo_usuario: 'EXTERNO',
    aal: 'aal1',
    mfa_vigente: false,
    mfa_en: null,
    sucursales: [MIRAFLORES],
    sucursal_actual: MIRAFLORES.id,
    requiere_seleccion: false,
    sin_accesos: false,
    permisos: ['rest.caja.abrir'],
    menu: [{ codigo: 'rest.caja', padre: null, nombre: 'Caja', ruta: '/caja', icono: 'point_of_sale', orden: 1 }],
    ...cambios,
  };
}

/** Espera a que salga la petición a `mi-contexto` (va tras varios `await` internos). */
export async function esperarMiContexto(http: HttpTestingController): Promise<TestRequest> {
  let peticion: TestRequest | undefined;
  await vi.waitFor(() => {
    peticion = http.expectOne(URL_MI_CONTEXTO);
  });
  return peticion as TestRequest;
}

export async function responderMiContexto(http: HttpTestingController, respuesta = contextoDePrueba()): Promise<TestRequest> {
  const peticion = await esperarMiContexto(http);
  peticion.flush(respuesta);
  return peticion;
}

export const CONFIG_DE_PRUEBA: ConfigAuth = {
  supabaseUrl: 'https://sb.test',
  supabasePublishableKey: 'sb_publishable_prueba',
  apiUrl: API_URL,
};

type RespuestaVacia = { data: object; error: AuthError | null };
type OyenteSesion =(evento: AuthChangeEvent, sesion: Session | null) => void;

export function sesionDePrueba(token = 'token-aal1'): Session {
  return { access_token: token, refresh_token: 'r', expires_in: 3600, token_type: 'bearer', user: { id: 'u-1' } } as Session;
}

/** Doble de `SupabaseCliente` con la forma de la API de auth-js 2.118 que usa la lib. */
export class DobleSupabase {
  private oyentes: OyenteSesion[] = [];
  sesionGuardada: Session | null = null;
  errorDeInicio: AuthError | null = null;

  readonly inicializar = vi.fn(async () => ({ error: this.errorDeInicio }));

  readonly auth = {
    getSession: vi.fn(async () => ({ data: { session: this.sesionGuardada }, error: null })),
    onAuthStateChange: vi.fn((oyente: OyenteSesion) => {
      this.oyentes.push(oyente);
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    }),
    signInWithPassword: vi.fn(async () => ({ data: {}, error: null as AuthError | null })),
    signInWithOAuth: vi.fn(async () => ({ data: {}, error: null as AuthError | null })),
    resetPasswordForEmail: vi.fn(async () => ({ data: {}, error: null as AuthError | null })),
    updateUser: vi.fn(async () => ({ data: {}, error: null as AuthError | null })),
    signOut: vi.fn(async () => ({ error: null })),
    mfa: {
      getAuthenticatorAssuranceLevel: vi.fn(async () => ({
        data: { currentLevel: this.nivelActual, nextLevel: this.nivelSiguiente, currentAuthenticationMethods: [] },
        error: null as AuthError | null,
      })),
      listFactors: vi.fn(async () => ({
        data: { all: this.factores, totp: this.factores.filter((factor) => factor.status === 'verified'), phone: [], webauthn: [] },
        error: null as AuthError | null,
      })),
      unenroll: vi.fn<(parametros: { factorId: string }) => Promise<RespuestaVacia>>(async () => ({ data: {}, error: null })),
      enroll: vi.fn(async () => ({
        data: { id: 'factor-nuevo', type: 'totp', totp: { qr_code: 'data:image/svg+xml;utf-8,<svg/>', secret: 'SECRETO', uri: 'otpauth://x' } },
        error: null as AuthError | null,
      })),
      challengeAndVerify: vi.fn<(parametros: { factorId: string; code: string }) => Promise<RespuestaVacia>>(async () => ({
        data: {},
        error: null,
      })),
    },
  };

  nivelActual: 'aal1' | 'aal2' = 'aal1';
  nivelSiguiente: 'aal1' | 'aal2' = 'aal1';
  factores: { id: string; factor_type: 'totp'; status: 'verified' | 'unverified' }[] = [];

  emitir(evento: AuthChangeEvent, sesion: Session | null): void {
    this.oyentes.forEach((oyente) => oyente(evento, sesion));
  }
}

export function proveerAuthDePrueba(
  doble: DobleSupabase,
  config: Partial<ConfigAuth> = {},
  interceptores: HttpInterceptorFn[] = [],
): (Provider | EnvironmentProviders)[] {
  return [
    provideHttpClient(withInterceptors(interceptores)),
    provideHttpClientTesting(),
    { provide: CONFIG_AUTH, useValue: resolverConfigAuth({ ...CONFIG_DE_PRUEBA, ...config }) },
    { provide: SupabaseCliente, useValue: doble },
  ];
}
