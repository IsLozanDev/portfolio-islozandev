import { ColumnasInvalidasError } from './errores.js';
import type { TablaImportable } from './tipos.js';

/** Diseño fijo de columnas de una tabla oficial. Las columnas de `atributos` también son obligatorias. */
export interface DisenoTabla {
  obligatorias: readonly string[];
  opcionales: readonly string[];
  formatoCodigo: RegExp;
  atributos: readonly string[];
}

const BASE = ['codigo', 'descripcion'] as const;

export const DISENOS_TABLAS: Readonly<Record<TablaImportable, DisenoTabla>> = {
  UBIGEO: {
    obligatorias: [...BASE, 'departamento', 'provincia'],
    opcionales: ['orden'],
    formatoCodigo: /^[0-9]{6}$/,
    atributos: ['departamento', 'provincia'],
  },
  CIE10: {
    obligatorias: BASE,
    opcionales: ['orden'],
    formatoCodigo: /^[A-Z][0-9][0-9A-Z](\.?[0-9A-Z]{1,2})?$/,
    atributos: [],
  },
  TIPO_COMPROBANTE: {
    obligatorias: BASE,
    opcionales: ['codigo_externo', 'abreviatura', 'orden'],
    formatoCodigo: /^[0-9]{2}$/,
    atributos: [],
  },
  UNIDAD_MEDIDA: {
    obligatorias: BASE,
    opcionales: ['abreviatura', 'orden'],
    formatoCodigo: /^[A-Z0-9]{1,3}$/,
    atributos: [],
  },
  TIPO_DOC_IDENTIDAD: {
    obligatorias: ['codigo', 'codigo_externo', 'descripcion'],
    opcionales: ['abreviatura', 'orden'],
    formatoCodigo: /^[A-Z0-9_]{1,40}$/,
    atributos: [],
  },
  AFECTACION_IGV: {
    obligatorias: BASE,
    opcionales: ['orden'],
    formatoCodigo: /^[0-9]{2}$/,
    atributos: [],
  },
  MONEDA: {
    obligatorias: BASE,
    opcionales: ['codigo_externo', 'abreviatura', 'orden'],
    formatoCodigo: /^[A-Z]{3}$/,
    atributos: [],
  },
};

/** Las mayúsculas y los espacios al borde no importan. */
export function normalizarColumna(columna: string): string {
  return columna.trim().toLowerCase();
}

/** Falta de una obligatoria, columna desconocida o repetida (TR-CA-073). El orden no importa. */
export function validarCabecera(diseno: DisenoTabla, cabecera: readonly string[]): void {
  const columnas = cabecera.map(normalizarColumna);
  const conocidas = new Set([...diseno.obligatorias, ...diseno.opcionales]);
  const faltante = diseno.obligatorias.find((obligatoria) => !columnas.includes(obligatoria));
  if (faltante) throw new ColumnasInvalidasError(`Falta la columna ${faltante}`);
  const desconocida = columnas.find((columna) => !conocidas.has(columna));
  if (desconocida !== undefined) throw new ColumnasInvalidasError(`Columna desconocida: ${desconocida}`);
  const repetida = columnas.find((columna, posicion) => columnas.indexOf(columna) !== posicion);
  if (repetida) throw new ColumnasInvalidasError(`Columna repetida: ${repetida}`);
}
