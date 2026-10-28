import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { CONFIG_AUTH } from '@vitrina/shared/auth';
import type { EstadoMembresia } from '../models/miembro';
import { solicitar } from '../utils/solicitar';

const RUTA_MEMBRESIAS = '/seg/membresias';

export type AccionMembresia = 'suspender' | 'reactivar' | 'finalizar';

/** Ciclo de vida de la membresía (spec 08, TR-RF-014). Los errores salen como `ErrorAdmin`. */
@Injectable({ providedIn: 'root' })
export class MembresiasCliente {
  private readonly http = inject(HttpClient);
  private readonly urlMembresias = inject(CONFIG_AUTH).apiUrl + RUTA_MEMBRESIAS;

  /** TR-RNF-021: el motivo lo pide la confirmación; `confirmar: true` lo exige la API. */
  async ejecutar(accion: AccionMembresia, membresiaId: string, motivo: string): Promise<EstadoMembresia> {
    const url = `${this.urlMembresias}/${encodeURIComponent(membresiaId)}/${accion}`;
    const respuesta = await solicitar(this.http.post<{ estado: EstadoMembresia }>(url, { motivo, confirmar: true }));
    return respuesta.estado;
  }
}
