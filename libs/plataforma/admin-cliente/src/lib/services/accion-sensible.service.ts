import { inject, Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { CONFIG_AUTH, PARAMETRO_RETORNO, SesionService } from '@vitrina/shared/auth';
import { AvisosService } from '@vitrina/shared/ui';
import { MENSAJES_ADMIN } from '../models/mensajes-admin';

/**
 * Step-up antes de abrir una acción sensible (TR-RN-009). El interceptor del 13 no reintenta: si el
 * MFA no está vigente se avisa y se va a verificar antes de que el usuario llene nada (spec 16a, B4).
 */
@Injectable({ providedIn: 'root' })
export class AccionSensibleService {
  private readonly sesion = inject(SesionService);
  private readonly router = inject(Router);
  private readonly avisos = inject(AvisosService);
  private readonly rutaMfa = inject(CONFIG_AUTH).rutas.mfa;

  /** true si el MFA está vigente; si no, avisa, navega a la verificación con retorno y devuelve false. */
  async exigirMfa(): Promise<boolean> {
    if (this.sesion.contexto()?.mfaVigente) return true;
    const retorno = this.router.url;
    await this.avisos.advertencia(MENSAJES_ADMIN.tituloMfaRequerida, MENSAJES_ADMIN.mfaRequerida);
    await this.router.navigate([this.rutaMfa], { queryParams: { [PARAMETRO_RETORNO]: retorno } });
    return false;
  }
}
