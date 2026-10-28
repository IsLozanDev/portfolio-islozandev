/**
 * Copia de `libs/shared/util/src/ruc.ts` (TR-RN-002): esta lib se empaqueta con ng-packagr y no puede
 * importar `shared/util`, que no es buildable (spec 17b, paso 7). El servidor repite la validación con
 * el original; si cambia uno, cambia el otro.
 */
const PESOS_MODULO_11 = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
const FORMATO_RUC = /^(10|15|17|20)\d{9}$/;
const POSICION_VERIFICADOR = 10;

export function validarRuc(ruc: string): boolean {
  if (!FORMATO_RUC.test(ruc)) return false;
  const suma = PESOS_MODULO_11.reduce((acumulado, peso, indice) => acumulado + peso * Number(ruc[indice]), 0);
  const verificador = (11 - (suma % 11)) % 10;
  return verificador === Number(ruc[POSICION_VERIFICADOR]);
}
