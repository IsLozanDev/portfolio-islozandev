export const PARAMETRO_RETORNO = 'returnUrl';
const INICIO_DE_RUTA_INTERNA = '/';
/** `//otro.sitio` y `/\otro.sitio` los navegadores los leen como otro origen. */
const PREFIJOS_DE_OTRO_ORIGEN = ['//', '/\\'];

/** `returnUrl` solo si es una ruta interna de la app (TR-RNF-012: sin redirección abierta). */
export function rutaDeRetorno(valor: string | null | undefined, porDefecto: string): string {
  if (!valor || !valor.startsWith(INICIO_DE_RUTA_INTERNA)) return porDefecto;
  if (PREFIJOS_DE_OTRO_ORIGEN.some((prefijo) => valor.startsWith(prefijo))) return porDefecto;
  return valor;
}
