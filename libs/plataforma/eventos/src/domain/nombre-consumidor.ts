import { NombreConsumidorInvalidoError } from './errores.js';

const FORMATO_CONSUMIDOR = /^[a-z][a-z0-9-]{2,39}$/;
const PREFIJO_COLA = 'evt-';

/** Clave estable de la cola y de la idempotencia. Cambiarla equivale a un consumidor nuevo. */
export class NombreConsumidor {
  private constructor(readonly valor: string) {}

  static de(valor: string): NombreConsumidor {
    if (!FORMATO_CONSUMIDOR.test(valor)) throw new NombreConsumidorInvalidoError(valor);
    return new NombreConsumidor(valor);
  }

  get cola(): string {
    return `${PREFIJO_COLA}${this.valor}`;
  }
}
