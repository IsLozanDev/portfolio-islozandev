import type { ConfigAuth } from '@vitrina/shared/auth';

/** Se llena en el plan de producción, cuando exista el proyecto Supabase de prod. */
export const environment = {
  auth: {
    supabaseUrl: '',
    supabasePublishableKey: '',
    apiUrl: '',
  } satisfies ConfigAuth,
};
