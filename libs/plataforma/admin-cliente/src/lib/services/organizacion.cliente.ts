import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { CONFIG_AUTH } from '@vitrina/shared/auth';
import type { Listado } from '../models/listado';
import {
  aEmpresa,
  aSucursal,
  aUnidad,
  type EmpresaRespuesta,
  type SucursalRespuesta,
  type Ubicacion,
  type UnidadRespuesta,
} from '../models/ubicacion';
import { solicitar } from '../utils/solicitar';

/** Máximo de la API (spec 17a): el selector muestra todo el tenant de una vez. */
const TAMANO_SELECTOR = 100;
/** Solo se asigna sobre empresas, sucursales y unidades activas. */
const PARAMETROS_SELECTOR = new HttpParams().set('tamano', TAMANO_SELECTOR).set('activo', true);

/** Lecturas de org del spec 17a para el selector de alcance. Los errores salen como `ErrorAdmin`. */
@Injectable({ providedIn: 'root' })
export class OrganizacionCliente {
  private readonly http = inject(HttpClient);
  private readonly urlOrg = inject(CONFIG_AUTH).apiUrl + '/org';

  async empresas(): Promise<Ubicacion[]> {
    const respuesta = await solicitar(this.http.get<Listado<EmpresaRespuesta>>(`${this.urlOrg}/empresas`, { params: PARAMETROS_SELECTOR }));
    return respuesta.items.map(aEmpresa);
  }

  async sucursales(empresaId: string): Promise<Ubicacion[]> {
    const url = `${this.urlOrg}/empresas/${encodeURIComponent(empresaId)}/sucursales`;
    const respuesta = await solicitar(this.http.get<Listado<SucursalRespuesta>>(url, { params: PARAMETROS_SELECTOR }));
    return respuesta.items.map(aSucursal);
  }

  async unidades(sucursalId: string): Promise<Ubicacion[]> {
    const parametros = PARAMETROS_SELECTOR.set('sucursal_id', sucursalId);
    const respuesta = await solicitar(this.http.get<Listado<UnidadRespuesta>>(`${this.urlOrg}/unidades`, { params: parametros }));
    return respuesta.items.map(aUnidad);
  }
}
