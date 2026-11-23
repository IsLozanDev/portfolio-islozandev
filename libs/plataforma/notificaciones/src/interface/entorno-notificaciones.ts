import { z } from 'zod';

const AMBIENTE_PRODUCCION = 'production';
const LARGO_MINIMO_SAL = 32;

// `VARIABLE=` en un .env llega como texto vacío: cuenta como no configurada.
const opcional = <Esquema extends z.ZodType>(esquema: Esquema) =>
  z.preprocess((valor) => (valor === '' ? undefined : valor), esquema.optional());

/**
 * Variables de TR-NOT que validan apps/api y apps/worker con zod (regla 9: la API key y el secreto del webhook
 * solo viven en el entorno de esas dos apps). `NOT_REMITENTE` admite `"Nombre <correo@dominio>"`.
 */
export const camposEntornoNotificaciones = {
  RESEND_API_KEY: opcional(z.string().trim().min(1)),
  RESEND_WEBHOOK_SECRET: opcional(z.string().trim().min(1)),
  NOT_REMITENTE: opcional(z.string().trim().min(3).max(320)),
  NOT_SAL_DESTINO: opcional(z.string().min(LARGO_MINIMO_SAL)),
};

export type EntornoNotificaciones = z.infer<z.ZodObject<typeof camposEntornoNotificaciones>>;

const OBLIGATORIAS_EN_PRODUCCION = Object.keys(camposEntornoNotificaciones) as (keyof EntornoNotificaciones)[];

/**
 * Para `superRefine` del esquema de la app: en producción las cuatro son obligatorias. En los demás ambientes la
 * app arranca sin ellas y el envío o el webhook lanzan ProveedorNoConfiguradoError. Ningún mensaje lleva un valor.
 */
export function exigirProveedorCorreoEnProduccion(entorno: EntornoNotificaciones & { APP_ENV: string }, contexto: z.RefinementCtx): void {
  if (entorno.APP_ENV !== AMBIENTE_PRODUCCION) return;
  for (const variable of OBLIGATORIAS_EN_PRODUCCION) {
    if (entorno[variable] === undefined) contexto.addIssue({ code: 'custom', path: [variable], message: 'obligatoria en producción' });
  }
}
