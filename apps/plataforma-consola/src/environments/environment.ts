import type { ConfigAuth } from '@vitrina/shared/auth';
import type { OrigenesVolverA } from '@vitrina/shared/shell';

/** Ambiente dev. Solo valores públicos: la publishable key está pensada para el navegador. */
export const environment = {
  production: false,
  auth: {
    supabaseUrl: 'https://ebkwqvuynccawujsaedh.supabase.co',
    supabasePublishableKey: 'sb_publishable_th39-tnzIiqxPklk6TNVTw_VGtjEDMK',
    apiUrl: '/v1',
  } satisfies ConfigAuth,
  /** Apps a las que vuelve «Volver a …» tras una entrada con `?volverA=` (U-06). */
  origenesVolverA: { 'http://127.0.0.1:4200': 'Administración' } satisfies OrigenesVolverA,
};
