import { inject, Injectable } from '@angular/core';
import { EventosSseCliente, type EventoSse } from '@vitrina/shared/auth';
import { map, type Observable } from 'rxjs';
import { aAvisoAnalisis, type AvisoAnalisis, type AvisoAnalisisRespuesta } from '../models/archivo';
import { RUTA_ARCHIVOS } from './archivos.cliente';

const EVENTO_FIN = 'fin';
const PRIMERA_VERSION = 1;
const esFin = (evento: EventoSse) => evento.evento === EVENTO_FIN;

/** SSE del análisis de una carga (versión 1) o de una versión. */
@Injectable({ providedIn: 'root' })
export class EventosAnalisisCliente {
  private readonly eventos = inject(EventosSseCliente);

  /** Completa con el `fin`; falla con `CorteDeStream` o `StreamRechazado` (404 si la subió otro usuario). Desuscribirse cierra el stream. */
  abrir(archivoId: string, numero: number): Observable<AvisoAnalisis> {
    return this.eventos.abrir(rutaEventos(archivoId, numero), esFin).pipe(map((evento) => aAvisoAnalisis(JSON.parse(evento.datos) as AvisoAnalisisRespuesta)));
  }
}

function rutaEventos(archivoId: string, numero: number): string {
  const rutaArchivo = `${RUTA_ARCHIVOS}/${encodeURIComponent(archivoId)}`;
  return numero === PRIMERA_VERSION ? `${rutaArchivo}/eventos` : `${rutaArchivo}/versiones/${numero}/eventos`;
}
