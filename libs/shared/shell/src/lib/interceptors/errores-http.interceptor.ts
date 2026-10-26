import { HttpErrorResponse, type HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { CONFIG_AUTH, esDeLaApi, OMITIR_AVISO_ERROR } from '@vitrina/shared/auth';
import { AvisosService } from '@vitrina/shared/ui';
import { tap } from 'rxjs';
import { MENSAJES_SHELL } from '../models/mensajes-shell';

const ESTADO_SIN_CONEXION = 0;
const PRIMER_ESTADO_ERROR_SERVIDOR = 500;
const ULTIMO_ESTADO_ERROR_SERVIDOR = 599;

/**
 * Modal de error ante falta de conexión o 5xx de la API. Los 4xx no: 401 y 403 los maneja
 * `shared/auth` y el resto cada página. El error siempre se propaga.
 */
export const erroresHttpInterceptor: HttpInterceptorFn = (peticion, siguiente) => {
  const { apiUrl } = inject(CONFIG_AUTH);
  if (!esDeLaApi(peticion.url, apiUrl) || peticion.context.get(OMITIR_AVISO_ERROR)) return siguiente(peticion);

  const avisos = inject(AvisosService);
  return siguiente(peticion).pipe(tap({ error: (error: unknown) => avisarError(error, avisos) }));
};

function avisarError(error: unknown, avisos: AvisosService): void {
  if (!(error instanceof HttpErrorResponse)) return;
  if (error.status === ESTADO_SIN_CONEXION) {
    void avisos.error(MENSAJES_SHELL.tituloSinConexion, MENSAJES_SHELL.sinConexion);
    return;
  }
  if (esErrorDeServidor(error.status)) {
    void avisos.error(MENSAJES_SHELL.tituloErrorServidor, MENSAJES_SHELL.errorServidor);
  }
}

function esErrorDeServidor(estado: number): boolean {
  return estado >= PRIMER_ESTADO_ERROR_SERVIDOR && estado <= ULTIMO_ESTADO_ERROR_SERVIDOR;
}
