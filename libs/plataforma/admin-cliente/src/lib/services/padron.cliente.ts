import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { CONFIG_AUTH } from '@vitrina/shared/auth';
import { ErrorAdmin } from '../models/error-admin';
import { aDatosPadronRuc, type DatosPadronRuc, type RucPadronRespuesta } from '../models/padron';
import { solicitar } from '../utils/solicitar';

const RUTA_RUC = '/identidad/RUC';
const MOTIVO_REGISTRO_EMPRESA = 'VERIFICACION_IDENTIDAD';
const ESTADO_NO_ENCONTRADO = 404;
const ESTADO_PROVEEDOR_NO_DISPONIBLE = 503;

/** Padrón RUC por la consulta de identidad del spec 28 (spec 28b). */
@Injectable({ providedIn: 'root' })
export class PadronCliente {
  private readonly http = inject(HttpClient);
  private readonly urlRuc = inject(CONFIG_AUTH).apiUrl + RUTA_RUC;

  /** null si el padrón no tiene el RUC o el proveedor no responde (TR-RNF-007): la razón social se escribe a mano. */
  async consultarRuc(ruc: string): Promise<DatosPadronRuc | null> {
    const parametros = new HttpParams().set('motivo', MOTIVO_REGISTRO_EMPRESA);
    try {
      const respuesta = await solicitar(this.http.get<RucPadronRespuesta>(`${this.urlRuc}/${encodeURIComponent(ruc)}`, { params: parametros }));
      return aDatosPadronRuc(respuesta);
    } catch (error) {
      if (esPadronSinDatos(error)) return null;
      throw error;
    }
  }
}

function esPadronSinDatos(error: unknown): boolean {
  return error instanceof ErrorAdmin && (error.estado === ESTADO_NO_ENCONTRADO || error.estado === ESTADO_PROVEEDOR_NO_DISPONIBLE);
}
