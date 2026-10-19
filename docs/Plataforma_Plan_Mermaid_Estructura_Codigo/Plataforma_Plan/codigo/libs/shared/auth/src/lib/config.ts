import { InjectionToken } from '@angular/core';

export interface ConfigAuth {
  supabaseUrl: string;          // https://<ref>.supabase.co
  supabasePublishableKey: string; // sb_publishable_... (pública; nunca la service/secret key)
  apiUrl: string;               // https://api.<dominio>/v1
  dominioCookie?: string;       // '.<dominio>' para compartir sesión entre apps (SazónPOS ↔ Administración)
}
export const CONFIG_AUTH = new InjectionToken<ConfigAuth>('CONFIG_AUTH');
