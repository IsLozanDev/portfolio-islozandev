import { catchError, firstValueFrom, throwError, type Observable } from 'rxjs';
import { aErrorFe } from '../models/error-fe';

/** La petición con sus errores convertidos a `ErrorFe`: para cancelarla con `switchMap`. */
export function conErroresFe<T>(peticion: Observable<T>): Observable<T> {
  return peticion.pipe(catchError((error: unknown) => throwError(() => aErrorFe(error))));
}

/** Primera respuesta de la petición; si falla, un `ErrorFe` con el código de la API y su texto en español. */
export function solicitar<T>(peticion: Observable<T>): Promise<T> {
  return firstValueFrom(conErroresFe(peticion));
}
