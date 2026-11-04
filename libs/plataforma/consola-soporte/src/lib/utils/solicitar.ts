import { firstValueFrom, type Observable } from 'rxjs';
import { aErrorSoporte } from '../models/error-soporte';

/** Primera respuesta de la petición; si falla, un `ErrorSoporte` con el código y el mensaje de la API. */
export async function solicitar<T>(peticion: Observable<T>): Promise<T> {
  try {
    return await firstValueFrom(peticion);
  } catch (error) {
    throw aErrorSoporte(error);
  }
}
