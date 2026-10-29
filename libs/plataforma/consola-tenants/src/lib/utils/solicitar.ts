import { firstValueFrom, type Observable } from 'rxjs';
import { aErrorConsola } from '../models/error-consola';

/** Primera respuesta de la petición; si falla, un `ErrorConsola` con el código y el mensaje de la API. */
export async function solicitar<T>(peticion: Observable<T>): Promise<T> {
  try {
    return await firstValueFrom(peticion);
  } catch (error) {
    throw aErrorConsola(error);
  }
}
