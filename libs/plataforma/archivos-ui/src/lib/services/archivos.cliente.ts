import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { CONFIG_AUTH } from '@vitrina/shared/auth';
import {
  aCargaSolicitada,
  aCuerpoSolicitudCarga,
  aEstadoArchivo,
  aUrlDescarga,
  aVersionArchivo,
  aVersionesArchivo,
  aVersionSolicitada,
  DISPOSICION_ADJUNTO,
  type CargaSolicitada,
  type CargaSolicitadaRespuesta,
  type EstadoArchivo,
  type EstadoArchivoRespuesta,
  type SolicitudCarga,
  type SolicitudVersion,
  type UrlDescarga,
  type UrlDescargaRespuesta,
  type VersionArchivo,
  type VersionesArchivo,
  type VersionesArchivoRespuesta,
  type VersionRespuesta,
  type VersionSolicitada,
  type VersionSolicitadaRespuesta,
} from '../models/archivo';
import { aCategoria, type Categoria, type CategoriaRespuesta } from '../models/categoria';
import { solicitar } from '../utils/solicitar';

export const RUTA_ARCHIVOS = '/archivos';

/** Rutas de TR-ARC (specs 33, 34 y 35). Los errores salen como `ErrorArchivos`. */
@Injectable({ providedIn: 'root' })
export class ArchivosCliente {
  private readonly http = inject(HttpClient);
  private readonly urlArchivos = inject(CONFIG_AUTH).apiUrl + RUTA_ARCHIVOS;

  async categorias(): Promise<Categoria[]> {
    return (await solicitar(this.http.get<CategoriaRespuesta[]>(`${this.urlArchivos}/categorias`))).map(aCategoria);
  }

  async solicitarCarga(solicitud: SolicitudCarga): Promise<CargaSolicitada> {
    const peticion = this.http.post<CargaSolicitadaRespuesta>(`${this.urlArchivos}/cargas`, aCuerpoSolicitudCarga(solicitud));
    return aCargaSolicitada(await solicitar(peticion));
  }

  async confirmarCarga(archivoId: string): Promise<EstadoArchivo> {
    return aEstadoArchivo(await solicitar(this.http.post<EstadoArchivoRespuesta>(`${this.urlArchivo(archivoId)}/confirmar`, null)));
  }

  async solicitarVersion(archivoId: string, solicitud: SolicitudVersion): Promise<VersionSolicitada> {
    const peticion = this.http.post<VersionSolicitadaRespuesta>(`${this.urlArchivo(archivoId)}/versiones`, { tamano: solicitud.tamano, mime: solicitud.mime });
    return aVersionSolicitada(await solicitar(peticion));
  }

  async confirmarVersion(archivoId: string, numero: number): Promise<VersionArchivo> {
    return aVersionArchivo(await solicitar(this.http.post<VersionRespuesta>(`${this.urlArchivo(archivoId)}/versiones/${numero}/confirmar`, null)));
  }

  async versiones(archivoId: string): Promise<VersionesArchivo> {
    return aVersionesArchivo(await solicitar(this.http.get<VersionesArchivoRespuesta>(`${this.urlArchivo(archivoId)}/versiones`)));
  }

  async marcarVigente(archivoId: string, version: number): Promise<EstadoArchivo> {
    return aEstadoArchivo(await solicitar(this.http.patch<EstadoArchivoRespuesta>(`${this.urlArchivo(archivoId)}/version-vigente`, { version })));
  }

  async estado(archivoId: string): Promise<EstadoArchivo> {
    return aEstadoArchivo(await solicitar(this.http.get<EstadoArchivoRespuesta>(this.urlArchivo(archivoId))));
  }

  /** URL firmada con `attachment`: el navegador la descarga con el nombre original. Sin `version`, la vigente. */
  async urlDescarga(archivoId: string, version?: number): Promise<UrlDescarga> {
    let params = new HttpParams().set('disposicion', DISPOSICION_ADJUNTO);
    if (version !== undefined) params = params.set('version', version);
    return aUrlDescarga(await solicitar(this.http.get<UrlDescargaRespuesta>(`${this.urlArchivo(archivoId)}/descarga`, { params })));
  }

  private urlArchivo(archivoId: string): string {
    return `${this.urlArchivos}/${encodeURIComponent(archivoId)}`;
  }
}
