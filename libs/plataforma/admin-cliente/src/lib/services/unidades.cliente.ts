import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { CONFIG_AUTH } from '@vitrina/shared/auth';
import { aListado, type Listado } from '../models/listado';
import {
  cuerpoDatosUnidad,
  datosDeUnidad,
  filaAUnidad,
  type AltaUnidad,
  type DatosUnidad,
  type FilaUnidadRespuesta,
  type FiltroUnidades,
  type Unidad,
  type UnidadRegistradaRespuesta,
} from '../models/unidad';
import { solicitar } from '../utils/solicitar';

const RUTA_UNIDADES = '/org/unidades';

/** Unidades operativas de una empresa (spec 17a y 17c, TR-RF-004). Los errores salen como `ErrorAdmin`. */
@Injectable({ providedIn: 'root' })
export class UnidadesCliente {
  private readonly http = inject(HttpClient);
  private readonly urlUnidades = inject(CONFIG_AUTH).apiUrl + RUTA_UNIDADES;

  async listar(filtro: FiltroUnidades): Promise<Listado<Unidad>> {
    const respuesta = await solicitar(this.http.get<Listado<FilaUnidadRespuesta>>(this.urlUnidades, { params: parametrosDe(filtro) }));
    return aListado(respuesta, filaAUnidad);
  }

  async consultar(unidadId: string): Promise<Unidad> {
    return filaAUnidad(await solicitar(this.http.get<FilaUnidadRespuesta>(this.urlDe(unidadId))));
  }

  async registrar(alta: AltaUnidad): Promise<string> {
    const cuerpo = { empresa_id: alta.empresaId, sucursal_id: alta.sucursalId, tipo: alta.tipo, ...cuerpoDatosUnidad(alta) };
    return (await solicitar(this.http.post<UnidadRegistradaRespuesta>(this.urlUnidades, cuerpo))).unidad_id;
  }

  async editar(unidadId: string, version: number, datos: DatosUnidad): Promise<void> {
    await solicitar(this.http.put(this.urlDe(unidadId), { version, ...cuerpoDatosUnidad(datos) }));
  }

  async inactivar(unidadId: string): Promise<void> {
    await solicitar(this.http.post(`${this.urlDe(unidadId)}/inactivar`, {}));
  }

  /** El `PUT` reemplaza los datos: se reenvían los de la fila con su versión. */
  async reactivar(unidad: Unidad): Promise<void> {
    const cuerpo = { version: unidad.version, activo: true, ...cuerpoDatosUnidad(datosDeUnidad(unidad)) };
    await solicitar(this.http.put(this.urlDe(unidad.id), cuerpo));
  }

  private urlDe(unidadId: string): string {
    return `${this.urlUnidades}/${encodeURIComponent(unidadId)}`;
  }
}

function parametrosDe(filtro: FiltroUnidades): HttpParams {
  let parametros = new HttpParams().set('empresa_id', filtro.empresaId).set('pagina', filtro.pagina).set('tamano', filtro.tamano);
  if (filtro.sucursalId) parametros = parametros.set('sucursal_id', filtro.sucursalId);
  if (filtro.tipo) parametros = parametros.set('tipo', filtro.tipo);
  if (filtro.activo !== undefined) parametros = parametros.set('activo', filtro.activo);
  return parametros;
}
