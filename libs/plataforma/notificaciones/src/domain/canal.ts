export const CANALES_NOTIFICACION = ['CORREO', 'SMS', 'WHATSAPP', 'PUSH'] as const;
export type CanalNotificacion = (typeof CANALES_NOTIFICACION)[number];

export const CANAL_CORREO = 'CORREO' satisfies CanalNotificacion;

/** SMS, WhatsApp y push llegan con el spec 104. */
export const CANALES_HABILITADOS: readonly CanalNotificacion[] = [CANAL_CORREO];

export function estaHabilitado(canal: string): boolean {
  return (CANALES_HABILITADOS as readonly string[]).includes(canal);
}
