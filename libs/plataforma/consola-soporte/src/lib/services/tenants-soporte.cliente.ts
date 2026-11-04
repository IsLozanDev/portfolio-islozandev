import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { CONFIG_AUTH } from '@vitrina/shared/auth';
import type { TenantElegible } from '../models/acceso-del-agente';
import { solicitar } from '../utils/solicitar';

const RUTA_TENANTS = '/org/tenants';
/** Las opciones del autocompletar del tenant: una sola página corta. */
const TAMANO_OPCIONES_TENANT = 20;

/** `GET /v1/org/tenants` del operador (spec 17a): `PLAT_AGENTE_SOPORTE` trae `plat.tenant.consultar`. */
@Injectable({ providedIn: 'root' })
export class TenantsSoporteCliente {
  private readonly http = inject(HttpClient);
  private readonly urlTenants = inject(CONFIG_AUTH).apiUrl + RUTA_TENANTS;

  async buscar(texto: string): Promise<TenantElegible[]> {
    const params = new HttpParams().set('q', texto).set('pagina', 1).set('tamano', TAMANO_OPCIONES_TENANT);
    const respuesta = await solicitar(this.http.get<{ items: TenantElegible[] }>(this.urlTenants, { params }));
    return respuesta.items.map(({ id, codigo, nombre }) => ({ id, codigo, nombre }));
  }
}
