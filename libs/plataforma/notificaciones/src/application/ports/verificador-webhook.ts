export type EventoProveedor =
  | { tipo: 'ENVIADO' | 'ENTREGADO' | 'LEIDO'; idExterno: string; en: Date }
  | { tipo: 'REBOTE_DURO' | 'QUEJA_SPAM'; idExterno: string; en: Date; detalle: string }
  /** delivery_delayed, clicked, rebote transitorio y cualquier otro tipo. */
  | { tipo: 'IGNORADO'; idExterno?: string };

export type CabecerasWebhook = Readonly<Record<string, string | undefined>>;

export interface VerificadorWebhook {
  /** Firma Svix (`svix-id`, `svix-timestamp`, `svix-signature`) sobre el cuerpo crudo; FirmaWebhookInvalidaError si falla o difiere > 5 min. */
  verificar(cuerpoCrudo: Buffer, cabeceras: CabecerasWebhook): EventoProveedor;
}
