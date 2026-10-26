import { InjectionToken } from '@angular/core';

export interface RutasAuth {
  ingresar: string;
  mfa: string;
  callback: string;
  nuevaClave: string;
  seleccionarSucursal: string;
  sinAccesos: string;
  prohibido: string;
  inicio: string;
}

export interface ConfigAuth {
  supabaseUrl: string;
  supabasePublishableKey: string;
  /** Base de la API, p. ej. `https://api.<dominio>/v1`. */
  apiUrl: string;
  /** `.<dominio>` para compartir la sesión entre apps (U-06). Sin valor, la cookie es del host. */
  dominioCookie?: string;
  inactividadMinutos?: number;
  rutas?: Partial<RutasAuth>;
}

export interface ConfigAuthResuelta extends Required<Omit<ConfigAuth, 'dominioCookie' | 'rutas'>> {
  dominioCookie?: string;
  rutas: RutasAuth;
}

export const RUTAS_AUTH_POR_DEFECTO: RutasAuth = {
  ingresar: '/auth/ingresar',
  mfa: '/auth/mfa',
  callback: '/auth/callback',
  nuevaClave: '/auth/nueva-clave',
  seleccionarSucursal: '/seleccionar-sucursal',
  sinAccesos: '/sin-accesos',
  prohibido: '/403',
  inicio: '/',
};

/** TR-RNF-014: 30 min por defecto en backoffice. */
export const INACTIVIDAD_MINUTOS_POR_DEFECTO = 30;

export const CONFIG_AUTH = new InjectionToken<ConfigAuthResuelta>('CONFIG_AUTH');

export function resolverConfigAuth(config: ConfigAuth): ConfigAuthResuelta {
  return {
    supabaseUrl: config.supabaseUrl,
    supabasePublishableKey: config.supabasePublishableKey,
    apiUrl: quitarBarraFinal(config.apiUrl),
    dominioCookie: config.dominioCookie,
    inactividadMinutos: config.inactividadMinutos ?? INACTIVIDAD_MINUTOS_POR_DEFECTO,
    rutas: { ...RUTAS_AUTH_POR_DEFECTO, ...config.rutas },
  };
}

function quitarBarraFinal(url: string): string {
  return url.replace(/\/+$/, '');
}
