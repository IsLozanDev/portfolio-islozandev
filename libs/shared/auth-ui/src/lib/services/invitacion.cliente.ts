import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { CONFIG_AUTH } from '@vitrina/shared/auth';
import { firstValueFrom } from 'rxjs';
import {
  aErrorInvitacion,
  aEstadoInvitacion,
  aInvitacionAceptada,
  type EstadoInvitacion,
  type EstadoInvitacionRespuesta,
  type InvitacionAceptada,
  type InvitacionAceptadaRespuesta,
} from '../models/invitacion';

const RUTA_INVITACIONES = '/seg/invitaciones';

/** API de invitaciones del spec 08. Los errores salen como `ErrorInvitacion`. */
@Injectable({ providedIn: 'root' })
export class InvitacionCliente {
  private readonly http = inject(HttpClient);
  private readonly urlInvitaciones = inject(CONFIG_AUTH).apiUrl + RUTA_INVITACIONES;

  async consultar(token: string): Promise<EstadoInvitacion> {
    try {
      const url = `${this.urlInvitaciones}/${encodeURIComponent(token)}`;
      return aEstadoInvitacion(await firstValueFrom(this.http.get<EstadoInvitacionRespuesta>(url)));
    } catch (error) {
      throw aErrorInvitacion(error);
    }
  }

  async aceptar(token: string): Promise<InvitacionAceptada> {
    try {
      const url = `${this.urlInvitaciones}/aceptar`;
      return aInvitacionAceptada(await firstValueFrom(this.http.post<InvitacionAceptadaRespuesta>(url, { token })));
    } catch (error) {
      throw aErrorInvitacion(error);
    }
  }
}
