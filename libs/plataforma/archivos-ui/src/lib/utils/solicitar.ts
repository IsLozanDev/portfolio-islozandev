import { firstValueFrom, type Observable } from 'rxjs';
import { aErrorArchivos } from '../models/error-archivos';

/** Primera respuesta de la petición; si falla, un `ErrorArchivos` con el código y el mensaje de la API. */
export async function solicitar<T>(peticion: Observable<T>): Promise<T> {
  try {
    return await firstValueFrom(peticion);
  } catch (error) {
    throw aErrorArchivos(error);
  }
}
