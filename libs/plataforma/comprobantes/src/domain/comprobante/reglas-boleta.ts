import { BoletaRequiereAdquirenteError } from '../errores.js';
import { CLIENTES_VARIOS, identificaAlAdquirente, type Adquirente } from './adquirente.js';
import { formatearSoles, type Decimal } from './dinero.js';

/**
 * TR-RN-018: hasta el umbral (incluido, TR-CA-141) la boleta sin adquirente va a «Clientes varios» (TR-CA-139);
 * por encima exige documento y nombre (TR-CA-140).
 */
export function adquirenteDeBoleta(adquirente: Adquirente | null, total: Decimal, umbral: Decimal): Adquirente {
  const identificado = adquirente !== null && identificaAlAdquirente(adquirente);
  if (total.esMayorQue(umbral) && !identificado) throw new BoletaRequiereAdquirenteError(formatearSoles(umbral));
  return adquirente ?? CLIENTES_VARIOS;
}
