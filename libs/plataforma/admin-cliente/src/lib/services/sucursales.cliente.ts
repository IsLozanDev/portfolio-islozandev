import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { CONFIG_AUTH } from '@vitrina/shared/auth';
import { aListado, type Listado } from '../models/listado';
import {
  cuerpoDatosSucursal,
  datosDeSucursal,
  filaASucursal,
  type DatosSucursal,
  type FilaSucursalRespuesta,
  type FiltroSucursales,
  type Sucursal,
  type SucursalRegistradaRespuesta,
} from '../models/sucursal';
import { solicitar } from '../utils/solicitar';

const RUTA_ORG = '/org';

/** Sucursales de una empresa (spec 17a y 17c, TR-RF-003). Los errores salen como `ErrorAdmin`. */
@Injectable({ providedIn: 'root' })
export class SucursalesCliente {
  private readonly http = inject(HttpClient);
  private readonly urlOrg = inject(CONFIG_AUTH).apiUrl + RUTA_ORG;

  async listar(empresaId: string, filtro: FiltroSucursales): Promise<Listado<Sucursal>> {
    let parametros = new HttpParams().set('pagina', filtro.pagina).set('tamano', filtro.tamano);
    if (filtro.activo !== undefined) parametros = parametros.set('activo', filtro.activo);
    const respuesta = await solicitar(this.http.get<Listado<FilaSucursalRespuesta>>(this.urlSucursalesDe(empresaId), { params: parametros }));
    return aListado(respuesta, filaASucursal);
  }

  async consultar(sucursalId: string): Promise<Sucursal> {
    return filaASucursal(await solicitar(this.http.get<FilaSucursalRespuesta>(this.urlDe(sucursalId))));
  }

  async registrar(empresaId: string, datos: DatosSucursal): Promise<string> {
    const respuesta = await solicitar(this.http.post<SucursalRegistradaRespuesta>(this.urlSucursalesDe(empresaId), cuerpoDatosSucursal(datos)));
    return respuesta.sucursal_id;
  }

  async editar(sucursalId: string, version: number, datos: DatosSucursal): Promise<void> {
    await solicitar(this.http.put(this.urlDe(sucursalId), { version, ...cuerpoDatosSucursal(datos) }));
  }

  async inactivar(sucursalId: string): Promise<void> {
    await solicitar(this.http.post(`${this.urlDe(sucursalId)}/inactivar`, {}));
  }

  /** El `PUT` reemplaza los datos: se reenvían los de la fila con su versión. */
  async reactivar(sucursal: Sucursal): Promise<void> {
    const cuerpo = { version: sucursal.version, activo: true, ...cuerpoDatosSucursal(datosDeSucursal(sucursal)) };
    await solicitar(this.http.put(this.urlDe(sucursal.id), cuerpo));
  }

  /** TR-CA-009: la API traslada la marca y el 0000 en la misma operación. */
  async marcarPrincipal(sucursalId: string): Promise<void> {
    await solicitar(this.http.post(`${this.urlDe(sucursalId)}/principal`, {}));
  }

  private urlSucursalesDe(empresaId: string): string {
    return `${this.urlOrg}/empresas/${encodeURIComponent(empresaId)}/sucursales`;
  }

  private urlDe(sucursalId: string): string {
    return `${this.urlOrg}/sucursales/${encodeURIComponent(sucursalId)}`;
  }
}
