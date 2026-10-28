import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { CONFIG_AUTH } from '@vitrina/shared/auth';
import { aCuerpoAlta, aRespuestaAlta, type RespuestaAltaTenant, type RespuestaAltaTenantCuerpo, type SolicitudAltaTenant } from '../models/alta-tenant';
import type { Listado } from '../models/listado';
import {
  aTenantDetalle,
  aTenantListado,
  type FiltroTenants,
  type ResultadoCambioEstado,
  type SolicitudCambioEstado,
  type TenantDetalle,
  type TenantDetalleRespuesta,
  type TenantListado,
  type TenantListadoRespuesta,
} from '../models/tenant';
import { solicitar } from '../utils/solicitar';

const RUTA_TENANTS = '/org/tenants';

/** Tenants para el operador (specs 12 y 17a). Los errores salen como `ErrorConsola`. */
@Injectable({ providedIn: 'root' })
export class TenantsCliente {
  private readonly http = inject(HttpClient);
  private readonly urlTenants = inject(CONFIG_AUTH).apiUrl + RUTA_TENANTS;

  async listar(filtro: FiltroTenants): Promise<Listado<TenantListado>> {
    const respuesta = await solicitar(this.http.get<Listado<TenantListadoRespuesta>>(this.urlTenants, { params: parametrosDe(filtro) }));
    return { items: respuesta.items.map(aTenantListado), total: respuesta.total };
  }

  async consultar(tenantId: string): Promise<TenantDetalle> {
    return aTenantDetalle(await solicitar(this.http.get<TenantDetalleRespuesta>(this.urlDe(tenantId))));
  }

  async crear(solicitud: SolicitudAltaTenant): Promise<RespuestaAltaTenant> {
    return aRespuestaAlta(await solicitar(this.http.post<RespuestaAltaTenantCuerpo>(this.urlTenants, aCuerpoAlta(solicitud))));
  }

  async cambiarEstado(tenantId: string, cambio: SolicitudCambioEstado): Promise<ResultadoCambioEstado> {
    return solicitar(this.http.post<ResultadoCambioEstado>(`${this.urlDe(tenantId)}/estado`, cambio));
  }

  private urlDe(tenantId: string): string {
    return `${this.urlTenants}/${encodeURIComponent(tenantId)}`;
  }
}

function parametrosDe(filtro: FiltroTenants): HttpParams {
  let parametros = new HttpParams().set('pagina', filtro.pagina).set('tamano', filtro.tamano);
  if (filtro.q) parametros = parametros.set('q', filtro.q);
  if (filtro.estado) parametros = parametros.set('estado', filtro.estado);
  if (filtro.producto) parametros = parametros.set('producto', filtro.producto);
  return parametros;
}
