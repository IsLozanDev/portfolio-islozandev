import { firstValueFrom, type Observable } from 'rxjs';
import { aErrorCatalogos } from '../models/error-catalogos';

/** Primera respuesta de la petición; si falla, un `ErrorCatalogos` con el código y el mensaje de la API. */
export async function solicitar<T>(peticion: Observable<T>): Promise<T> {
  try {
    return await firstValueFrom(peticion);
  } catch (error) {
    throw aErrorCatalogos(error);
  }
}
