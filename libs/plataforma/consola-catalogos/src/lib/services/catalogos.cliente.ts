import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { CONFIG_AUTH } from '@vitrina/shared/auth';
import {
  aCatalogo,
  aCatalogoActualizado,
  aCuerpoActualizarCatalogo,
  aCuerpoCrearCatalogo,
  type CambiosCatalogo,
  type Catalogo,
  type CatalogoActualizado,
  type CatalogoActualizadoRespuesta,
  type CatalogoRespuesta,
  type SolicitudCatalogo,
} from '../models/catalogo';
import { solicitar } from '../utils/solicitar';

export const RUTA_CATALOGOS = '/catalogos';

/** Definiciones de catálogos (19a). Los errores salen como `ErrorCatalogos`. */
@Injectable({ providedIn: 'root' })
export class CatalogosCliente {
  private readonly http = inject(HttpClient);
  private readonly urlCatalogos = inject(CONFIG_AUTH).apiUrl + RUTA_CATALOGOS;

  /** Todos: la API no pagina, son decenas. */
  async listar(): Promise<Catalogo[]> {
    return (await solicitar(this.http.get<CatalogoRespuesta[]>(this.urlCatalogos))).map(aCatalogo);
  }

  async crear(solicitud: SolicitudCatalogo): Promise<Catalogo> {
    return aCatalogo(await solicitar(this.http.post<CatalogoRespuesta>(this.urlCatalogos, aCuerpoCrearCatalogo(solicitud))));
  }

  async actualizar(codigo: string, cambios: CambiosCatalogo, version: number): Promise<CatalogoActualizado> {
    const url = `${this.urlCatalogos}/${encodeURIComponent(codigo)}`;
    return aCatalogoActualizado(await solicitar(this.http.put<CatalogoActualizadoRespuesta>(url, aCuerpoActualizarCatalogo(cambios, version))));
  }
}
