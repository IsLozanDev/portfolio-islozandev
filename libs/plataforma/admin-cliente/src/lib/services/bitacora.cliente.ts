import { HttpClient, HttpContext, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { CONFIG_AUTH, OMITIR_AVISO_ERROR } from '@vitrina/shared/auth';
import { firstValueFrom } from 'rxjs';
import { aErrorAdmin } from '../models/error-admin';
import {
  aEventoSeguridad,
  aEventoSeguridadDetalle,
  type EventoSeguridad,
  type EventoSeguridadDetalle,
  type EventoSeguridadDetalleRespuesta,
  type EventoSeguridadRespuesta,
  type FiltroBitacora,
} from '../models/evento-seguridad';
import { aListado, type Listado } from '../models/listado';
import { nombreDeArchivo } from '../utils/descarga';
import { solicitar } from '../utils/solicitar';

const RUTA_BITACORA = '/seg/bitacora';
const RUTA_EXPORTAR = '/exportar';
const CABECERA_DISPOSICION = 'Content-Disposition';

export type FiltroExportacion = Omit<FiltroBitacora, 'pagina' | 'tamano'>;

export interface ArchivoExportado {
  archivo: Blob;
  nombre: string;
}

/** Bitácora de seguridad del tenant (spec 18, TR-RF-019). Los errores salen como `ErrorAdmin`. */
@Injectable({ providedIn: 'root' })
export class BitacoraCliente {
  private readonly http = inject(HttpClient);
  private readonly urlBitacora = inject(CONFIG_AUTH).apiUrl + RUTA_BITACORA;

  async listar(filtro: FiltroBitacora): Promise<Listado<EventoSeguridad>> {
    const respuesta = await solicitar(this.http.get<Listado<EventoSeguridadRespuesta>>(this.urlBitacora, { params: parametrosDe(filtro) }));
    return aListado(respuesta, aEventoSeguridad);
  }

  async detalle(eventoId: string): Promise<EventoSeguridadDetalle> {
    const url = `${this.urlBitacora}/${encodeURIComponent(eventoId)}`;
    return aEventoSeguridadDetalle(await solicitar(this.http.get<EventoSeguridadDetalleRespuesta>(url)));
  }

  /**
   * XLSX con los filtros aplicados (spec 18b). La página muestra el error con el mensaje de la API: sin el
   * aviso global, que para un 503 diría solo «error del servidor».
   */
  async exportar(filtro: FiltroExportacion): Promise<ArchivoExportado> {
    const context = new HttpContext().set(OMITIR_AVISO_ERROR, true);
    try {
      const respuesta = await firstValueFrom(
        this.http.get(this.urlBitacora + RUTA_EXPORTAR, { params: parametrosDeExportacion(filtro), responseType: 'blob', observe: 'response', context }),
      );
      const nombre = nombreDeArchivo(respuesta.headers.get(CABECERA_DISPOSICION)) ?? `bitacora-${filtro.desde}-${filtro.hasta}.xlsx`;
      return { archivo: respuesta.body ?? new Blob(), nombre };
    } catch (error) {
      throw aErrorAdmin(await conCuerpoJson(error));
    }
  }
}

/** Con `responseType: 'blob'` el cuerpo del error también llega como Blob: se lee para tener `{ codigo, mensaje }`. */
async function conCuerpoJson(error: unknown): Promise<unknown> {
  if (!(error instanceof HttpErrorResponse) || !(error.error instanceof Blob)) return error;
  try {
    const cuerpo: unknown = JSON.parse(await leerTexto(error.error));
    return new HttpErrorResponse({ error: cuerpo, headers: error.headers, status: error.status, url: error.url ?? undefined });
  } catch {
    return error;
  }
}

/** FileReader y no `Blob.text()`: funciona igual en el navegador y en jsdom. */
function leerTexto(archivo: Blob): Promise<string> {
  return new Promise((resolver, rechazar) => {
    const lector = new FileReader();
    lector.onload = () => resolver(String(lector.result));
    lector.onerror = () => rechazar(lector.error);
    lector.readAsText(archivo);
  });
}

function parametrosDeExportacion(filtro: FiltroExportacion): HttpParams {
  let parametros = new HttpParams().set('desde', filtro.desde).set('hasta', filtro.hasta);
  if (filtro.tipo) parametros = parametros.set('tipo', filtro.tipo);
  if (filtro.usuario) parametros = parametros.set('usuario', filtro.usuario);
  return parametros;
}

function parametrosDe(filtro: FiltroBitacora): HttpParams {
  return parametrosDeExportacion(filtro).set('pagina', filtro.pagina).set('tamano', filtro.tamano);
}
