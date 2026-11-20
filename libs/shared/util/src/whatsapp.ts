/** E.164: `+`, código de país (nunca empieza en 0) y de 8 a 15 dígitos en total. */
const WHATSAPP_INTERNACIONAL = /^\+[1-9]\d{7,14}$/;

export function validarWhatsapp(valor: string): boolean {
  return WHATSAPP_INTERNACIONAL.test(valor);
}
