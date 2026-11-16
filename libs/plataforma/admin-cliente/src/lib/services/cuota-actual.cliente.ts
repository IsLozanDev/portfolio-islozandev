import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { CONFIG_AUTH } from '@vitrina/shared/auth';
import { aCuotaActual, type CuotaActual, type CuotaActualRespuesta } from '../models/cuota-actual';
import { solicitar } from '../utils/solicitar';

export const RUTA_CUOTA_ACTUAL = '/identidad/cuota-actual';

/** Consumo DNI/RUC del propio tenant (spec 29, `plat.identidad.cuota`). Los errores salen como `ErrorAdmin`. */
@Injectable({ providedIn: 'root' })
export class CuotaActualCliente {
  private readonly http = inject(HttpClient);
  private readonly url = inject(CONFIG_AUTH).apiUrl + RUTA_CUOTA_ACTUAL;

  async obtener(): Promise<CuotaActual> {
    return aCuotaActual(await solicitar(this.http.get<CuotaActualRespuesta>(this.url)));
  }
}
