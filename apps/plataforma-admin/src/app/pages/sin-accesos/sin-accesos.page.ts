import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { Router } from '@angular/router';
import { CONFIG_AUTH, SesionService } from '@vitrina/shared/auth';

/** TR-CA-046. */
export const MENSAJE_SIN_ACCESOS = 'No tiene accesos vigentes; contacte a su administrador';

@Component({
  selector: 'vit-sin-accesos',
  imports: [MatButtonModule],
  templateUrl: './sin-accesos.page.html',
})
export class SinAccesosPage {
  private readonly sesion = inject(SesionService);
  private readonly router = inject(Router);
  private readonly rutas = inject(CONFIG_AUTH).rutas;

  protected readonly mensaje = MENSAJE_SIN_ACCESOS;

  protected async salir(): Promise<void> {
    await this.sesion.salir();
    await this.router.navigateByUrl(this.rutas.ingresar);
  }
}
