import { createHmac, randomBytes } from 'node:crypto';

const PREFIJO_SECRETO = 'whsec_';
const VERSION_FIRMA = 'v1';
const SEGUNDOS_POR_MINUTO = 60;

export const SECRETO_PRUEBA = `${PREFIJO_SECRETO}${randomBytes(32).toString('base64')}`;

export interface AvisoFirmado {
  cuerpo: Buffer;
  cabeceras: Record<string, string>;
}

/** Firma un aviso como Svix: HMAC-SHA256 de `id.timestamp.cuerpo` con el secreto decodificado. */
export function firmar(aviso: object, opciones: { secreto?: string; haceMinutos?: number; id?: string } = {}): AvisoFirmado {
  const cuerpo = JSON.stringify(aviso);
  const id = opciones.id ?? `msg_${randomBytes(8).toString('hex')}`;
  const timestamp = String(Math.floor(Date.now() / 1000) - (opciones.haceMinutos ?? 0) * SEGUNDOS_POR_MINUTO);
  const clave = Buffer.from((opciones.secreto ?? SECRETO_PRUEBA).slice(PREFIJO_SECRETO.length), 'base64');
  const firma = createHmac('sha256', clave).update(`${id}.${timestamp}.${cuerpo}`).digest('base64');
  return {
    cuerpo: Buffer.from(cuerpo),
    cabeceras: { 'svix-id': id, 'svix-timestamp': timestamp, 'svix-signature': `${VERSION_FIRMA},${firma}` },
  };
}

export function avisoResend(tipo: string, emailId: string, extra: Record<string, unknown> = {}): object {
  return {
    type: tipo,
    created_at: '2026-11-20T15:00:05.000Z',
    data: {
      created_at: '2026-11-20T15:00:00.000Z',
      email_id: emailId,
      message_id: '<x@resend.dev>',
      from: 'Vitrina <a@vitrina.pe>',
      to: ['ana@ejemplo.pe'],
      subject: 'Hola',
      ...extra,
    },
  };
}
