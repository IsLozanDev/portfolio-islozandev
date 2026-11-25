import { DatosComprobanteInvalidosError } from '../errores.js';

/** Montos con 2 decimales (numeric(14,2)); cantidades, valores unitarios y tasas con 4 (numeric(14,4) y (5,4)). */
export const ESCALA_MONTO = 2;
export const ESCALA_UNITARIO = 4;
export const ESCALA_TASA = 4;
/** Los enteros que caben en numeric(14,2) y numeric(14,4). */
const DIGITOS_ENTEROS_MONTO = 12;
const DIGITOS_ENTEROS_UNITARIO = 10;
const BASE = 10n;
const DOS = 2n;
const DECIMAL_NO_NEGATIVO = /^(\d+)(?:\.(\d+))?$/;

function potenciaDeDiez(exponente: number): bigint {
  return BASE ** BigInt(exponente);
}

/** Mitad hacia arriba, alejándose del cero en los negativos (TR-RN-021). */
function dividirRedondeando(dividendo: bigint, divisor: bigint): bigint {
  const negativo = dividendo < 0n;
  const absoluto = negativo ? -dividendo : dividendo;
  const cociente = absoluto / divisor;
  const redondeado = (absoluto % divisor) * DOS >= divisor ? cociente + 1n : cociente;
  return negativo ? -redondeado : redondeado;
}

/**
 * Decimal de escala fija sobre `bigint`: sin coma flotante en ningún paso. `unidades` es el valor por 10^escala
 * (S/ 118,00 en escala 2 son 11800 unidades). Se eligió frente a `decimal.js`: suma, resta, producto y redondeo
 * a una escala bastan para TR-RN-021 y no suman dependencias.
 */
export class Decimal {
  private constructor(
    readonly unidades: bigint,
    readonly escala: number,
  ) {}

  static cero(escala: number): Decimal {
    return new Decimal(0n, escala);
  }

  /** `campo` va en el error si el texto no es un decimal no negativo que cabe en la escala. */
  static desdeTexto(texto: string, escala: number, campo: string): Decimal {
    const partes = DECIMAL_NO_NEGATIVO.exec(texto);
    const [, enteros = '', decimales = ''] = partes ?? [];
    const digitosEnteros = escala === ESCALA_MONTO ? DIGITOS_ENTEROS_MONTO : DIGITOS_ENTEROS_UNITARIO;
    if (!partes || decimales.length > escala || enteros.replace(/^0+(?=\d)/, '').length > digitosEnteros) {
      throw new DatosComprobanteInvalidosError(`${campo}: «${texto}» no es un importe válido con hasta ${escala} decimales`);
    }
    return new Decimal(BigInt(enteros + decimales.padEnd(escala, '0')), escala);
  }

  sumar(otro: Decimal): Decimal {
    return new Decimal(this.unidades + otro.aEscala(this.escala).unidades, this.escala);
  }

  restar(otro: Decimal): Decimal {
    return new Decimal(this.unidades - otro.aEscala(this.escala).unidades, this.escala);
  }

  /** Producto exacto redondeado a `escala`. */
  multiplicar(otro: Decimal, escala: number): Decimal {
    return new Decimal(this.unidades * otro.unidades, this.escala + otro.escala).aEscala(escala);
  }

  /** Sube la escala sin pérdida o la baja redondeando mitad hacia arriba. */
  aEscala(escala: number): Decimal {
    if (escala === this.escala) return this;
    if (escala > this.escala) return new Decimal(this.unidades * potenciaDeDiez(escala - this.escala), escala);
    return new Decimal(dividirRedondeando(this.unidades, potenciaDeDiez(this.escala - escala)), escala);
  }

  valorAbsoluto(): Decimal {
    return this.unidades < 0n ? new Decimal(-this.unidades, this.escala) : this;
  }

  compararCon(otro: Decimal): number {
    const escala = Math.max(this.escala, otro.escala);
    const diferencia = this.aEscala(escala).unidades - otro.aEscala(escala).unidades;
    if (diferencia === 0n) return 0;
    return diferencia > 0n ? 1 : -1;
  }

  esMayorQue(otro: Decimal): boolean {
    return this.compararCon(otro) > 0;
  }

  esCero(): boolean {
    return this.unidades === 0n;
  }

  /** Texto con todos los decimales de la escala: «118.00». */
  aTexto(): string {
    const signo = this.unidades < 0n ? '-' : '';
    const digitos = this.valorAbsoluto().unidades.toString().padStart(this.escala + 1, '0');
    if (this.escala === 0) return signo + digitos;
    return `${signo}${digitos.slice(0, -this.escala)}.${digitos.slice(-this.escala)}`;
  }
}

/** TR-RN-021: valor de venta, IGV y totales a 2 decimales. */
export function redondear2(valor: Decimal): Decimal {
  return valor.aEscala(ESCALA_MONTO);
}

export function monto(texto: string, campo: string): Decimal {
  return Decimal.desdeTexto(texto, ESCALA_MONTO, campo);
}

/** «S/ 700,00»: el formato de los mensajes al usuario. */
export function formatearSoles(valor: Decimal): string {
  return `S/ ${redondear2(valor).aTexto().replace('.', ',')}`;
}
