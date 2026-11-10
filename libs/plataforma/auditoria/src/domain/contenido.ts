import { CAMPOS_ENMASCARADOS, enmascararCampos } from './enmascarado.js';
import { limitarTamano } from './tamano.js';

/** `antes` o `despues` listo para guardar: enmascarado con las claves por defecto y las extra, y con tope de tamaño. */
export function prepararContenido(valor: unknown, clavesExtra: readonly string[] = []): unknown {
  if (valor === undefined) return undefined;
  return limitarTamano(enmascararCampos(valor, [...CAMPOS_ENMASCARADOS, ...clavesExtra]));
}
