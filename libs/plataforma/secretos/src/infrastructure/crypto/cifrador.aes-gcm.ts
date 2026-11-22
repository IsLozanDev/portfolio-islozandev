import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import type { Cifrador, TextoCifrado } from '../../application/ports/cifrador.js';
import { BYTES_CLAVE } from '../../domain/claves-maestras.js';
import { SecretoCorruptoError } from '../../domain/errores.js';

const ALGORITMO = 'aes-256-gcm';
const BYTES_IV = 12;
const BYTES_ETIQUETA = 16;

/** AES-256-GCM de node:crypto. Con una clave por tenant y pocos cifrados, el IV aleatorio de 12 bytes basta. */
export class CifradorAesGcm implements Cifrador {
  cifrar(clave: Uint8Array, texto: Uint8Array, datosAsociados: string): TextoCifrado {
    const iv = randomBytes(BYTES_IV);
    const cifrador = createCipheriv(ALGORITMO, clave, iv, { authTagLength: BYTES_ETIQUETA });
    cifrador.setAAD(Buffer.from(datosAsociados, 'utf8'));
    const cuerpo = Buffer.concat([cifrador.update(texto), cifrador.final()]);
    return { cifrado: Buffer.concat([cuerpo, cifrador.getAuthTag()]), iv };
  }

  descifrar(clave: Uint8Array, cifrado: Uint8Array, iv: Uint8Array, datosAsociados: string): Uint8Array {
    if (cifrado.length <= BYTES_ETIQUETA || iv.length !== BYTES_IV) throw new SecretoCorruptoError();
    const cuerpo = cifrado.subarray(0, cifrado.length - BYTES_ETIQUETA);
    const etiqueta = cifrado.subarray(cifrado.length - BYTES_ETIQUETA);
    try {
      const descifrador = createDecipheriv(ALGORITMO, clave, iv, { authTagLength: BYTES_ETIQUETA });
      descifrador.setAAD(Buffer.from(datosAsociados, 'utf8'));
      descifrador.setAuthTag(etiqueta);
      return new Uint8Array(Buffer.concat([descifrador.update(cuerpo), descifrador.final()]));
    } catch {
      throw new SecretoCorruptoError();
    }
  }

  claveAleatoria(): Uint8Array {
    return randomBytes(BYTES_CLAVE);
  }
}
