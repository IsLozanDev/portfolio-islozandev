import { z } from 'zod';

/** `APP_ENV`: Sentry `environment`, atributo `deployment.environment.name` y reglas de secretos por ambiente. */
export const esquemaAmbiente = z.enum(['local', 'test', 'staging', 'production']).default('local');
