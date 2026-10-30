import type { ConfigAuth } from '@vitrina/shared/auth';
import type { OrigenesVolverA } from '@vitrina/shared/shell';

/** Se llena en el plan de producción, cuando exista el proyecto Supabase de prod. */
export const environment = {
  production: true,
  auth: {
    supabaseUrl: '',
    supabasePublishableKey: '',
    apiUrl: '',
  } satisfies ConfigAuth,
  origenesVolverA: {} satisfies OrigenesVolverA,
};
