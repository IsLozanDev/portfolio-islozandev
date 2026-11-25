import type { ResultadoPse } from '../../../domain/respuesta-pse.js';

const CODIGO_ACEPTADO = 0;
const ULTIMA_EXCEPCION = 1999;
const ULTIMO_RECHAZO = 3999;

/**
 * Excepciones de autenticación y autorización (tabla CodeErrors de SUNAT): reintentar con la misma clave no las
 * arregla y puede bloquear el usuario SOL, así que se tratan como rechazo. 0109 (autenticación no disponible) no
 * está: es técnica y se reintenta.
 */
export const CODIGOS_CREDENCIAL_INVALIDA: ReadonlySet<number> = new Set([
  102, // Usuario o contraseña incorrectos
  103, // El Usuario ingresado no existe
  104, // La Clave ingresada es incorrecta
  105, // El Usuario no está activo
  106, // El Usuario no es válido
  111, // No tiene el perfil para enviar comprobantes electrónicos
  112, // El usuario debe ser secundario
  113, // El usuario no está afiliado a Factura Electrónica
  154, // El RUC del archivo no corresponde al RUC del usuario
]);

/**
 * `0` aceptado (con observaciones si trae notas); 0100-1999 excepción técnica, salvo credenciales; 2000-3999
 * rechazo; 4000 o mayor, observación. Un código que no es número se trata como técnico.
 */
export function resultadoDeCodigo(codigo: string, conObservaciones: boolean): ResultadoPse {
  const numero = Number(codigo);
  if (!Number.isInteger(numero)) return 'ERROR_TECNICO';
  if (numero === CODIGO_ACEPTADO) return conObservaciones ? 'ACEPTADO_CON_OBSERVACIONES' : 'ACEPTADO';
  if (CODIGOS_CREDENCIAL_INVALIDA.has(numero)) return 'RECHAZADO';
  if (numero <= ULTIMA_EXCEPCION) return 'ERROR_TECNICO';
  if (numero <= ULTIMO_RECHAZO) return 'RECHAZADO';
  return 'ACEPTADO_CON_OBSERVACIONES';
}
