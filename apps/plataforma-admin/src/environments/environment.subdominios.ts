import type { ConfigAuth } from '@vitrina/shared/auth';
import type { OrigenesVolverA } from '@vitrina/shared/shell';

/**
 * Dev en subdominios locales (`nx serve <app> --configuration=subdominios`, U-06): las dos apps comparten la
 * cookie de sesión de `.vitrina.test`. Requiere `admin.vitrina.test` y `consola.vitrina.test` en el archivo hosts.
 */
export const environment = {
  production: false,
  auth: {
    supabaseUrl: 'https://ebkwqvuynccawujsaedh.supabase.co',
    supabasePublishableKey: 'sb_publishable_th39-tnzIiqxPklk6TNVTw_VGtjEDMK',
    apiUrl: '/v1',
    dominioCookie: '.vitrina.test',
  } satisfies ConfigAuth,
  origenesVolverA: { 'http://consola.vitrina.test:4201': 'Consola de plataforma' } satisfies OrigenesVolverA,
};
