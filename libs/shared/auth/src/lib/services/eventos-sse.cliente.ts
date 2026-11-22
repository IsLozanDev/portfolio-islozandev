import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { CONFIG_AUTH } from '../config/config';
import { CorteDeStream, StreamRechazado } from '../models/errores-sse';
import { lectorEventosSse, type EventoSse } from '../utils/lector-eventos-sse';
import { SesionService } from './sesion.service';

const CABECERA_SUCURSAL = 'X-Sucursal-Id';
const TIPO_EVENTOS = 'text/event-stream';

/**
 * SSE de la API con `fetch` y el Bearer: `EventSource` no manda cabeceras y el token no va en la URL.
 * No pasa por `HttpClient`: el interceptor no renueva aquí; lo hace quien reintenta tras el error.
 */
@Injectable({ providedIn: 'root' })
export class EventosSseCliente {
  private readonly sesion = inject(SesionService);
  private readonly apiUrl = inject(CONFIG_AUTH).apiUrl;

  /**
   * `ruta` es relativa a la API (`/archivos/{id}/eventos`). Completa con el primer evento que cumple `esFin`;
   * falla con `CorteDeStream` o `StreamRechazado`. Desuscribirse aborta la petición.
   */
  abrir(ruta: string, esFin: (evento: EventoSse) => boolean): Observable<EventoSse> {
    return new Observable<EventoSse>((suscriptor) => {
      const controlador = new AbortController();

      fetch(`${this.apiUrl}${ruta}`, { headers: this.cabeceras(), signal: controlador.signal })
        .then(async (respuesta) => {
          if (!respuesta.ok || !respuesta.body) throw new StreamRechazado(respuesta.status);
          const lector = respuesta.body.getReader();
          const decodificador = new TextDecoder();
          let pendiente = '';
          for (;;) {
            const { done: terminado, value: bytes } = await lector.read();
            if (terminado) throw new CorteDeStream();
            const lectura = lectorEventosSse(pendiente, decodificador.decode(bytes, { stream: true }));
            pendiente = lectura.pendiente;
            for (const evento of lectura.eventos) {
              suscriptor.next(evento);
              if (esFin(evento)) {
                await lector.cancel();
                suscriptor.complete();
                return;
              }
            }
          }
        })
        .catch((error: unknown) => {
          if (controlador.signal.aborted) return;
          suscriptor.error(error instanceof StreamRechazado || error instanceof CorteDeStream ? error : new CorteDeStream({ cause: error }));
        });

      return () => controlador.abort();
    });
  }

  private cabeceras(): Record<string, string> {
    const cabeceras: Record<string, string> = { Accept: TIPO_EVENTOS, Authorization: `Bearer ${this.sesion.token() ?? ''}` };
    const sucursalId = this.sesion.sucursalId();
    if (sucursalId) cabeceras[CABECERA_SUCURSAL] = sucursalId;
    return cabeceras;
  }
}
