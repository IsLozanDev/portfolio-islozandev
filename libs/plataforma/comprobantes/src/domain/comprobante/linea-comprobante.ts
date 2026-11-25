import { Decimal, ESCALA_MONTO, ESCALA_UNITARIO } from './dinero.js';

/** Grupos del catálogo AFECTACION_IGV (atributo `grupo`) que este spec emite: solo operaciones onerosas. */
export const GRUPOS_AFECTACION = ['GRAVADO', 'EXONERADO', 'INAFECTO'] as const;
export type GrupoAfectacion = (typeof GRUPOS_AFECTACION)[number];

export function esGrupoAfectacion(valor: unknown): valor is GrupoAfectacion {
  return (GRUPOS_AFECTACION as readonly unknown[]).includes(valor);
}

export interface EntradaLinea {
  codigo: string | null;
  descripcion: string;
  unidad: string;
  cantidad: Decimal;
  valorUnitario: Decimal;
  afectacionIgv: string;
  grupo: GrupoAfectacion;
}

export interface LineaCalculada extends EntradaLinea {
  orden: number;
  valorVenta: Decimal;
  igv: Decimal;
  /** Con IGV, a 4 decimales; igual al valor unitario si la línea no es gravada. */
  precioUnitario: Decimal;
}

const UNO = Decimal.desdeTexto('1', ESCALA_UNITARIO, 'tasa');

/** TR-RN-021: valor de venta e IGV redondeados por línea; IGV solo en las gravadas. */
export function calcularLinea(entrada: EntradaLinea, orden: number, tasa: Decimal): LineaCalculada {
  const valorVenta = entrada.cantidad.multiplicar(entrada.valorUnitario, ESCALA_MONTO);
  const gravada = entrada.grupo === 'GRAVADO';
  const igv = gravada ? valorVenta.multiplicar(tasa, ESCALA_MONTO) : Decimal.cero(ESCALA_MONTO);
  const precioUnitario = gravada ? entrada.valorUnitario.multiplicar(UNO.sumar(tasa), ESCALA_UNITARIO) : entrada.valorUnitario;
  return { ...entrada, orden, valorVenta, igv, precioUnitario };
}
