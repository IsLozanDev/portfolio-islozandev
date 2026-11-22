import { inject, Injectable } from '@angular/core';
import { EventosSseCliente, type EventoSse } from '@vitrina/shared/auth';
import { map, type Observable } from 'rxjs';
import { aAvisoImportacion, type AvisoImportacion, type AvisoImportacionRespuesta } from '../models/importacion';
import { RUTA_CATALOGOS } from './catalogos.cliente';

const EVENTO_FIN = 'fin';
const esFin = (evento: EventoSse) => evento.evento === EVENTO_FIN;

/** SSE de una importación sobre el cliente SSE de `shared/auth`. */
@Injectable({ providedIn: 'root' })
export class EventosImportacionCliente {
  private readonly eventos = inject(EventosSseCliente);

  /** Completa al recibir `fin`; falla con `CorteDeStream` o `StreamRechazado`. Desuscribirse aborta la petición. */
  abrir(importacionId: string): Observable<AvisoImportacion> {
    const ruta = `${RUTA_CATALOGOS}/importaciones/${encodeURIComponent(importacionId)}/eventos`;
    return this.eventos.abrir(ruta, esFin).pipe(map((evento) => aAvisoImportacion(JSON.parse(evento.datos) as AvisoImportacionRespuesta)));
  }
}
