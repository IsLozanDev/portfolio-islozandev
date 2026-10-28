import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { CONFIG_AUTH } from '@vitrina/shared/auth';
import { aAsignables, type Asignables, type AsignablesRespuesta } from '../models/asignable';
import { aCuerpoOtorgarAsignacion, type AsignacionOtorgadaRespuesta, type FormularioAsignacion } from '../models/asignacion';
import { solicitar } from '../utils/solicitar';

const RUTA_ASIGNABLES = '/seg/asignables';
const RUTA_ASIGNACIONES = '/seg/asignaciones';

/** Roles y perfiles asignables, otorgar (spec 16a) y revocar (spec 08). Los errores salen como `ErrorAdmin`. */
@Injectable({ providedIn: 'root' })
export class AsignacionesCliente {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = inject(CONFIG_AUTH).apiUrl;

  async asignables(): Promise<Asignables> {
    return aAsignables(await solicitar(this.http.get<AsignablesRespuesta>(this.apiUrl + RUTA_ASIGNABLES)));
  }

  async otorgar(membresiaId: string, formulario: FormularioAsignacion): Promise<string> {
    const cuerpo = aCuerpoOtorgarAsignacion(membresiaId, formulario);
    const respuesta = await solicitar(this.http.post<AsignacionOtorgadaRespuesta>(this.apiUrl + RUTA_ASIGNACIONES, cuerpo));
    return respuesta.asignacion_id;
  }

  /** TR-RNF-021: el motivo lo pide la confirmación; `confirmar: true` lo exige la API. */
  async revocar(asignacionId: string, motivo: string): Promise<void> {
    const url = `${this.apiUrl}${RUTA_ASIGNACIONES}/${encodeURIComponent(asignacionId)}/revocar`;
    await solicitar(this.http.post(url, { motivo, confirmar: true }));
  }
}
