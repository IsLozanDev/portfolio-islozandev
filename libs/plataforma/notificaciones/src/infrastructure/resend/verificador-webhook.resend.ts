import type { Resend, WebhookEventPayload } from 'resend';
import type { CabecerasWebhook, EventoProveedor, VerificadorWebhook } from '../../application/ports/verificador-webhook.js';
import { FirmaWebhookInvalidaError } from '../../domain/errores.js';

const CABECERA_ID = 'svix-id';
const CABECERA_MARCA_DE_TIEMPO = 'svix-timestamp';
const CABECERA_FIRMA = 'svix-signature';
/** `bounce.type` de Resend para el rebote duro; Transient y Undetermined no invalidan el contacto. */
const REBOTE_PERMANENTE = 'Permanent';
const DETALLE_QUEJA = 'complained';

/** Lo único que usa del SDK; las pruebas pueden doblarlo. */
export type WebhooksResend = Pick<Resend['webhooks'], 'verify'>;

/**
 * Firma Svix con el método del SDK (`webhooks.verify`, sobre `standardwebhooks`), que rechaza también las
 * marcas de tiempo con más de 5 min de diferencia. El cuerpo debe ser el crudo: volver a serializar el JSON rompe
 * la firma.
 */
export class VerificadorWebhookResend implements VerificadorWebhook {
  constructor(
    private readonly webhooks: WebhooksResend,
    private readonly secreto: string,
  ) {}

  verificar(cuerpoCrudo: Buffer, cabeceras: CabecerasWebhook): EventoProveedor {
    const id = cabeceras[CABECERA_ID];
    const timestamp = cabeceras[CABECERA_MARCA_DE_TIEMPO];
    const signature = cabeceras[CABECERA_FIRMA];
    if (!id || !timestamp || !signature) throw new FirmaWebhookInvalidaError();
    try {
      return eventoDe(this.webhooks.verify({ payload: cuerpoCrudo.toString('utf8'), headers: { id, timestamp, signature }, webhookSecret: this.secreto }));
    } catch {
      throw new FirmaWebhookInvalidaError();
    }
  }
}

export function eventoDe(aviso: WebhookEventPayload): EventoProveedor {
  const en = new Date(aviso.created_at);
  switch (aviso.type) {
    case 'email.sent':
      return { tipo: 'ENVIADO', idExterno: aviso.data.email_id, en };
    case 'email.delivered':
      return { tipo: 'ENTREGADO', idExterno: aviso.data.email_id, en };
    case 'email.opened':
      return { tipo: 'LEIDO', idExterno: aviso.data.email_id, en };
    case 'email.complained':
      return { tipo: 'QUEJA_SPAM', idExterno: aviso.data.email_id, en, detalle: DETALLE_QUEJA };
    case 'email.bounced':
      if (aviso.data.bounce.type !== REBOTE_PERMANENTE) return { tipo: 'IGNORADO', idExterno: aviso.data.email_id };
      return { tipo: 'REBOTE_DURO', idExterno: aviso.data.email_id, en, detalle: aviso.data.bounce.subType };
    default:
      return { tipo: 'IGNORADO' };
  }
}
