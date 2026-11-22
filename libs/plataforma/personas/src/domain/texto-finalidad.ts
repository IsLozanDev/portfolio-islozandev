import { exigirFinalidad, type Finalidad } from './consentimiento.js';
import { TextoFinalidadInvalidoError } from './errores.js';

/** El mismo formato y las mismas cotas que los CHECK de per.texto_finalidad. */
export const FORMATO_VERSION = /^[A-Za-z0-9._-]{1,20}$/;
export const LONGITUD_MINIMA_TEXTO_LEGAL = 20;
export const LONGITUD_MAXIMA_TEXTO_LEGAL = 10_000;

export interface DatosTextoFinalidad {
  id: string;
  finalidad: Finalidad;
  version: string;
  texto: string;
  publicadoPor: string;
  publicadoEn: Date;
}

export interface TextoAPublicar extends Omit<DatosTextoFinalidad, 'finalidad'> {
  finalidad: string;
}

/** Texto legal de una finalidad en el tenant. Publicado no cambia: una corrección es una versión nueva. */
export class TextoFinalidad {
  private constructor(readonly datos: Readonly<DatosTextoFinalidad>) {}

  static publicar(texto: TextoAPublicar): TextoFinalidad {
    const finalidad = exigirFinalidad(texto.finalidad);
    if (!FORMATO_VERSION.test(texto.version)) {
      throw new TextoFinalidadInvalidoError('La versión debe tener de 1 a 20 letras, dígitos, punto, guion o guion bajo');
    }
    // Por caracteres, como char_length en PostgreSQL, no por unidades UTF-16.
    const caracteres = Array.from(texto.texto).length;
    if (caracteres < LONGITUD_MINIMA_TEXTO_LEGAL || caracteres > LONGITUD_MAXIMA_TEXTO_LEGAL) {
      throw new TextoFinalidadInvalidoError(`El texto debe tener entre ${LONGITUD_MINIMA_TEXTO_LEGAL} y ${LONGITUD_MAXIMA_TEXTO_LEGAL} caracteres`);
    }
    return new TextoFinalidad({ ...texto, finalidad });
  }

  static reconstituir(datos: DatosTextoFinalidad): TextoFinalidad {
    return new TextoFinalidad(datos);
  }

  get finalidad(): Finalidad {
    return this.datos.finalidad;
  }

  get version(): string {
    return this.datos.version;
  }
}
