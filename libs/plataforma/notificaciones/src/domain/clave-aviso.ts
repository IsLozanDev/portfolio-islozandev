import { createHash } from 'node:crypto';

const BYTES_UUID = 16;
const POSICION_VERSION = 6;
const POSICION_VARIANTE = 8;
const MASCARA_VERSION = 0x0f;
const VERSION_8 = 0x80;
const MASCARA_VARIANTE = 0x3f;
const VARIANTE_RFC_9562 = 0x80;
const SEPARADOR = '|';
/** Largos de los grupos del UUID en caracteres hexadecimales. */
const GRUPOS_UUID = [8, 4, 4, 4, 12];

/**
 * Clave de idempotencia del aviso de un evento a un destino: UUID v8 con los primeros 16 bytes del SHA-256 de
 * `eventId|destino`. Un reintento del mismo evento a mitad de la lista no duplica el correo ya registrado.
 * El destino se compara sin mayúsculas ni espacios alrededor.
 */
export function claveDeAviso(eventId: string, destino: string): string {
  const bytes = createHash('sha256').update(`${eventId}${SEPARADOR}${destino.trim().toLowerCase()}`).digest().subarray(0, BYTES_UUID);
  bytes[POSICION_VERSION] = (bytes[POSICION_VERSION] & MASCARA_VERSION) | VERSION_8;
  bytes[POSICION_VARIANTE] = (bytes[POSICION_VARIANTE] & MASCARA_VARIANTE) | VARIANTE_RFC_9562;
  return formatoUuid(bytes.toString('hex'));
}

function formatoUuid(hexadecimal: string): string {
  const grupos: string[] = [];
  let inicio = 0;
  for (const largo of GRUPOS_UUID) {
    grupos.push(hexadecimal.slice(inicio, inicio + largo));
    inicio += largo;
  }
  return grupos.join('-');
}
