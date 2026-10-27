import { HttpErrorResponse, type HttpInterceptorFn } from '@angular/common/http';
import { inject, Injector } from '@angular/core';
import { CONFIG_AUTH, esDeLaApi, OMITIR_AVISO_ERROR } from '@vitrina/shared/auth';
import { tap } from 'rxjs';
import { MENSAJES_SHELL } from '../models/mensajes-shell';

const ESTADO_SIN_CONEXION = 0;
const PRIMER_ESTADO_ERROR_SERVIDOR = 500;
const ULTIMO_ESTADO_ERROR_SERVIDOR = 599;

interface AvisoDeError {
  titulo: string;
  texto: string;
}

/**
 * Modal de error ante falta de conexión o 5xx de la API. Los 4xx no: 401 y 403 los maneja
 * `shared/auth` y el resto cada página. El error siempre se propaga.
 */
export const erroresHttpInterceptor: HttpInterceptorFn = (peticion, siguiente) => {
  const { apiUrl } = inject(CONFIG_AUTH);
  if (!esDeLaApi(peticion.url, apiUrl) || peticion.context.get(OMITIR_AVISO_ERROR)) return siguiente(peticion);

  const injector = inject(Injector);
  return siguiente(peticion).pipe(tap({ error: (error: unknown) => void avisarError(error, injector) }));
};

/**
 * `shared/ui` se importa recién ante el primer error: el interceptor se registra al arrancar y un
 * import estático metería SweetAlert2 y todos los componentes de `shared/ui` en el bundle inicial.
 */
async function avisarError(error: unknown, injector: Injector): Promise<void> {
  const aviso = avisoPara(error);
  if (!aviso) return;
  const { AvisosService } = await import('@vitrina/shared/ui');
  await injector.get(AvisosService).error(aviso.titulo, aviso.texto);
}

function avisoPara(error: unknown): AvisoDeError | null {
  if (!(error instanceof HttpErrorResponse)) return null;
  if (error.status === ESTADO_SIN_CONEXION) return { titulo: MENSAJES_SHELL.tituloSinConexion, texto: MENSAJES_SHELL.sinConexion };
  if (esErrorDeServidor(error.status)) return { titulo: MENSAJES_SHELL.tituloErrorServidor, texto: MENSAJES_SHELL.errorServidor };
  return null;
}

function esErrorDeServidor(estado: number): boolean {
  return estado >= PRIMER_ESTADO_ERROR_SERVIDOR && estado <= ULTIMO_ESTADO_ERROR_SERVIDOR;
}
