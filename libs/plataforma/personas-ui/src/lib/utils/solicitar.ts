import { catchError, firstValueFrom, throwError, type Observable } from 'rxjs';
import { aErrorPersonas } from '../models/error-personas';

/** La petición con sus errores convertidos a `ErrorPersonas`: para cancelarla con `switchMap`. */
export function conErroresDePersonas<T>(peticion: Observable<T>): Observable<T> {
  return peticion.pipe(catchError((error: unknown) => throwError(() => aErrorPersonas(error))));
}

/** Primera respuesta de la petición; si falla, un `ErrorPersonas` con el código y el mensaje de la API. */
export function solicitar<T>(peticion: Observable<T>): Promise<T> {
  return firstValueFrom(conErroresDePersonas(peticion));
}
