import { normalizarColumna, type DisenoTabla } from './disenos-tablas.js';
import type { FilaImportada } from './fila-importada.js';
import type { ErrorFila } from './tipos.js';

const NOMBRE_MAXIMO = 200;
const CODIGO_EXTERNO_MAXIMO = 40;
const ABREVIATURA_MAXIMA = 30;
const ATRIBUTO_MAXIMO = 200;
/** Las tablas oficiales no traen datos personales; el valor se recorta para no inflar el reporte. */
const VALOR_MAXIMO_EN_ERROR = 100;
const ENTERO = /^-?[0-9]+$/;
const ORDEN_MAXIMO = 2_147_483_647;

export type ResultadoFila = { valida: true; fila: FilaImportada } | { valida: false; errores: ErrorFila[] };

type Celdas = ReadonlyMap<string, string>;

/** Valida una fila sin detenerse en el primer error: devuelve todos los de la fila. */
export function validarFila(diseno: DisenoTabla, numero: number, celdasCrudas: Readonly<Record<string, string>>): ResultadoFila {
  const celdas = normalizarCeldas(celdasCrudas);
  const errores: ErrorFila[] = [];
  const reportar = (columna: string, mensaje: string): void => {
    errores.push({ fila: numero, columna, valor: recortar(celdas.get(columna) ?? ''), mensaje });
  };

  for (const obligatoria of diseno.obligatorias) {
    if (!celdas.get(obligatoria)) reportar(obligatoria, 'Valor obligatorio');
  }
  const codigo = celdas.get('codigo') ?? '';
  if (codigo && !diseno.formatoCodigo.test(codigo)) reportar('codigo', 'El código no tiene el formato de la tabla');
  const nombre = celdas.get('descripcion') ?? '';
  if (nombre.length > NOMBRE_MAXIMO) reportar('descripcion', `La descripción debe tener de 1 a ${NOMBRE_MAXIMO} caracteres`);
  const codigoExterno = opcional(celdas, 'codigo_externo');
  if (codigoExterno !== null && codigoExterno.length > CODIGO_EXTERNO_MAXIMO) {
    reportar('codigo_externo', `El código externo debe tener como máximo ${CODIGO_EXTERNO_MAXIMO} caracteres`);
  }
  const abreviatura = opcional(celdas, 'abreviatura');
  if (abreviatura !== null && abreviatura.length > ABREVIATURA_MAXIMA) {
    reportar('abreviatura', `La abreviatura debe tener como máximo ${ABREVIATURA_MAXIMA} caracteres`);
  }
  const orden = leerOrden(opcional(celdas, 'orden'), numero);
  if (orden === null) reportar('orden', 'El orden debe ser un número entero');
  for (const atributo of diseno.atributos) {
    if ((celdas.get(atributo) ?? '').length > ATRIBUTO_MAXIMO) reportar(atributo, `El valor debe tener como máximo ${ATRIBUTO_MAXIMO} caracteres`);
  }

  if (errores.length > 0 || orden === null) return { valida: false, errores };
  return {
    valida: true,
    fila: { numero, codigo, codigoExterno, nombre, abreviatura, orden, atributos: leerAtributos(diseno, celdas) },
  };
}

function normalizarCeldas(celdas: Readonly<Record<string, string>>): Celdas {
  return new Map(Object.entries(celdas).map(([columna, valor]) => [normalizarColumna(columna), valor.trim()]));
}

function opcional(celdas: Celdas, columna: string): string | null {
  return celdas.get(columna) || null;
}

/** Sin orden, el orden es el número de fila. null si no es un entero válido. */
function leerOrden(valor: string | null, numero: number): number | null {
  if (valor === null) return numero;
  if (!ENTERO.test(valor)) return null;
  const orden = Number(valor);
  return Math.abs(orden) <= ORDEN_MAXIMO ? orden : null;
}

function leerAtributos(diseno: DisenoTabla, celdas: Celdas): Record<string, string> {
  return Object.fromEntries(diseno.atributos.map((atributo) => [atributo, celdas.get(atributo) ?? '']));
}

function recortar(valor: string): string {
  return valor.slice(0, VALOR_MAXIMO_EN_ERROR);
}
