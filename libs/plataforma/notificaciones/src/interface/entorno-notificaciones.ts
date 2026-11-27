import { z } from 'zod';

const AMBIENTE_PRODUCCION = 'production';
const LARGO_MINIMO_SAL = 32;
const LARGO_MINIMO_CLAVE_ENLACE = 32;

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
  /** Destino de `aud.integridad.rota` (spec 44). Opcional también en producción: sin ella el aviso se omite con un log. */
  NOT_CORREO_OPERACION: opcional(z.string().trim().pipe(z.email())),
  /** Firma del enlace de preferencias del pie (spec 46). Rotarla invalida todos los enlaces. */
  NOT_CLAVE_ENLACE_PREFERENCIAS: opcional(z.string().min(LARGO_MINIMO_CLAVE_ENLACE)),
  /** URL base de plataforma-admin, donde vive `/preferencias`. */
  NOT_URL_PREFERENCIAS: opcional(z.string().trim().pipe(z.url())),
};

export type EntornoNotificaciones = z.infer<z.ZodObject<typeof camposEntornoNotificaciones>>;

const OBLIGATORIAS_EN_PRODUCCION: readonly (keyof EntornoNotificaciones)[] = [
  'RESEND_API_KEY',
  'RESEND_WEBHOOK_SECRET',
  'NOT_REMITENTE',
  'NOT_SAL_DESTINO',
  'NOT_CLAVE_ENLACE_PREFERENCIAS',
  'NOT_URL_PREFERENCIAS',
];

/**
 * Para `superRefine` del esquema de la app: en producción las seis son obligatorias. En los demás ambientes la
 * app arranca sin ellas: el envío o el webhook lanzan ProveedorNoConfiguradoError y, sin las del enlace, el correo
 * sale sin pie. Ningún mensaje lleva un valor.
 */
export function exigirProveedorCorreoEnProduccion(entorno: EntornoNotificaciones & { APP_ENV: string }, contexto: z.RefinementCtx): void {
  if (entorno.APP_ENV !== AMBIENTE_PRODUCCION) return;
  for (const variable of OBLIGATORIAS_EN_PRODUCCION) {
    if (entorno[variable] === undefined) contexto.addIssue({ code: 'custom', path: [variable], message: 'obligatoria en producción' });
  }
}
