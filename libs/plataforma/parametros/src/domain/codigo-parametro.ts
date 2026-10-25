import { ValidationError } from '@vitrina/plataforma/kernel';

// Misma regla que CodigoPermiso de seg: el prefijo es el código del producto en minúsculas.
const FORMATO = /^[a-z]{2,5}\.[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/;
const LONGITUD_MAXIMA = 80;

/** `producto.ambito.nombre`, de 3 a 80 caracteres (TR-RF-030). */
export class CodigoParametro {
  private constructor(readonly valor: string) {}

  static de(valor: string, productoCodigo: string): CodigoParametro {
    if (valor.length > LONGITUD_MAXIMA || !FORMATO.test(valor)) {
      throw new ValidationError(`Código de parámetro inválido: ${valor} (formato producto.ambito.nombre)`);
    }
    if (valor.slice(0, valor.indexOf('.')).toUpperCase() !== productoCodigo) {
      throw new ValidationError(`El parámetro ${valor} no pertenece al producto ${productoCodigo}`);
    }
    return new CodigoParametro(valor);
  }

  toString(): string {
    return this.valor;
  }
}
