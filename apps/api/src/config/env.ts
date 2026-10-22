import { z } from 'zod';

const esquema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  // Caché de permisos efectivos (TR-RNF-101).
  REDIS_URL: z.url({ protocol: /^rediss?$/ }),
  SUPABASE_URL: z.url({ protocol: /^https?$/ }),
  // TR-RN-009: antigüedad máxima del MFA para @RequiereMfa.
  SEG_MFA_MAX_EDAD_SEG: z.coerce.number().int().positive().default(900),
});

export type Config = z.infer<typeof esquema>;

export function cargarConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const resultado = esquema.safeParse(env);
  if (!resultado.success) {
    // Solo la ruta: el mensaje de zod puede arrastrar el valor, y DATABASE_URL lleva la clave.
    const detalle = resultado.error.issues.map((i) => `${i.path.join('.')}: ${i.code}`).join('; ');
    throw new Error(`Variables de entorno inválidas: ${detalle}`);
  }
  return resultado.data;
}
