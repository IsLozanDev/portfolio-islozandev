import { CatalogoInvalidoError } from './errores.js';

const FORMATO = /^[A-Z][A-Z0-9_]{2,59}$/;

/** Código de catálogo: de 3 a 60 mayúsculas, dígitos o guion bajo, empezando por letra (MEDIO_PAGO). */
export class CodigoCatalogo {
  private constructor(readonly valor: string) {}

  static de(valor: string): CodigoCatalogo {
    if (!FORMATO.test(valor)) {
      throw new CatalogoInvalidoError('El código debe tener de 3 a 60 mayúsculas, dígitos o guion bajo');
    }
    return new CodigoCatalogo(valor);
  }

  toString(): string {
    return this.valor;
  }
}
