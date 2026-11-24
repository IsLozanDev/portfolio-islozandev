import { CanalNoHabilitadoError } from './errores.js';

export const CANALES_NOTIFICACION = ['CORREO', 'SMS', 'WHATSAPP', 'PUSH'] as const;
export type CanalNotificacion = (typeof CANALES_NOTIFICACION)[number];

export const CANAL_CORREO = 'CORREO' satisfies CanalNotificacion;

/** SMS, WhatsApp y push llegan con el spec 104. */
export const CANALES_HABILITADOS: readonly CanalNotificacion[] = [CANAL_CORREO];

export function estaHabilitado(canal: string): boolean {
  return (CANALES_HABILITADOS as readonly string[]).includes(canal);
}

/** El canal de una ruta o un comando: CANAL_NO_HABILITADO si no es uno de los habilitados. */
export function exigirCanalHabilitado(canal: string): CanalNotificacion {
  if (!estaHabilitado(canal)) throw new CanalNoHabilitadoError(canal);
  return canal as CanalNotificacion;
}
