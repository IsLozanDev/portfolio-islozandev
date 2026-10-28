import { inject, Injectable, Injector } from '@angular/core';
import { Router } from '@angular/router';
import { CONFIG_AUTH, PARAMETRO_RETORNO, SesionService } from '@vitrina/shared/auth';
import { MENSAJES_SHELL } from '../models/mensajes-shell';

/**
 * Step-up antes de abrir una acción sensible (TR-RN-009). El interceptor del 13 no reintenta: si el
 * MFA no está vigente se avisa y se va a verificar antes de que el usuario llene nada (specs 16a y 17b).
 * `shared/ui` se carga diferido, como en `erroresHttpInterceptor`, para no sumarlo al bundle inicial.
 */
@Injectable({ providedIn: 'root' })
export class AccionSensibleService {
  private readonly sesion = inject(SesionService);
  private readonly router = inject(Router);
  private readonly injector = inject(Injector);
  private readonly rutaMfa = inject(CONFIG_AUTH).rutas.mfa;

  /** true si el MFA está vigente; si no, avisa, navega a la verificación con retorno y devuelve false. */
  async exigirMfa(): Promise<boolean> {
    if (this.sesion.contexto()?.mfaVigente) return true;
    const retorno = this.router.url;
    const { AvisosService } = await import('@vitrina/shared/ui');
    await this.injector.get(AvisosService).advertencia(MENSAJES_SHELL.tituloMfaRequerida, MENSAJES_SHELL.mfaRequerida);
    await this.router.navigate([this.rutaMfa], { queryParams: { [PARAMETRO_RETORNO]: retorno } });
    return false;
  }
}
