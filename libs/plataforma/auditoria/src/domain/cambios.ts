export interface Cambio {
  campo: string;
  antes: unknown;
  despues: unknown;
}

/** Tope de rutas que devuelve el detalle: un JSON de 64 KB puede tener miles. */
export const MAXIMO_CAMBIOS = 200;
/** Ruta de un `antes` o `despues` que no es objeto ni arreglo (un número, un texto). */
export const RUTA_RAIZ = '$';

/**
 * Rutas (`cliente.nombre`, `items[0].monto`) cuyo valor difiere entre `antes` y `despues`, incluidas las
 * que están en un solo lado (el otro, `null`). Los arreglos se comparan por índice. Ordenadas por ruta
 * y cortadas en MAXIMO_CAMBIOS.
 */
export function calcularCambios(antes: unknown, despues: unknown): Cambio[] {
  const hojasAntes = aplanar(antes);
  const hojasDespues = aplanar(despues);
  const rutas = [...new Set([...hojasAntes.keys(), ...hojasDespues.keys()])].sort();
  return rutas
    .map((campo) => ({ campo, antes: hojasAntes.get(campo) ?? null, despues: hojasDespues.get(campo) ?? null }))
    .filter((cambio) => !mismoValor(cambio.antes, cambio.despues))
    .slice(0, MAXIMO_CAMBIOS);
}

/**
 * Hojas del JSON por ruta. Dentro del JSON, un objeto o arreglo vacío es una hoja; en la raíz, igual que
 * null y undefined, no tiene rutas.
 */
function aplanar(valor: unknown): Map<string, unknown> {
  const hojas = new Map<string, unknown>();
  if (valor === null || valor === undefined || typeof valor === 'object') {
    if (esContenedorConElementos(valor)) recorrer(valor, '', hojas);
    return hojas;
  }
  hojas.set(RUTA_RAIZ, valor);
  return hojas;
}

function recorrer(valor: unknown, ruta: string, hojas: Map<string, unknown>): void {
  if (!esContenedorConElementos(valor)) {
    hojas.set(ruta, valor);
    return;
  }
  if (Array.isArray(valor)) {
    valor.forEach((elemento, indice) => recorrer(elemento, `${ruta}[${indice}]`, hojas));
    return;
  }
  for (const [clave, contenido] of Object.entries(valor)) recorrer(contenido, ruta ? `${ruta}.${clave}` : clave, hojas);
}

function esContenedorConElementos(valor: unknown): valor is Record<string, unknown> | unknown[] {
  if (Array.isArray(valor)) return valor.length > 0;
  return typeof valor === 'object' && valor !== null && Object.keys(valor).length > 0;
}

/** Las hojas son primitivos u objetos y arreglos vacíos: el JSON los compara bien. */
function mismoValor(antes: unknown, despues: unknown): boolean {
  return JSON.stringify(antes) === JSON.stringify(despues);
}

/** Tope de la columna «Campos cambiados» de la exportación: el JSON no va a la hoja (spec 20b). */
export const MAXIMO_LARGO_CAMPOS_CAMBIADOS = 500;
const SEPARADOR_CAMPOS = ', ';
const PUNTOS_SUSPENSIVOS = '…';

/** Rutas que cambiaron, separadas por coma y cortadas en 500 caracteres con «…» al final si no caben. */
export function camposCambiados(antes: unknown, despues: unknown): string {
  const texto = calcularCambios(antes, despues)
    .map((cambio) => cambio.campo)
    .join(SEPARADOR_CAMPOS);
  if (texto.length <= MAXIMO_LARGO_CAMPOS_CAMBIADOS) return texto;
  return texto.slice(0, MAXIMO_LARGO_CAMPOS_CAMBIADOS - PUNTOS_SUSPENSIVOS.length) + PUNTOS_SUSPENSIVOS;
}
