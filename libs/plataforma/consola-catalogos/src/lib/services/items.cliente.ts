import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { aCuerpoItem, aItemCatalogo, type ItemCatalogo, type ItemCatalogoRespuesta, type SolicitudItem } from '@vitrina/plataforma/catalogos-ui';
import { CONFIG_AUTH } from '@vitrina/shared/auth';
import { aFilaItem, ORIGEN_GLOBAL, type FiltroItems, type PaginaItems, type PaginaItemsRespuesta } from '../models/fila-item';
import { solicitar } from '../utils/solicitar';
import { RUTA_CATALOGOS } from './catalogos.cliente';

/** Ítems globales de un catálogo (19a, 19c y 19d). Solo el operador. Los errores salen como `ErrorCatalogos`. */
@Injectable({ providedIn: 'root' })
export class ItemsCliente {
  private readonly http = inject(HttpClient);
  private readonly urlCatalogos = inject(CONFIG_AUTH).apiUrl + RUTA_CATALOGOS;

  async listarAdministracion(codigoCatalogo: string, filtro: FiltroItems): Promise<PaginaItems> {
    const url = `${this.urlDe(codigoCatalogo)}/items/administracion`;
    const respuesta = await solicitar(this.http.get<PaginaItemsRespuesta>(url, { params: parametrosDe(filtro) }));
    return { items: respuesta.items.map(aFilaItem), total: respuesta.total };
  }

  async obtener(codigoCatalogo: string, itemId: string): Promise<ItemCatalogo> {
    return aItemCatalogo(await solicitar(this.http.get<ItemCatalogoRespuesta>(this.urlItemGlobal(codigoCatalogo, itemId))));
  }

  async crear(codigoCatalogo: string, solicitud: SolicitudItem): Promise<ItemCatalogo> {
    const url = `${this.urlDe(codigoCatalogo)}/items-globales`;
    return aItemCatalogo(await solicitar(this.http.post<ItemCatalogoRespuesta>(url, aCuerpoItem(solicitud))));
  }

  /** `codigo` no viaja: no cambia después de crear. */
  async actualizar(codigoCatalogo: string, itemId: string, solicitud: SolicitudItem, version: number): Promise<ItemCatalogo> {
    const cuerpo = { ...aCuerpoItem({ ...solicitud, codigo: undefined }), version };
    return aItemCatalogo(await solicitar(this.http.put<ItemCatalogoRespuesta>(this.urlItemGlobal(codigoCatalogo, itemId), cuerpo)));
  }

  async eliminar(codigoCatalogo: string, itemId: string, version: number): Promise<void> {
    const parametros = new HttpParams().set('version', version);
    await solicitar(this.http.delete<void>(this.urlItemGlobal(codigoCatalogo, itemId), { params: parametros }));
  }

  private urlDe(codigoCatalogo: string): string {
    return `${this.urlCatalogos}/${encodeURIComponent(codigoCatalogo)}`;
  }

  private urlItemGlobal(codigoCatalogo: string, itemId: string): string {
    return `${this.urlDe(codigoCatalogo)}/items-globales/${encodeURIComponent(itemId)}`;
  }
}

function parametrosDe(filtro: FiltroItems): HttpParams {
  let parametros = new HttpParams().set('origen', ORIGEN_GLOBAL).set('pagina', filtro.pagina).set('tamano', filtro.tamano);
  if (filtro.texto) parametros = parametros.set('texto', filtro.texto);
  if (filtro.estado) parametros = parametros.set('estado', filtro.estado);
  return parametros;
}
