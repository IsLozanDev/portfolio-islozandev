import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { CONFIG_AUTH } from '@vitrina/shared/auth';
import { catchError, firstValueFrom, throwError, type Observable } from 'rxjs';
import { aErrorPreferencias, type AlcanceBaja, type BajasDestino, type PreferenciasDestino } from '../models/preferencias';

export const RUTA_PREFERENCIAS = '/notificaciones/preferencias';

/** API pública de preferencias (spec 46). El token va en el cuerpo, nunca en la URL. Errores como `ErrorPreferencias`. */
@Injectable({ providedIn: 'root' })
export class PreferenciasCliente {
  private readonly http = inject(HttpClient);
  private readonly urlPreferencias = inject(CONFIG_AUTH).apiUrl + RUTA_PREFERENCIAS;

  consultar(token: string): Promise<PreferenciasDestino> {
    return solicitar(this.http.post<PreferenciasDestino>(`${this.urlPreferencias}/consultar`, { token }));
  }

  darseDeBaja(token: string, baja: AlcanceBaja): Promise<BajasDestino> {
    return solicitar(this.http.put<BajasDestino>(this.urlPreferencias, { token, baja }));
  }
}

function solicitar<Respuesta>(peticion: Observable<Respuesta>): Promise<Respuesta> {
  return firstValueFrom(peticion.pipe(catchError((error: unknown) => throwError(() => aErrorPreferencias(error)))));
}
