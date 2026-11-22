import { HttpBackend, HttpClient, HttpEventType, HttpHeaders, type HttpEvent } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { catchError, filter, map, throwError, type Observable } from 'rxjs';
import type { CargaFirmada } from '../models/archivo';
import { aErrorArchivos } from '../models/error-archivos';

const PORCENTAJE_COMPLETO = 100;

export type AvanceSubida = { tipo: 'progreso'; porcentaje: number } | { tipo: 'terminado' };

/**
 * PUT directo a la URL firmada de Storage. Va sobre `HttpBackend`, sin interceptores:
 * el Bearer de la API no debe viajar a Storage. Desuscribirse aborta la subida.
 */
@Injectable({ providedIn: 'root' })
export class SubidaStorageCliente {
  private readonly http = new HttpClient(inject(HttpBackend));

  subir(carga: CargaFirmada, archivo: File, mime: string): Observable<AvanceSubida> {
    return this.http
      .put(carga.url, archivo, { headers: new HttpHeaders({ 'Content-Type': mime }), reportProgress: true, observe: 'events' })
      .pipe(
        map(aAvanceSubida),
        filter((avance): avance is AvanceSubida => avance !== null),
        catchError((error: unknown) => throwError(() => aErrorArchivos(error))),
      );
  }
}

function aAvanceSubida(evento: HttpEvent<unknown>): AvanceSubida | null {
  if (evento.type === HttpEventType.Response) return { tipo: 'terminado' };
  if (evento.type !== HttpEventType.UploadProgress || !evento.total) return null;
  return { tipo: 'progreso', porcentaje: Math.round((evento.loaded / evento.total) * PORCENTAJE_COMPLETO) };
}
