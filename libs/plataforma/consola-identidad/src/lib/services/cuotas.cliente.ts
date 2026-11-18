import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { CONFIG_AUTH } from '@vitrina/shared/auth';
import {
  aDetalleCuota,
  aPaginaCuotas,
  type DetalleCuota,
  type DetalleCuotaRespuesta,
  type PaginaCuotas,
  type PaginaCuotasRespuesta,
} from '../models/cuota';
import type { FiltroCuotas } from '../utils/filtro-url';
import { solicitar } from '../utils/solicitar';

export const RUTA_CUOTAS = '/identidad/cuotas';
export const TAMANO_PAGINA_CUOTAS = 20;

/** Cuotas DNI/RUC de todos los tenants (spec 29, solo operador). Los errores salen como `ErrorIdentidad`. */
@Injectable({ providedIn: 'root' })
export class CuotasCliente {
  private readonly http = inject(HttpClient);
  private readonly urlCuotas = inject(CONFIG_AUTH).apiUrl + RUTA_CUOTAS;

  async listar(filtro: FiltroCuotas): Promise<PaginaCuotas> {
    return aPaginaCuotas(await solicitar(this.http.get<PaginaCuotasRespuesta>(this.urlCuotas, { params: parametrosDe(filtro) })));
  }

  async detalle(tenantId: string, periodo: string): Promise<DetalleCuota> {
    return aDetalleCuota(await solicitar(this.http.get<DetalleCuotaRespuesta>(this.urlCuota(tenantId, periodo))));
  }

  /** Sensible (aal2). La página recarga el detalle después: la respuesta no trae nombre ni contadores. */
  async ajustar(tenantId: string, periodo: string, incluidas: number, version: number): Promise<void> {
    await solicitar(this.http.patch(this.urlCuota(tenantId, periodo), { incluidas, version }));
  }

  private urlCuota(tenantId: string, periodo: string): string {
    return `${this.urlCuotas}/${encodeURIComponent(tenantId)}/${encodeURIComponent(periodo)}`;
  }
}

function parametrosDe(filtro: FiltroCuotas): HttpParams {
  let parametros = new HttpParams().set('periodo', filtro.periodo).set('pagina', filtro.pagina).set('tamano', TAMANO_PAGINA_CUOTAS);
  if (filtro.q) parametros = parametros.set('q', filtro.q);
  return parametros;
}
