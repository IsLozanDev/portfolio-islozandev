import { HttpErrorResponse } from '@angular/common/http';

export const ALCANCES_BAJA = ['PROMOCIONAL', 'CANAL'] as const;
export type AlcanceBaja = (typeof ALCANCES_BAJA)[number];

export const BAJA_PROMOCIONES: AlcanceBaja = 'PROMOCIONAL';
export const BAJA_TODO_EL_CORREO: AlcanceBaja = 'CANAL';

/** Respuesta de `POST /v1/notificaciones/preferencias/consultar` (spec 46). */
export interface PreferenciasDestino {
  /** `j***@gmail.com`: la API nunca manda el correo completo. */
  destinoEnmascarado: string;
  canal: string;
  bajas: AlcanceBaja[];
}

/** Respuesta de `PUT /v1/notificaciones/preferencias`. */
export interface BajasDestino {
  bajas: AlcanceBaja[];
}

export const CODIGO_ENLACE_INVALIDO = 'ENLACE_INVALIDO';
const CODIGO_DEMASIADAS_SOLICITUDES = 'DEMASIADAS_SOLICITUDES';
const CODIGO_DESCONOCIDO = 'DESCONOCIDO';

export const MENSAJES_PREFERENCIAS = {
  enlaceInvalido: 'Enlace inválido o vencido',
  enlaceInvalidoDetalle: 'Abra el enlace del correo más reciente que recibió.',
  demasiadasSolicitudes: 'Hizo demasiados intentos. Espere un minuto y vuelva a intentarlo.',
  desconocido: 'No se pudo guardar su preferencia. Intente de nuevo en unos minutos.',
} as const;

const MENSAJE_POR_CODIGO: Readonly<Record<string, string>> = {
  [CODIGO_ENLACE_INVALIDO]: MENSAJES_PREFERENCIAS.enlaceInvalido,
  [CODIGO_DEMASIADAS_SOLICITUDES]: MENSAJES_PREFERENCIAS.demasiadasSolicitudes,
};

/** Error de /v1/notificaciones/preferencias con el código de la API y su texto en español. */
export class ErrorPreferencias extends Error {
  constructor(
    readonly codigo: string,
    options?: { cause?: unknown },
  ) {
    super(MENSAJE_POR_CODIGO[codigo] ?? MENSAJES_PREFERENCIAS.desconocido, options);
    this.name = 'ErrorPreferencias';
  }

  get enlaceInvalido(): boolean {
    return this.codigo === CODIGO_ENLACE_INVALIDO;
  }
}

interface CuerpoDeError {
  codigo?: unknown;
}

export function aErrorPreferencias(error: unknown): ErrorPreferencias {
  if (error instanceof ErrorPreferencias) return error;
  if (!(error instanceof HttpErrorResponse)) return new ErrorPreferencias(CODIGO_DESCONOCIDO, { cause: error });
  const cuerpo = (error.error ?? {}) as CuerpoDeError;
  return new ErrorPreferencias(typeof cuerpo.codigo === 'string' ? cuerpo.codigo : CODIGO_DESCONOCIDO, { cause: error });
}
