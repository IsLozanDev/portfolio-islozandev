import { HttpErrorResponse } from '@angular/common/http';
import { ErrorAuth, type CodigoErrorAuth } from './errores';

const SIN_RESPUESTA = 0;
const CABECERA_REINTENTO = 'Retry-After';

/** Códigos de `/seg/auth/*` (spec 18b). Ninguno revela si la cuenta existe. */
const CODIGO_POR_ERROR_API: Readonly<Record<string, CodigoErrorAuth>> = {
  CREDENCIALES_INVALIDAS: 'CREDENCIALES_INVALIDAS',
  CODIGO_MFA_INVALIDO: 'CODIGO_MFA_INVALIDO',
  INGRESO_BLOQUEADO: 'INGRESO_BLOQUEADO',
  INGRESO_NO_DISPONIBLE: 'SIN_CONEXION',
};

interface CuerpoErrorIngreso {
  codigo?: unknown;
  reintentarEnSeg?: unknown;
}

/**
 * Error de la API de ingreso como ErrorAuth, igual que los de Supabase. Un cuerpo inválido es
 * `siInvalida` (credenciales o código según la etapa): el formulario ya valida la forma.
 */
export function aErrorDeIngreso(error: unknown, siInvalida: CodigoErrorAuth): ErrorAuth {
  if (!(error instanceof HttpErrorResponse)) return new ErrorAuth('DESCONOCIDO', { cause: error });
  if (error.status === SIN_RESPUESTA) return new ErrorAuth('SIN_CONEXION', { cause: error });
  const cuerpo = (typeof error.error === 'object' && error.error !== null ? error.error : {}) as CuerpoErrorIngreso;
  const codigoApi = typeof cuerpo.codigo === 'string' ? cuerpo.codigo : '';
  const codigo = codigoApi === 'SOLICITUD_INVALIDA' ? siInvalida : (CODIGO_POR_ERROR_API[codigoApi] ?? 'DESCONOCIDO');
  return new ErrorAuth(codigo, { cause: error, reintentarEnSeg: segundosDeReintento(error, cuerpo) });
}

function segundosDeReintento(error: HttpErrorResponse, cuerpo: CuerpoErrorIngreso): number | undefined {
  const segundos = typeof cuerpo.reintentarEnSeg === 'number' ? cuerpo.reintentarEnSeg : Number(error.headers?.get(CABECERA_REINTENTO));
  return Number.isFinite(segundos) && segundos > 0 ? segundos : undefined;
}
