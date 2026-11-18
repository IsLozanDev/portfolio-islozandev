import { firstValueFrom, type Observable } from 'rxjs';
import { aErrorIdentidad } from '../models/error-identidad';

/** Primera respuesta de la petición; si falla, un `ErrorIdentidad` con el código de la API. */
export async function solicitar<T>(peticion: Observable<T>): Promise<T> {
  try {
    return await firstValueFrom(peticion);
  } catch (error) {
    throw aErrorIdentidad(error);
  }
}
