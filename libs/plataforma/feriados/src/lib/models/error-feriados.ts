import { HttpErrorResponse } from '@angular/common/http';
import { MENSAJE_ERROR_DESCONOCIDO, MENSAJES_POR_CODIGO } from './mensajes-feriados';

export const CODIGO_DESCONOCIDO = 'DESCONOCIDO';

/** Campos del panel de feriado donde va el mensaje de un código. Los demás van como alerta. */
export type CampoFeriado = 'fecha' | 'sucursalId';

/** TR-CA-077 en `fecha`; la sucursal de otro tenant o borrada, en su select. */
const CAMPOS_POR_CODIGO: Readonly<Record<string, CampoFeriado>> = {
  FERIADO_DUPLICADO: 'fecha',
  SUCURSAL_NO_ENCONTRADA: 'sucursalId',
};

/** Error de la API como `{ codigo, mensaje }`, con el campo del panel al que pertenece, si lo hay. */
export class ErrorFeriados extends Error {
  readonly campo: CampoFeriado | null;

  constructor(
    readonly codigo: string,
    mensaje: string,
    readonly estado: number | null,
    options?: { cause?: unknown },
  ) {
    super(mensaje, options);
    this.name = 'ErrorFeriados';
    this.campo = CAMPOS_POR_CODIGO[codigo] ?? null;
  }
}

interface CuerpoDeError {
  codigo?: unknown;
  mensaje?: unknown;
}

export function aErrorFeriados(error: unknown): ErrorFeriados {
  if (error instanceof ErrorFeriados) return error;
  if (!(error instanceof HttpErrorResponse)) return new ErrorFeriados(CODIGO_DESCONOCIDO, MENSAJE_ERROR_DESCONOCIDO, null, { cause: error });

  const cuerpo = (error.error ?? {}) as CuerpoDeError;
  const codigo = typeof cuerpo.codigo === 'string' ? cuerpo.codigo : CODIGO_DESCONOCIDO;
  const mensaje = typeof cuerpo.mensaje === 'string' ? cuerpo.mensaje : (MENSAJES_POR_CODIGO[codigo] ?? MENSAJE_ERROR_DESCONOCIDO);
  return new ErrorFeriados(codigo, mensaje, error.status, { cause: error });
}
