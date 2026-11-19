import type { AnalizadorAntivirus, ResultadoAntivirus, SaludAntivirus } from '../../application/ports/analizador-antivirus.js';

// La cadena de prueba EICAR va partida en dos: escrita entera, el antivirus de la máquina del
// desarrollador o del CI pondría este archivo en cuarentena.
const FIRMA_EICAR = Buffer.from(['X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD', '-ANTIVIRUS-TEST-FILE!$H+H*'].join(''), 'latin1');
export const NOMBRE_FIRMA_EICAR = 'EICAR-Test-File';

/**
 * Antivirus de local y de pruebas (`ARC_ANTIVIRUS=eicar`): detecta solo la cadena de prueba EICAR, en cualquier
 * posición del contenido. Cualquier otro contenido es limpio, así que el worker no arranca en producción con él.
 */
export class AnalizadorFirmaEicar implements AnalizadorAntivirus, SaludAntivirus {
  analizar(contenido: Uint8Array): Promise<ResultadoAntivirus> {
    const infectado = Buffer.from(contenido.buffer, contenido.byteOffset, contenido.byteLength).includes(FIRMA_EICAR);
    return Promise.resolve(infectado ? { limpio: false, firma: NOMBRE_FIRMA_EICAR } : { limpio: true });
  }

  /** Corre en el propio proceso: siempre responde. */
  comprobar(): Promise<void> {
    return Promise.resolve();
  }
}
