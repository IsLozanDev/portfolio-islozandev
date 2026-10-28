import { firstValueFrom, type Observable } from 'rxjs';
import { aErrorAdmin } from '../models/error-admin';

/** Primera respuesta de la petición; si falla, un `ErrorAdmin` con el código y el mensaje de la API. */
export async function solicitar<T>(peticion: Observable<T>): Promise<T> {
  try {
    return await firstValueFrom(peticion);
  } catch (error) {
    throw aErrorAdmin(error);
  }
}
