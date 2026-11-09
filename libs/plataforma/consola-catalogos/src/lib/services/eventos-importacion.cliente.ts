import { inject, Injectable } from '@angular/core';
import { CONFIG_AUTH, SesionService } from '@vitrina/shared/auth';
import { Observable } from 'rxjs';
import type { AvisoImportacion } from '../models/importacion';
import { lectorEventos } from '../utils/lector-eventos';
import { RUTA_CATALOGOS } from './catalogos.cliente';

const CABECERA_SUCURSAL = 'X-Sucursal-Id';
const TIPO_EVENTOS = 'text/event-stream';

/** El stream se cortó sin `fin`: red, cuerpo cerrado o el cierre de 15 min del back. */
export class CorteDeStream extends Error {
  constructor(options?: { cause?: unknown }) {
    super('El seguimiento de la importación se cortó', options);
    this.name = 'CorteDeStream';
  }
}

/** La API no abrió el stream: 401, 404 (otro usuario o id inexistente) o 5xx. */
export class StreamRechazado extends Error {
  constructor(readonly estado: number) {
    super(`La API rechazó el seguimiento (${estado})`);
    this.name = 'StreamRechazado';
  }
}

/**
 * SSE de una importación con `fetch` y el Bearer: `EventSource` no manda cabeceras y el token no va en la URL.
 * No pasa por `HttpClient`: el interceptor no renueva aquí; lo hace el `GET` de recuperación del seguimiento.
 */
@Injectable({ providedIn: 'root' })
export class EventosImportacionCliente {
  private readonly sesion = inject(SesionService);
  private readonly urlImportaciones = `${inject(CONFIG_AUTH).apiUrl}${RUTA_CATALOGOS}/importaciones`;

  /** Completa al recibir `fin`; falla con `CorteDeStream` o `StreamRechazado`. Desuscribirse aborta la petición. */
  abrir(importacionId: string): Observable<AvisoImportacion> {
    return new Observable<AvisoImportacion>((suscriptor) => {
      const controlador = new AbortController();
      const url = `${this.urlImportaciones}/${encodeURIComponent(importacionId)}/eventos`;

      fetch(url, { headers: this.cabeceras(), signal: controlador.signal })
        .then(async (respuesta) => {
          if (!respuesta.ok || !respuesta.body) throw new StreamRechazado(respuesta.status);
          const lector = respuesta.body.getReader();
          const decodificador = new TextDecoder();
          let pendiente = '';
          for (;;) {
            const { done: terminado, value: bytes } = await lector.read();
            if (terminado) throw new CorteDeStream();
            const lectura = lectorEventos(pendiente, decodificador.decode(bytes, { stream: true }));
            pendiente = lectura.pendiente;
            for (const aviso of lectura.avisos) {
              suscriptor.next(aviso);
              if (aviso.tipo === 'fin') {
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
