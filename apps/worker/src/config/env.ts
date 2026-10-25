import { z } from 'zod';

const entero = (defecto: number) => z.coerce.number().int().positive().default(defecto);

// Sin SUPABASE_SECRET_KEY: solo la recibe apps/api (regla 9).
const esquema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  REDIS_URL: z.url({ protocol: /^rediss?$/ }),
  EVT_INTERVALO_MS: entero(1000),
  // TR-RN-035: el relay no lee filas más nuevas que el margen.
  EVT_MARGEN_SEG: z.coerce.number().int().nonnegative().default(2),
  EVT_LOTE: entero(500),
  EVT_REBARRIDO_SEG: entero(60),
  EVT_VENTANA_SEG: entero(300),
  // RF-095: intentos por entrega antes de la cola de fallidos.
  EVT_INTENTOS: entero(8),
  EVT_BACKOFF_MS: entero(5000),
  EVT_BACKOFF_MAX_MS: entero(600_000),
  EVT_CONCURRENCIA: entero(5),
});

export type Config = z.infer<typeof esquema>;

export function cargarConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const resultado = esquema.safeParse(env);
  if (!resultado.success) {
    // Solo la ruta: el mensaje de zod puede arrastrar el valor, y DATABASE_URL lleva la clave.
    const detalle = resultado.error.issues.map((problema) => `${problema.path.join('.')}: ${problema.code}`).join('; ');
    throw new Error(`Variables de entorno inválidas: ${detalle}`);
  }
  return resultado.data;
}
