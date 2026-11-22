export interface TextoCifrado {
  /** Texto cifrado seguido de la etiqueta GCM de 16 bytes. */
  cifrado: Uint8Array;
  /** 12 bytes aleatorios, nuevos en cada cifrado. */
  iv: Uint8Array;
}

/** AES-256-GCM. `datosAsociados` es la AAD: si no coincide al descifrar, falla la etiqueta. */
export interface Cifrador {
  cifrar(clave: Uint8Array, texto: Uint8Array, datosAsociados: string): TextoCifrado;
  /** SecretoCorruptoError si la etiqueta no pasa (cifrado alterado, otra AAD u otra clave). */
  descifrar(clave: Uint8Array, cifrado: Uint8Array, iv: Uint8Array, datosAsociados: string): Uint8Array;
  claveAleatoria(): Uint8Array;
}
