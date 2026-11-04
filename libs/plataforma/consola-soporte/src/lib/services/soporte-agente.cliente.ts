import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { CONFIG_AUTH } from '@vitrina/shared/auth';
import { aAccesoDelAgente, type AccesoDelAgente, type AccesoDelAgenteRespuesta, type SolicitudDeAcceso } from '../models/acceso-del-agente';
import { solicitar } from '../utils/solicitar';

const RUTA_SOPORTE = '/seg/soporte';

/** Lo que usa el agente desde la consola (spec 18). Los errores salen como `ErrorSoporte`. */
@Injectable({ providedIn: 'root' })
export class SoporteAgenteCliente {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = inject(CONFIG_AUTH).apiUrl;

  async misAccesos(): Promise<AccesoDelAgente[]> {
    const respuesta = await solicitar(this.http.get<AccesoDelAgenteRespuesta[]>(`${this.apiUrl}${RUTA_SOPORTE}/mis-accesos`));
    return respuesta.map(aAccesoDelAgente);
  }

  async solicitar(solicitud: SolicitudDeAcceso): Promise<string> {
    const cuerpo = { tenant_id: solicitud.tenantId, ticket: solicitud.ticket, motivo: solicitud.motivo, modo: solicitud.modo, horas: solicitud.horas };
    return (await solicitar(this.http.post<{ id: string }>(`${this.apiUrl}${RUTA_SOPORTE}/solicitudes`, cuerpo))).id;
  }

  /** La API fija el tenant preferido; el token nuevo lo trae tras `refrescarSesion()`. */
  async entrar(accesoId: string): Promise<void> {
    await solicitar(this.http.post(`${this.apiUrl}${RUTA_SOPORTE}/accesos/${encodeURIComponent(accesoId)}/entrar`, {}));
  }
}
