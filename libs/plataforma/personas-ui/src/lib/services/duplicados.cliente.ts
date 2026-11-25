import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { CONFIG_AUTH } from '@vitrina/shared/auth';
import {
  aComparacionPar,
  aCuerpoFusion,
  aCuerpoParPersonas,
  aPaginaDuplicados,
  aParametrosDuplicados,
  type ComparacionPar,
  type ComparacionParRespuesta,
  type CriteriosDuplicados,
  type PaginaDuplicados,
  type PaginaDuplicadosRespuesta,
  type SolicitudFusion,
} from '../models/duplicados';
import { aPersonaDetalle, type PersonaDetalle, type PersonaDetalleRespuesta } from '../models/persona';
import { solicitar } from '../utils/solicitar';
import { RUTA_PERSONAS } from './personas.cliente';

/** Rutas de duplicados y fusión de TR-PER (specs 39 y 40). Los errores salen como `ErrorPersonas`. */
@Injectable({ providedIn: 'root' })
export class DuplicadosCliente {
  private readonly http = inject(HttpClient);
  private readonly urlPersonas = inject(CONFIG_AUTH).apiUrl + RUTA_PERSONAS;
  private readonly urlDuplicados = `${this.urlPersonas}/duplicados`;

  async listar(criterios: CriteriosDuplicados): Promise<PaginaDuplicados> {
    const peticion = this.http.get<PaginaDuplicadosRespuesta>(this.urlDuplicados, { params: aParametrosDuplicados(criterios) });
    return aPaginaDuplicados(await solicitar(peticion));
  }

  async comparar(personaAId: string, personaBId: string): Promise<ComparacionPar> {
    return aComparacionPar(await solicitar(this.http.get<ComparacionParRespuesta>(this.urlPar(personaAId, personaBId))));
  }

  async descartar(personaAId: string, personaBId: string): Promise<void> {
    await solicitar(this.http.post<void>(`${this.urlDuplicados}/descartes`, aCuerpoParPersonas(personaAId, personaBId)));
  }

  async quitarDescarte(personaAId: string, personaBId: string): Promise<void> {
    await solicitar(this.http.delete<void>(`${this.urlDuplicados}/descartes/${this.segmentosPar(personaAId, personaBId)}`));
  }

  /** Devuelve la ficha conservada. */
  async fusionar(solicitud: SolicitudFusion): Promise<PersonaDetalle> {
    const peticion = this.http.post<PersonaDetalleRespuesta>(`${this.urlPersonas}/fusiones`, aCuerpoFusion(solicitud));
    return aPersonaDetalle(await solicitar(peticion));
  }

  private urlPar(personaAId: string, personaBId: string): string {
    return `${this.urlDuplicados}/${this.segmentosPar(personaAId, personaBId)}`;
  }

  private segmentosPar(personaAId: string, personaBId: string): string {
    return `${encodeURIComponent(personaAId)}/${encodeURIComponent(personaBId)}`;
  }
}
