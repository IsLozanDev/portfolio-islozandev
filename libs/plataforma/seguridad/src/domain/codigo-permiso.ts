import { ValidationError } from '@vitrina/plataforma/kernel';

const FORMATO = /^[a-z]{2,5}\.[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/;

/** `producto.recurso.accion` (TR-RN-007). El prefijo es el código del producto en minúsculas. */
export class CodigoPermiso {
  private constructor(
    readonly valor: string,
    readonly productoCodigo: string,
  ) {}

  static esValido(valor: string): boolean {
    return FORMATO.test(valor);
  }

  static de(valor: string, productoCodigo?: string): CodigoPermiso {
    if (!CodigoPermiso.esValido(valor)) {
      throw new ValidationError(`Código de permiso inválido: ${valor} (formato producto.recurso.accion)`);
    }
    const producto = valor.slice(0, valor.indexOf('.')).toUpperCase();
    if (productoCodigo !== undefined && producto !== productoCodigo) {
      throw new ValidationError(`El permiso ${valor} no pertenece al producto ${productoCodigo}`);
    }
    return new CodigoPermiso(valor, producto);
  }

  toString(): string {
    return this.valor;
  }
}
