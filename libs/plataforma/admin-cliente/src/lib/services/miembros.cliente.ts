import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { CONFIG_AUTH } from '@vitrina/shared/auth';
import { aListado, type Listado } from '../models/listado';
import {
  aMiembro,
  aMiembroDetalle,
  type FiltroMiembros,
  type Miembro,
  type MiembroDetalle,
  type MiembroDetalleRespuesta,
  type MiembroRespuesta,
} from '../models/miembro';
import { solicitar } from '../utils/solicitar';

const RUTA_MIEMBROS = '/seg/miembros';

/** Lista y detalle de miembros del tenant (spec 16a). Los errores salen como `ErrorAdmin`. */
@Injectable({ providedIn: 'root' })
export class MiembrosCliente {
  private readonly http = inject(HttpClient);
  private readonly urlMiembros = inject(CONFIG_AUTH).apiUrl + RUTA_MIEMBROS;

  async listar(filtro: FiltroMiembros): Promise<Listado<Miembro>> {
    const respuesta = await solicitar(this.http.get<Listado<MiembroRespuesta>>(this.urlMiembros, { params: parametrosDe(filtro) }));
    return aListado(respuesta, aMiembro);
  }

  async detalle(membresiaId: string): Promise<MiembroDetalle> {
    const url = `${this.urlMiembros}/${encodeURIComponent(membresiaId)}`;
    return aMiembroDetalle(await solicitar(this.http.get<MiembroDetalleRespuesta>(url)));
  }
}

function parametrosDe(filtro: FiltroMiembros): HttpParams {
  let parametros = new HttpParams()
    .set('orden', filtro.orden)
    .set('direccion', filtro.direccion)
    .set('pagina', filtro.pagina)
    .set('tamano', filtro.tamano);
  if (filtro.estado) parametros = parametros.set('estado', filtro.estado);
  if (filtro.busqueda) parametros = parametros.set('busqueda', filtro.busqueda);
  return parametros;
}
