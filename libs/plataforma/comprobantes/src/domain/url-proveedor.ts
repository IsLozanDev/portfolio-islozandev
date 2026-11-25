import { UrlProveedorNoPermitidaError } from './errores.js';
import type { AmbienteEmisor } from './estado-emisor.js';

/** URL fijas por ambiente que declara el ítem del catálogo. */
export interface UrlsPorAmbiente {
  urlBeta: string | null;
  urlProduccion: string | null;
}

const PROTOCOLO_SEGURO = 'https:';
/** `URL` deja el puerto vacío cuando es el de https. */
const PUERTO_HTTPS_IMPLICITO = '';

function interpretar(url: string): URL {
  try {
    return new URL(url);
  } catch {
    throw new UrlProveedorNoPermitidaError();
  }
}

/**
 * Anti-SSRF: un tenant con `plat.fe.configurar` no debe hacer que el worker llame a hosts arbitrarios. https, host
 * exacto en `dominiosPermitidos` (del catálogo), sin usuario ni clave en la URL y sin otro puerto que el 443.
 */
export function exigirUrlPermitida(url: string, dominiosPermitidos: readonly string[]): string {
  const limpia = url.trim();
  const interpretada = interpretar(limpia);
  const permitida =
    interpretada.protocol === PROTOCOLO_SEGURO &&
    interpretada.username === '' &&
    interpretada.password === '' &&
    interpretada.port === PUERTO_HTTPS_IMPLICITO &&
    dominiosPermitidos.some((dominio) => dominio.toLowerCase() === interpretada.hostname);
  if (!permitida) throw new UrlProveedorNoPermitidaError();
  return limpia;
}

/** Con `urlProduccion` en el ítem la URL es la del ambiente y el tenant no escribe URL; si no, null (manda `url_proveedor`). */
export function urlSegunAmbiente(urls: UrlsPorAmbiente, ambiente: AmbienteEmisor): string | null {
  if (urls.urlProduccion === null) return null;
  return ambiente === 'PRODUCCION' ? urls.urlProduccion : urls.urlBeta;
}
