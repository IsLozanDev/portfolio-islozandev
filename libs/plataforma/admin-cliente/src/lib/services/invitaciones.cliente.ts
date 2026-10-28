import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { CONFIG_AUTH } from '@vitrina/shared/auth';
import { aCuerpoInvitacion, aInvitacionEmitida, type DatosInvitacion, type InvitacionEmitida, type InvitacionEmitidaRespuesta } from '../models/invitacion';
import { solicitar } from '../utils/solicitar';

const RUTA_INVITACIONES = '/seg/invitaciones';

/** Invitar o reinvitar (spec 08, TR-RF-009). Los errores salen como `ErrorAdmin`. */
@Injectable({ providedIn: 'root' })
export class InvitacionesCliente {
  private readonly http = inject(HttpClient);
  private readonly urlInvitaciones = inject(CONFIG_AUTH).apiUrl + RUTA_INVITACIONES;

  async invitar(datos: DatosInvitacion): Promise<InvitacionEmitida> {
    return aInvitacionEmitida(await solicitar(this.http.post<InvitacionEmitidaRespuesta>(this.urlInvitaciones, aCuerpoInvitacion(datos))));
  }
}
