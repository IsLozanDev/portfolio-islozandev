import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { CONFIG_AUTH } from '@vitrina/shared/auth';
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
import { solicitar } from '../utils/solicitar';

const RUTA_BITACORA = '/seg/bitacora';

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
}

function parametrosDe(filtro: FiltroBitacora): HttpParams {
  let parametros = new HttpParams().set('desde', filtro.desde).set('hasta', filtro.hasta).set('pagina', filtro.pagina).set('tamano', filtro.tamano);
  if (filtro.tipo) parametros = parametros.set('tipo', filtro.tipo);
  if (filtro.usuario) parametros = parametros.set('usuario', filtro.usuario);
  return parametros;
}
