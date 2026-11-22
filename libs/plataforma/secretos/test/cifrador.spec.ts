import { randomBytes } from 'node:crypto';
import { SecretoCorruptoError } from '../src/domain/errores.js';
import { CifradorAesGcm } from '../src/infrastructure/crypto/cifrador.aes-gcm.js';

const DATOS_ASOCIADOS = 'sec.secreto|t-1|s-1|fe.clave_certificado';
const BYTES_ETIQUETA = 16;

describe('CifradorAesGcm', () => {
  const cifrador = new CifradorAesGcm();
  const clave = cifrador.claveAleatoria();
  const texto = new TextEncoder().encode('clave-del-certificado');

  it('ida y vuelta devuelve los mismos bytes', () => {
    const { cifrado, iv } = cifrador.cifrar(clave, texto, DATOS_ASOCIADOS);

    expect(cifrador.descifrar(clave, cifrado, iv, DATOS_ASOCIADOS)).toEqual(new Uint8Array(texto));
  });

  it('el cifrado lleva la etiqueta de 16 bytes y un IV de 12', () => {
    const { cifrado, iv } = cifrador.cifrar(clave, texto, DATOS_ASOCIADOS);

    expect(cifrado).toHaveLength(texto.length + BYTES_ETIQUETA);
    expect(iv).toHaveLength(12);
    expect(Buffer.from(cifrado).includes(Buffer.from(texto))).toBe(false);
  });

  it('el mismo texto da IV y cifrado distintos en cada cifrado', () => {
    const primero = cifrador.cifrar(clave, texto, DATOS_ASOCIADOS);
    const segundo = cifrador.cifrar(clave, texto, DATOS_ASOCIADOS);

    expect(Buffer.from(primero.iv).equals(Buffer.from(segundo.iv))).toBe(false);
    expect(Buffer.from(primero.cifrado).equals(Buffer.from(segundo.cifrado))).toBe(false);
  });

  it('las claves aleatorias tienen 32 bytes y no se repiten', () => {
    expect(clave).toHaveLength(32);
    expect(Buffer.from(cifrador.claveAleatoria()).equals(Buffer.from(clave))).toBe(false);
  });

  it('con otra AAD falla con SecretoCorruptoError', () => {
    const { cifrado, iv } = cifrador.cifrar(clave, texto, DATOS_ASOCIADOS);

    expect(() => cifrador.descifrar(clave, cifrado, iv, 'sec.secreto|t-2|s-1|fe.clave_certificado')).toThrow(SecretoCorruptoError);
  });

  it('un byte alterado del cifrado o de la etiqueta falla con SecretoCorruptoError', () => {
    const { cifrado, iv } = cifrador.cifrar(clave, texto, DATOS_ASOCIADOS);

    for (const posicion of [0, cifrado.length - 1]) {
      const alterado = Uint8Array.from(cifrado);
      alterado[posicion] = (alterado[posicion] ?? 0) ^ 1;
      expect(() => cifrador.descifrar(clave, alterado, iv, DATOS_ASOCIADOS)).toThrow(SecretoCorruptoError);
    }
  });

  it('con otra clave, otro IV o un cifrado truncado falla con SecretoCorruptoError', () => {
    const { cifrado, iv } = cifrador.cifrar(clave, texto, DATOS_ASOCIADOS);

    expect(() => cifrador.descifrar(randomBytes(32), cifrado, iv, DATOS_ASOCIADOS)).toThrow(SecretoCorruptoError);
    expect(() => cifrador.descifrar(clave, cifrado, randomBytes(12), DATOS_ASOCIADOS)).toThrow(SecretoCorruptoError);
    expect(() => cifrador.descifrar(clave, cifrado.subarray(0, BYTES_ETIQUETA), iv, DATOS_ASOCIADOS)).toThrow(SecretoCorruptoError);
    expect(() => cifrador.descifrar(clave, cifrado, iv.subarray(0, 11), DATOS_ASOCIADOS)).toThrow(SecretoCorruptoError);
  });

  it('cifra un .pfx binario de 50 KB', () => {
    const pfx = randomBytes(50 * 1024);
    const { cifrado, iv } = cifrador.cifrar(clave, pfx, DATOS_ASOCIADOS);

    expect(Buffer.from(cifrador.descifrar(clave, cifrado, iv, DATOS_ASOCIADOS)).equals(pfx)).toBe(true);
  });
});
