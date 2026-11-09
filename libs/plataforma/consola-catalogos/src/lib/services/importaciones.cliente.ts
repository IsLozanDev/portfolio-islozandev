import { HttpClient, HttpParams, type HttpResponse } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { CONFIG_AUTH } from '@vitrina/shared/auth';
import {
  aDetalleImportacion,
  aImportacionActiva,
  aImportacionListada,
  aPrevisualizacion,
  type DetalleImportacion,
  type DetalleImportacionRespuesta,
  type HistorialImportaciones,
  type HistorialImportacionesRespuesta,
  type ImportacionActiva,
  type ImportacionActivaRespuesta,
  type ImportacionEncolada,
  type Previsualizacion,
  type PrevisualizacionRespuesta,
} from '../models/importacion';
import { descargarArchivo } from '../utils/descargar-archivo';
import { solicitar } from '../utils/solicitar';
import { RUTA_CATALOGOS } from './catalogos.cliente';

export interface ArchivoAPrevisualizar {
  archivo: File;
  versionOficial: string;
  /** YYYY-MM-DD. */
  fechaVigencia: string;
}

export interface PaginaHistorial {
  pagina: number;
  tamano: number;
}

const NOMBRE_ERRORES_POR_DEFECTO = 'errores.csv';
const NOMBRE_EN_CONTENT_DISPOSITION = /filename="?([^";]+)"?/i;

/**
 * Importación de las tablas oficiales (19b). El stream SSE va aparte, con `fetch`. Los errores salen como
 * `ErrorCatalogos`; el 422 de filas inválidas, como `ErrorFilasInvalidas`.
 */
@Injectable({ providedIn: 'root' })
export class ImportacionesCliente {
  private readonly http = inject(HttpClient);
  private readonly urlCatalogos = inject(CONFIG_AUTH).apiUrl + RUTA_CATALOGOS;

  async previsualizar(codigoCatalogo: string, datos: ArchivoAPrevisualizar): Promise<Previsualizacion> {
    const formulario = new FormData();
    formulario.append('version_oficial', datos.versionOficial);
    formulario.append('fecha_vigencia', datos.fechaVigencia);
    formulario.append('archivo', datos.archivo, datos.archivo.name);
    return aPrevisualizacion(await solicitar(this.http.post<PrevisualizacionRespuesta>(this.urlHistorial(codigoCatalogo), formulario)));
  }

  aplicar(importacionId: string, version: number): Promise<ImportacionEncolada> {
    return solicitar(this.http.post<ImportacionEncolada>(`${this.urlImportacion(importacionId)}/aplicar`, { version }));
  }

  async historial(codigoCatalogo: string, pagina: PaginaHistorial): Promise<HistorialImportaciones> {
    const parametros = new HttpParams().set('pagina', pagina.pagina).set('tamano', pagina.tamano);
    const respuesta = await solicitar(this.http.get<HistorialImportacionesRespuesta>(this.urlHistorial(codigoCatalogo), { params: parametros }));
    return { items: respuesta.items.map(aImportacionListada), total: respuesta.total };
  }

  /** Las del usuario que siguen en cola, para retomar su seguimiento al iniciar sesión o recargar. */
  async activas(): Promise<ImportacionActiva[]> {
    const parametros = new HttpParams().set('activas', true);
    const respuesta = await solicitar(this.http.get<ImportacionActivaRespuesta[]>(`${this.urlCatalogos}/importaciones`, { params: parametros }));
    return respuesta.map(aImportacionActiva);
  }

  async detalle(importacionId: string): Promise<DetalleImportacion> {
    return aDetalleImportacion(await solicitar(this.http.get<DetalleImportacionRespuesta>(this.urlImportacion(importacionId))));
  }

  /** Con `HttpClient` y no con un enlace directo: así el interceptor pone el Bearer. */
  async descargarErrores(importacionId: string): Promise<void> {
    const url = `${this.urlImportacion(importacionId)}/errores.csv`;
    const respuesta = await solicitar(this.http.get(url, { observe: 'response', responseType: 'blob' }));
    descargarArchivo(respuesta.body ?? new Blob(), nombreDeArchivo(respuesta));
  }

  private urlHistorial(codigoCatalogo: string): string {
    return `${this.urlCatalogos}/${encodeURIComponent(codigoCatalogo)}/importaciones`;
  }

  private urlImportacion(importacionId: string): string {
    return `${this.urlCatalogos}/importaciones/${encodeURIComponent(importacionId)}`;
  }
}

function nombreDeArchivo(respuesta: HttpResponse<Blob>): string {
  const disposicion = respuesta.headers.get('Content-Disposition') ?? '';
  return NOMBRE_EN_CONTENT_DISPOSITION.exec(disposicion)?.[1] ?? NOMBRE_ERRORES_POR_DEFECTO;
}
