import { inject, Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { CONFIG_AUTH, MfaService, PARAMETRO_RETORNO, rutaDeRetorno } from '@vitrina/shared/auth';

/** Tras ingresar (clave, OAuth o enlace): segundo factor si falta; si no, `returnUrl` o la portada. */
@Injectable({ providedIn: 'root' })
export class DestinoTrasIngresoService {
  private readonly mfa = inject(MfaService);
  private readonly router = inject(Router);
  private readonly rutas = inject(CONFIG_AUTH).rutas;

  async irAlDestino(retorno: string | null): Promise<boolean> {
    const destino = rutaDeRetorno(retorno, this.rutas.inicio);
    if (await this.mfa.requiereVerificacion()) {
      return this.router.navigate([this.rutas.mfa], { queryParams: { [PARAMETRO_RETORNO]: destino } });
    }
    return this.router.navigateByUrl(destino);
  }
}
