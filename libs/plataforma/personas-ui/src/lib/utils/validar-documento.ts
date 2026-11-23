import type { TipoDocumento } from '../models/persona';

/**
 * Copia de `libs/shared/util/src/documento.ts` (TR-RN-002), con los tipos de personas: esta lib se empaqueta
 * con ng-packagr y no puede importar `shared/util`, que no es buildable (mismo criterio que `admin-cliente`,
 * specs 17b y 17c). El servidor repite la validación con el original; si cambia uno, cambian las copias.
 */
export type MotivoInvalidez = 'LONGITUD' | 'PREFIJO' | 'DIGITO_VERIFICADOR' | 'CARACTERES';
export type ValidezDocumento = { valido: true } | { valido: false; motivo: MotivoInvalidez };

export const LONGITUD_DNI = 8;
export const LONGITUD_RUC = 11;
const SOLO_DIGITOS = /^\d*$/;
const ALFANUMERICO = /^[A-Za-z0-9]*$/;
const LONGITUD_MAXIMA_ALFANUMERICO = 12;
const PREFIJOS_RUC = ['10', '15', '17', '20'];
const PESOS_RUC = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
const POSICION_VERIFICADOR_RUC = 10;
const MODULO_RUC = 11;

const VALIDO: ValidezDocumento = { valido: true };

function invalido(motivo: MotivoInvalidez): ValidezDocumento {
  return { valido: false, motivo };
}

function validarDni(numero: string): ValidezDocumento {
  if (!SOLO_DIGITOS.test(numero)) return invalido('CARACTERES');
  if (numero.length !== LONGITUD_DNI) return invalido('LONGITUD');
  return VALIDO;
}

function calcularVerificadorRuc(numero: string): number {
  const suma = PESOS_RUC.reduce((total, peso, posicion) => total + peso * Number(numero[posicion]), 0);
  return (MODULO_RUC - (suma % MODULO_RUC)) % 10;
}

function validarRuc(numero: string): ValidezDocumento {
  if (!SOLO_DIGITOS.test(numero)) return invalido('CARACTERES');
  if (numero.length !== LONGITUD_RUC) return invalido('LONGITUD');
  if (!PREFIJOS_RUC.includes(numero.slice(0, 2))) return invalido('PREFIJO');
  if (calcularVerificadorRuc(numero) !== Number(numero[POSICION_VERIFICADOR_RUC])) return invalido('DIGITO_VERIFICADOR');
  return VALIDO;
}

function validarAlfanumerico(numero: string): ValidezDocumento {
  if (!ALFANUMERICO.test(numero)) return invalido('CARACTERES');
  if (numero.length === 0 || numero.length > LONGITUD_MAXIMA_ALFANUMERICO) return invalido('LONGITUD');
  return VALIDO;
}

const VALIDADORES: Record<TipoDocumento, (numero: string) => ValidezDocumento> = {
  DNI: validarDni,
  RUC: validarRuc,
  CE: validarAlfanumerico,
  PASAPORTE: validarAlfanumerico,
};

export function validarDocumento(tipo: TipoDocumento, numero: string): ValidezDocumento {
  return VALIDADORES[tipo](numero);
}
