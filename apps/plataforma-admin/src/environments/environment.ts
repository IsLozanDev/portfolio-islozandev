import type { ConfigAuth } from '@vitrina/shared/auth';

/** Ambiente dev. Solo valores públicos: la publishable key está pensada para el navegador. */
export const environment = {
  production: false,
  auth: {
    supabaseUrl: 'https://ebkwqvuynccawujsaedh.supabase.co',
    supabasePublishableKey: 'sb_publishable_th39-tnzIiqxPklk6TNVTw_VGtjEDMK',
    apiUrl: '/v1',
  } satisfies ConfigAuth,
};
