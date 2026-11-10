import { HttpClient, HttpContext, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { CONFIG_AUTH, OMITIR_AVISO_ERROR } from '@vitrina/shared/auth';
import { firstValueFrom } from 'rxjs';
import { aErrorAdmin } from '../models/error-admin';
import {
  aEventoAuditoria,
  aEventoAuditoriaDetalle,
  type EventoAuditoria,
  type EventoAuditoriaDetalle,
  type EventoAuditoriaDetalleRespuesta,
  type EventoAuditoriaRespuesta,
  type FiltroAuditoria,
} from '../models/evento-auditoria';
import { aListado, type Listado } from '../models/listado';
import { aVerificacionIntegridad, type VerificacionIntegridad, type VerificacionIntegridadRespuesta } from '../models/verificacion-integridad';
import { nombreDeArchivo } from '../utils/descarga';
import { conCuerpoJson } from '../utils/error-de-blob';
import { PARAMETRO_URL_AUDITORIA } from '../utils/filtro-url-auditoria';
import { PARAMETRO_URL_ORGANIZACION } from '../utils/filtro-url-organizacion';
import { solicitar } from '../utils/solicitar';
import type { ArchivoExportado } from './bitacora.cliente';

const RUTA_EVENTOS = '/aud/eventos';
const RUTA_EXPORTAR = '/exportar';
const RUTA_INTEGRIDAD = '/aud/integridad';
const CABECERA_DISPOSICION = 'Content-Disposition';
/** `GET /v1/aud/integridad` sin ninguna verificación del tenant todavía (spec 20b). */
const CODIGO_SIN_VERIFICACIONES = 'SIN_VERIFICACIONES';

export type FiltroExportacionAuditoria = Omit<FiltroAuditoria, 'pagina' | 'tamano'>;

/** Auditoría del tenant (specs 20b y 20c, TR-RF-086). Los errores salen como `ErrorAdmin`. */
@Injectable({ providedIn: 'root' })
export class AuditoriaCliente {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = inject(CONFIG_AUTH).apiUrl;
  private readonly urlEventos = this.apiUrl + RUTA_EVENTOS;

  async listar(filtro: FiltroAuditoria): Promise<Listado<EventoAuditoria>> {
    const respuesta = await solicitar(this.http.get<Listado<EventoAuditoriaRespuesta>>(this.urlEventos, { params: parametrosDe(filtro) }));
    return aListado(respuesta, aEventoAuditoria);
  }

  async detalle(eventoId: string): Promise<EventoAuditoriaDetalle> {
    const url = `${this.urlEventos}/${encodeURIComponent(eventoId)}`;
    return aEventoAuditoriaDetalle(await solicitar(this.http.get<EventoAuditoriaDetalleRespuesta>(url)));
  }

  /** XLSX con los filtros aplicados. Sin el aviso global: la página muestra el mensaje de la API (422, 503). */
  async exportar(filtro: FiltroExportacionAuditoria): Promise<ArchivoExportado> {
    const context = new HttpContext().set(OMITIR_AVISO_ERROR, true);
    try {
      const respuesta = await firstValueFrom(
        this.http.get(this.urlEventos + RUTA_EXPORTAR, { params: parametrosDeExportacion(filtro), responseType: 'blob', observe: 'response', context }),
      );
      const nombre = nombreDeArchivo(respuesta.headers.get(CABECERA_DISPOSICION)) ?? nombrePorDefecto(filtro);
      return { archivo: respuesta.body ?? new Blob(), nombre };
    } catch (error) {
      throw aErrorAdmin(await conCuerpoJson(error));
    }
  }

  /** `null` si el tenant aún no tiene verificaciones; un 403 (sin alcance TENANT) sale como error. */
  async ultimaVerificacion(): Promise<VerificacionIntegridad | null> {
    try {
      return aVerificacionIntegridad(await solicitar(this.http.get<VerificacionIntegridadRespuesta>(this.apiUrl + RUTA_INTEGRIDAD)));
    } catch (error) {
      if (aErrorAdmin(error).codigo === CODIGO_SIN_VERIFICACIONES) return null;
      throw error;
    }
  }
}

function nombrePorDefecto(filtro: FiltroExportacionAuditoria): string {
  return `auditoria-${filtro.desde.replaceAll('-', '')}-${filtro.hasta.replaceAll('-', '')}.xlsx`;
}

function parametrosDeExportacion(filtro: FiltroExportacionAuditoria): HttpParams {
  const opcionales: [string, string | undefined][] = [
    [PARAMETRO_URL_AUDITORIA.usuario, filtro.usuario],
    [PARAMETRO_URL_AUDITORIA.accion, filtro.accion],
    [PARAMETRO_URL_AUDITORIA.tipo, filtro.tipo],
    [PARAMETRO_URL_AUDITORIA.sucursalId, filtro.sucursalId],
    [PARAMETRO_URL_AUDITORIA.entidadTipo, filtro.entidadTipo],
    [PARAMETRO_URL_AUDITORIA.entidadId, filtro.entidadId],
    [PARAMETRO_URL_AUDITORIA.personaTitularId, filtro.personaTitularId],
  ];
  return opcionales.reduce(
    (parametros, [clave, valor]) => (valor ? parametros.set(clave, valor) : parametros),
    new HttpParams().set(PARAMETRO_URL_AUDITORIA.desde, filtro.desde).set(PARAMETRO_URL_AUDITORIA.hasta, filtro.hasta),
  );
}

function parametrosDe(filtro: FiltroAuditoria): HttpParams {
  return parametrosDeExportacion(filtro).set(PARAMETRO_URL_ORGANIZACION.pagina, filtro.pagina).set(PARAMETRO_URL_ORGANIZACION.tamano, filtro.tamano);
}
