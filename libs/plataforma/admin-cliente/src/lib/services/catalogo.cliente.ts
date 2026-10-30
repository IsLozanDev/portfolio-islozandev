import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { CONFIG_AUTH } from '@vitrina/shared/auth';
import {
  aArbolPermisos,
  type ArbolPermisos,
  type ArbolPermisosRespuesta,
  type ProductoDisponible,
  type ProductosDisponiblesRespuesta,
} from '../models/catalogo-permisos';
import { solicitar } from '../utils/solicitar';

const RUTA_PRODUCTOS = '/seg/productos-disponibles';
const RUTA_CATALOGO = '/seg/catalogo';

/** Productos y árbol de permisos del editor de roles (spec 16b). Los errores salen como `ErrorAdmin`. */
@Injectable({ providedIn: 'root' })
export class CatalogoCliente {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = inject(CONFIG_AUTH).apiUrl;

  async productosDisponibles(): Promise<ProductoDisponible[]> {
    return (await solicitar(this.http.get<ProductosDisponiblesRespuesta>(this.apiUrl + RUTA_PRODUCTOS))).items;
  }

  async arbol(productoCodigo: string): Promise<ArbolPermisos> {
    const url = `${this.apiUrl}${RUTA_CATALOGO}/${encodeURIComponent(productoCodigo)}`;
    return aArbolPermisos(await solicitar(this.http.get<ArbolPermisosRespuesta>(url)));
  }
}
