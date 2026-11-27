import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { CONFIG_AUTH } from '@vitrina/shared/auth';
import { aErrorPlantilla } from '../models/errores-plantilla';
import { ErrorAdmin } from '../models/error-admin';
import {
  aDetallePlantilla,
  aPaginaPlantillas,
  aVersionPlantilla,
  aVistaPrevia,
  parametrosConsultaPlantillas,
  type CanalPlantilla,
  type ContenidoPlantilla,
  type DetallePlantilla,
  type DetallePlantillaRespuesta,
  type FiltroPlantillas,
  type PaginaPlantillas,
  type PaginaPlantillasRespuesta,
  type VersionPlantilla,
  type VersionPlantillaRespuesta,
  type VistaPrevia,
  type VistaPreviaRespuesta,
} from '../models/plantilla';
import { solicitar } from '../utils/solicitar';

const RUTA_PLANTILLAS = '/notificaciones/plantillas';

/**
 * Plantillas de notificación del tenant (TR-RF-074, spec 43). Los errores salen como `ErrorAdmin`;
 * VARIABLE_NO_PERMITIDA, CONTENIDO_PLANTILLA_INVALIDO y VERSION_OBSOLETA, como los de `errores-plantilla`.
 */
@Injectable({ providedIn: 'root' })
export class PlantillasCliente {
  private readonly http = inject(HttpClient);
  private readonly urlPlantillas = inject(CONFIG_AUTH).apiUrl + RUTA_PLANTILLAS;

  async listar(filtro: FiltroPlantillas): Promise<PaginaPlantillas> {
    const peticion = this.http.get<PaginaPlantillasRespuesta>(this.urlPlantillas, { params: parametrosConsultaPlantillas(filtro) });
    return aPaginaPlantillas(await solicitar(peticion));
  }

  async obtener(codigo: string, canal: CanalPlantilla): Promise<DetallePlantilla> {
    return aDetallePlantilla(await solicitar(this.http.get<DetallePlantillaRespuesta>(this.urlDe(codigo, canal))));
  }

  async versiones(codigo: string, canal: CanalPlantilla): Promise<VersionPlantilla[]> {
    const respuesta = await solicitar(this.http.get<VersionPlantillaRespuesta[]>(`${this.urlDe(codigo, canal)}/versiones`));
    return respuesta.map(aVersionPlantilla);
  }

  /** Lo que falte se toma de la vigente; no guarda ni envía. */
  async vistaPrevia(codigo: string, canal: CanalPlantilla, texto: { asunto?: string; cuerpo?: string }): Promise<VistaPrevia> {
    const peticion = this.http.post<VistaPreviaRespuesta>(`${this.urlDe(codigo, canal)}/vista-previa`, texto);
    return aVistaPrevia(await this.conErroresDePlantilla(solicitar(peticion)));
  }

  /** Devuelve la versión nueva con el cuerpo ya saneado por el servidor. */
  async guardar(codigo: string, canal: CanalPlantilla, contenido: ContenidoPlantilla): Promise<DetallePlantilla> {
    const cuerpo = { asunto: contenido.asunto, cuerpo: contenido.cuerpo, version: contenido.version };
    const peticion = this.http.put<DetallePlantillaRespuesta>(this.urlDe(codigo, canal), cuerpo);
    return aDetallePlantilla(await this.conErroresDePlantilla(solicitar(peticion)));
  }

  async restaurarBase(codigo: string, canal: CanalPlantilla): Promise<void> {
    await solicitar(this.http.delete(`${this.urlDe(codigo, canal)}/personalizacion`));
  }

  private async conErroresDePlantilla<T>(peticion: Promise<T>): Promise<T> {
    try {
      return await peticion;
    } catch (error) {
      throw error instanceof ErrorAdmin ? aErrorPlantilla(error) : error;
    }
  }

  private urlDe(codigo: string, canal: CanalPlantilla): string {
    return `${this.urlPlantillas}/${encodeURIComponent(codigo)}/${encodeURIComponent(canal)}`;
  }
}
