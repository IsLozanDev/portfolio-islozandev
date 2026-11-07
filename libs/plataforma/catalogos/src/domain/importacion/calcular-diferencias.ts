import type { FilaImportada } from './fila-importada.js';

/** Ítem global del catálogo tal como está antes de importar. */
export interface ItemGlobalActual {
  id: string;
  codigo: string;
  codigoExterno: string | null;
  nombre: string;
  abreviatura: string | null;
  orden: number;
  atributos: Readonly<Record<string, unknown>>;
  vigenteDesde: string;
  vigenteHasta: string | null;
  activo: boolean;
}

export interface CambioItem {
  antes: ItemGlobalActual;
  despues: FilaImportada;
}

export interface Diferencias {
  altas: FilaImportada[];
  cambios: CambioItem[];
  bajas: ItemGlobalActual[];
  sinCambios: number;
}

/**
 * Compara el archivo con los ítems globales actuales. Baja: ítem vigente en `fechaVigencia` que no está
 * en el archivo; los ya cerrados no cuentan. Cambio: difiere algún campo o atributo del diseño, o el ítem
 * estaba cerrado o inactivo (se reabre).
 */
export function calcularDiferencias(filas: readonly FilaImportada[], actuales: readonly ItemGlobalActual[], fechaVigencia: string): Diferencias {
  const actualPorCodigo = new Map(actuales.map((item) => [item.codigo, item]));
  const diferencias: Diferencias = { altas: [], cambios: [], bajas: [], sinCambios: 0 };

  for (const fila of filas) {
    const actual = actualPorCodigo.get(fila.codigo);
    if (!actual) diferencias.altas.push(fila);
    else if (cambia(actual, fila)) diferencias.cambios.push({ antes: actual, despues: fila });
    else diferencias.sinCambios += 1;
  }

  const codigosDelArchivo = new Set(filas.map((fila) => fila.codigo));
  diferencias.bajas = actuales.filter((item) => !codigosDelArchivo.has(item.codigo) && sigueVigente(item, fechaVigencia));
  return diferencias;
}

function cambia(actual: ItemGlobalActual, fila: FilaImportada): boolean {
  return (
    actual.vigenteHasta !== null ||
    !actual.activo ||
    actual.codigoExterno !== fila.codigoExterno ||
    actual.nombre !== fila.nombre ||
    actual.abreviatura !== fila.abreviatura ||
    actual.orden !== fila.orden ||
    Object.entries(fila.atributos).some(([clave, valor]) => actual.atributos[clave] !== valor)
  );
}

const MILISEGUNDOS_POR_DIA = 86_400_000;

/** Fin de vigencia de una baja: el día anterior a la importación, sin quedar antes de su inicio (TR-CA-074). */
export function fechaDeCierre(item: ItemGlobalActual, fechaVigencia: string): string {
  const diaAnterior = new Date(Date.parse(`${fechaVigencia}T00:00:00Z`) - MILISEGUNDOS_POR_DIA).toISOString().slice(0, 10);
  return diaAnterior > item.vigenteDesde ? diaAnterior : item.vigenteDesde;
}

/** Las fechas ISO se comparan como texto. */
function sigueVigente(item: ItemGlobalActual, fechaVigencia: string): boolean {
  return item.vigenteHasta === null || item.vigenteHasta >= fechaVigencia;
}
