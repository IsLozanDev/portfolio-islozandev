import { ErrorPersonas, mensajeDeErrorDuplicados } from '@vitrina/plataforma/personas-ui';
import { MENSAJES_DUPLICADOS_ADMIN } from '../models/mensajes-duplicados-admin';

/** El mensaje de un error de las páginas de duplicados; uno que no es de la API, como fallo de carga. */
export function mensajeDeFalloDuplicados(error: unknown): string {
  return error instanceof ErrorPersonas ? mensajeDeErrorDuplicados(error) : MENSAJES_DUPLICADOS_ADMIN.errorCarga;
}
