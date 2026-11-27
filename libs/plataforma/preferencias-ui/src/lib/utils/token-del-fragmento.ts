const PARAMETRO_TOKEN = 't';

/** El enlace del pie es `/preferencias#t=<token>`: el fragmento no llega al servidor ni a sus logs. */
export function tokenDelFragmento(fragmento: string | null): string | null {
  if (!fragmento) return null;
  return new URLSearchParams(fragmento).get(PARAMETRO_TOKEN) || null;
}
