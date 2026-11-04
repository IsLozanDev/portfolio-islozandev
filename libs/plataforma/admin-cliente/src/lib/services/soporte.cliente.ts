import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { CONFIG_AUTH } from '@vitrina/shared/auth';
import {
  aSolicitudSoporte,
  ESTADOS_DE_VISTA,
  type AccesoAprobado,
  type AprobacionSoporte,
  type FiltroSolicitudesSoporte,
  type SolicitudSoporte,
  type SolicitudSoporteRespuesta,
} from '../models/acceso-soporte';
import { aListado, type Listado } from '../models/listado';
import { solicitar } from '../utils/solicitar';

const RUTA_SOPORTE = '/seg/soporte';

/** Bandeja del administrador del cliente (spec 18, TR-RF-020). Los errores salen como `ErrorAdmin`. */
@Injectable({ providedIn: 'root' })
export class SoporteCliente {
  private readonly http = inject(HttpClient);
  private readonly urlSoporte = inject(CONFIG_AUTH).apiUrl + RUTA_SOPORTE;

  async listar(filtro: FiltroSolicitudesSoporte): Promise<Listado<SolicitudSoporte>> {
    const params = new HttpParams().set('estado', ESTADOS_DE_VISTA[filtro.vista].join(',')).set('pagina', filtro.pagina).set('tamano', filtro.tamano);
    const respuesta = await solicitar(this.http.get<Listado<SolicitudSoporteRespuesta>>(`${this.urlSoporte}/solicitudes`, { params }));
    return aListado(respuesta, aSolicitudSoporte);
  }

  /** PENDIENTE sin caducar: la insignia del menú. */
  async pendientes(): Promise<number> {
    return (await solicitar(this.http.get<{ total: number }>(`${this.urlSoporte}/solicitudes/pendientes`))).total;
  }

  async aprobar(accesoId: string, aprobacion: AprobacionSoporte): Promise<AccesoAprobado> {
    const cuerpo = { horas: aprobacion.horas, rol_id: aprobacion.rolId, perfil_id: aprobacion.perfilId };
    const respuesta = await solicitar(this.http.post<{ desde: string; hasta: string }>(`${this.urlSolicitud(accesoId)}/aprobar`, cuerpo));
    return { desde: new Date(respuesta.desde), hasta: new Date(respuesta.hasta) };
  }

  async rechazar(accesoId: string, motivo: string): Promise<void> {
    await solicitar(this.http.post(`${this.urlSolicitud(accesoId)}/rechazar`, { motivo }));
  }

  /** TR-RNF-021: el motivo lo pide la confirmación; `confirmar: true` lo exige la API. */
  async revocar(accesoId: string, motivo: string): Promise<void> {
    await solicitar(this.http.post(`${this.urlSoporte}/accesos/${encodeURIComponent(accesoId)}/revocar`, { motivo, confirmar: true }));
  }

  private urlSolicitud(accesoId: string): string {
    return `${this.urlSoporte}/solicitudes/${encodeURIComponent(accesoId)}`;
  }
}
