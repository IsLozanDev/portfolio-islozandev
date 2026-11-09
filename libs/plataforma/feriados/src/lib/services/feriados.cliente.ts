import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { CONFIG_AUTH } from '@vitrina/shared/auth';
import { firstValueFrom, type Observable } from 'rxjs';
import { aErrorFeriados } from '../models/error-feriados';
import {
  aCuerpoActualizarFeriado,
  aCuerpoCrearFeriado,
  aPaginaFeriados,
  parametrosConsultaFeriados,
  type CambiosFeriado,
  type FeriadoActualizadoRespuesta,
  type FiltroFeriados,
  type PaginaFeriados,
  type PaginaFeriadosRespuesta,
  type SolicitudFeriado,
} from '../models/feriado';

export const RUTA_FERIADOS = '/feriados';

/** `/v1/feriados` (19c, paginado en el 19e). Los errores salen como `ErrorFeriados`. */
@Injectable({ providedIn: 'root' })
export class FeriadosCliente {
  private readonly http = inject(HttpClient);
  private readonly urlFeriados = inject(CONFIG_AUTH).apiUrl + RUTA_FERIADOS;

  async listar(filtro: FiltroFeriados): Promise<PaginaFeriados> {
    const respuesta = await solicitar(this.http.get<PaginaFeriadosRespuesta>(this.urlFeriados, { params: parametrosConsultaFeriados(filtro) }));
    return aPaginaFeriados(respuesta);
  }

  async crear(solicitud: SolicitudFeriado): Promise<void> {
    await solicitar(this.http.post(this.urlFeriados, aCuerpoCrearFeriado(solicitud)));
  }

  /** `false` si no había cambios: el back no escribió. */
  async actualizar(feriadoId: string, cambios: CambiosFeriado, version: number): Promise<boolean> {
    const respuesta = await solicitar(this.http.put<FeriadoActualizadoRespuesta>(this.urlDe(feriadoId), aCuerpoActualizarFeriado(cambios, version)));
    return respuesta.cambiado;
  }

  async eliminar(feriadoId: string, version: number): Promise<void> {
    await solicitar(this.http.delete(this.urlDe(feriadoId), { params: { version } }));
  }

  private urlDe(feriadoId: string): string {
    return `${this.urlFeriados}/${encodeURIComponent(feriadoId)}`;
  }
}

async function solicitar<T>(peticion: Observable<T>): Promise<T> {
  try {
    return await firstValueFrom(peticion);
  } catch (error) {
    throw aErrorFeriados(error);
  }
}
