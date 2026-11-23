import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { CONFIG_AUTH } from '@vitrina/shared/auth';
import { aDecisionesVigentes, type ConsentimientosRespuesta, type DecisionVigente } from '../models/consentimiento';
import { solicitar } from '../utils/solicitar';
import { RUTA_PERSONAS } from './personas.cliente';

/** Lectura de decisiones de consentimiento (spec 37). Registrar y revocar no son de esta lib. */
@Injectable({ providedIn: 'root' })
export class ConsentimientosCliente {
  private readonly http = inject(HttpClient);
  private readonly urlPersonas = inject(CONFIG_AUTH).apiUrl + RUTA_PERSONAS;

  async vigentes(personaId: string): Promise<DecisionVigente[]> {
    const peticion = this.http.get<ConsentimientosRespuesta>(`${this.urlPersonas}/${encodeURIComponent(personaId)}/consentimientos`);
    return aDecisionesVigentes(await solicitar(peticion));
  }
}
