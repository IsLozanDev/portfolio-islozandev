import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { aCuerpoItem, aItemCatalogo, type ItemCatalogo, type ItemCatalogoRespuesta, type SolicitudItem } from '@vitrina/plataforma/catalogos-ui';
import { CONFIG_AUTH } from '@vitrina/shared/auth';
import {
  aCatalogoAdmin,
  aCuerpoAjuste,
  aPaginaItemsAdmin,
  parametrosConsultaItems,
  type AjusteAplicadoRespuesta,
  type CatalogoAdmin,
  type CatalogoAdminRespuesta,
  type FiltroItemsAdmin,
  type PaginaItemsAdmin,
  type PaginaItemsAdminRespuesta,
  type SolicitudAjuste,
} from '../models/catalogo-admin';
import { solicitar } from '../utils/solicitar';

const RUTA_CATALOGOS = '/catalogos';

/** Catálogos del tenant (TR-RF-025 y 026): ítems propios y ajustes de los globales. Los errores salen como `ErrorAdmin`. */
@Injectable({ providedIn: 'root' })
export class CatalogosAdminCliente {
  private readonly http = inject(HttpClient);
  private readonly urlCatalogos = inject(CONFIG_AUTH).apiUrl + RUTA_CATALOGOS;

  /** Todos: la API no pagina, son decenas. */
  async listar(): Promise<CatalogoAdmin[]> {
    return (await solicitar(this.http.get<CatalogoAdminRespuesta[]>(this.urlCatalogos))).map(aCatalogoAdmin);
  }

  async items(codigo: string, filtro: FiltroItemsAdmin): Promise<PaginaItemsAdmin> {
    const url = `${this.urlCatalogo(codigo)}/items/administracion`;
    return aPaginaItemsAdmin(await solicitar(this.http.get<PaginaItemsAdminRespuesta>(url, { params: parametrosConsultaItems(filtro) })));
  }

  async obtenerPropio(codigo: string, itemId: string): Promise<ItemCatalogo> {
    return aItemCatalogo(await solicitar(this.http.get<ItemCatalogoRespuesta>(this.urlItem(codigo, itemId))));
  }

  async crearPropio(codigo: string, solicitud: SolicitudItem): Promise<ItemCatalogo> {
    return aItemCatalogo(await solicitar(this.http.post<ItemCatalogoRespuesta>(`${this.urlCatalogo(codigo)}/items`, aCuerpoItem(solicitud))));
  }

  async actualizarPropio(codigo: string, itemId: string, solicitud: SolicitudItem, version: number): Promise<ItemCatalogo> {
    const cuerpo = { ...aCuerpoItem(solicitud), version };
    return aItemCatalogo(await solicitar(this.http.put<ItemCatalogoRespuesta>(this.urlItem(codigo, itemId), cuerpo)));
  }

  async eliminarPropio(codigo: string, itemId: string, version: number): Promise<void> {
    await solicitar(this.http.delete(this.urlItem(codigo, itemId), { params: { version } }));
  }

  /** `false` si no había cambios: el back no escribió. */
  async ajustar(codigo: string, itemId: string, solicitud: SolicitudAjuste): Promise<boolean> {
    const url = `${this.urlItem(codigo, itemId)}/ajuste`;
    return (await solicitar(this.http.put<AjusteAplicadoRespuesta>(url, aCuerpoAjuste(solicitud)))).cambiado;
  }

  private urlCatalogo(codigo: string): string {
    return `${this.urlCatalogos}/${encodeURIComponent(codigo)}`;
  }

  private urlItem(codigo: string, itemId: string): string {
    return `${this.urlCatalogo(codigo)}/items/${encodeURIComponent(itemId)}`;
  }
}
