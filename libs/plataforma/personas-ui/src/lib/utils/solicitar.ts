import { firstValueFrom, type Observable } from 'rxjs';
import { aErrorPersonas } from '../models/error-personas';

/** Primera respuesta de la petición; si falla, un `ErrorPersonas` con el código y el mensaje de la API. */
export async function solicitar<T>(peticion: Observable<T>): Promise<T> {
  try {
    return await firstValueFrom(peticion);
  } catch (error) {
    throw aErrorPersonas(error);
  }
}
