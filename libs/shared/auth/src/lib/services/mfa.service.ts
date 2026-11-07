import { HttpClient, HttpContext } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { CONFIG_AUTH } from '../config/config';
import { aErrorDeIngreso } from '../models/error-ingreso-api';
import { aErrorAuth } from '../models/errores';
import { OMITIR_AVISO_ERROR } from '../models/omitir-aviso-error';
import type { SesionApiRespuesta } from '../models/sesion-api';
import { SesionService } from './sesion.service';
import { SupabaseCliente } from './supabase.cliente';

const NIVEL_MFA = 'aal2';
const TIPO_TOTP = 'totp';
const ESTADO_SIN_VERIFICAR = 'unverified';
const NOMBRE_FACTOR_TOTP = 'App autenticadora';
/** Spec 18b: el código pasa por la API, que registra los fallos y bloquea tras cinco seguidos. */
export const RUTA_VERIFICAR_MFA = '/seg/auth/mfa/verificar';

export interface NivelSesion {
  nivelActual: string | null;
  nivelSiguiente: string | null;
}

export interface EstadoMfa extends NivelSesion {
  /** Factor TOTP verificado; `null` si hay que enrolar. */
  factorTotpId: string | null;
}

export interface EnrolamientoTotp {
  factorId: string;
  /** SVG en data URI para mostrar como imagen. */
  qr: string;
  secreto: string;
}

/** MFA TOTP de cliente (TR-RF-017). La recencia de 15 min la valida la API (spec 05). */
@Injectable({ providedIn: 'root' })
export class MfaService {
  private readonly supabase = inject(SupabaseCliente);
  private readonly sesion = inject(SesionService);
  private readonly http = inject(HttpClient);
  private readonly config = inject(CONFIG_AUTH);

  async nivel(): Promise<NivelSesion> {
    const { data, error } = await this.supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (error) throw aErrorAuth(error);
    return { nivelActual: data.currentLevel, nivelSiguiente: data.nextLevel };
  }

  /** Para que la página de MFA decida entre enrolar y desafiar. */
  async estado(): Promise<EstadoMfa> {
    const [nivel, factores] = await Promise.all([this.nivel(), this.listarFactores()]);
    return { ...nivel, factorTotpId: factores.totp[0]?.id ?? null };
  }

  /** Tiene un factor verificado y la sesión sigue en aal1. */
  async requiereVerificacion(): Promise<boolean> {
    const { nivelActual, nivelSiguiente } = await this.nivel();
    return nivelSiguiente === NIVEL_MFA && nivelActual !== NIVEL_MFA;
  }

  async tieneNivelMfa(): Promise<boolean> {
    const { nivelActual } = await this.nivel();
    return nivelActual === NIVEL_MFA;
  }

  /** Borra antes los TOTP sin verificar: un enrolamiento abandonado bloquea el siguiente por nombre repetido. */
  async enrolarTotp(): Promise<EnrolamientoTotp> {
    await this.borrarTotpSinVerificar();
    const { data, error } = await this.supabase.auth.mfa.enroll({ factorType: TIPO_TOTP, friendlyName: NOMBRE_FACTOR_TOTP });
    if (error) throw aErrorAuth(error);
    return { factorId: data.id, qr: data.totp.qr_code, secreto: data.totp.secret };
  }

  /**
   * Sirve para el desafío del ingreso y para confirmar el enrolamiento. El token nuevo ya es aal2: se recarga
   * el contexto para reflejar `mfaVigente`; si eso falla, el MFA igual quedó hecho.
   */
  async verificarTotp(factorId: string, codigo: string): Promise<void> {
    const context = new HttpContext().set(OMITIR_AVISO_ERROR, true);
    const respuesta = await firstValueFrom(
      this.http.post<SesionApiRespuesta>(this.config.apiUrl + RUTA_VERIFICAR_MFA, { factorId, codigo }, { context }),
    ).catch((error: unknown) => {
      throw aErrorDeIngreso(error, 'CODIGO_MFA_INVALIDO');
    });
    await this.sesion.establecerSesion(respuesta);
    await this.sesion.intentarCargarContexto();
  }

  private async listarFactores() {
    const { data, error } = await this.supabase.auth.mfa.listFactors();
    if (error) throw aErrorAuth(error);
    return data;
  }

  private async borrarTotpSinVerificar(): Promise<void> {
    const { all } = await this.listarFactores();
    const pendientes = all.filter((factor) => factor.factor_type === TIPO_TOTP && factor.status === ESTADO_SIN_VERIFICAR);
    for (const factor of pendientes) {
      const { error } = await this.supabase.auth.mfa.unenroll({ factorId: factor.id });
      if (error) throw aErrorAuth(error);
    }
  }
}
