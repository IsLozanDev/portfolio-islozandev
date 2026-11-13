import type { ConfigAuth } from '@vitrina/shared/auth';
import type { OrigenesVolverA } from '@vitrina/shared/shell';

/**
 * Staging (spec 21). Solo valores públicos. La API llega por el rewrite `/v1` de Vercel (mismo origen) y sin
 * `dominioCookie`: en `*.vercel.app` la cookie no se comparte entre apps y cada una pide su ingreso.
 * Datos de `docs/ops/staging.md`.
 */
export const environment = {
  production: true,
  auth: {
    supabaseUrl: 'https://cswftpxqkuxgtzfmqhzl.supabase.co',
    supabasePublishableKey: 'sb_publishable_uBjAFeJBLGeN0cfRzibJig_nm04M3w7',
    apiUrl: '/v1',
  } satisfies ConfigAuth,
  origenesVolverA: { 'https://vitrina-consola-staging.vercel.app': 'Consola de plataforma' } satisfies OrigenesVolverA,
};
