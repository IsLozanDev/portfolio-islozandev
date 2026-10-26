import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { Router } from '@angular/router';
import { CONFIG_AUTH, SesionService } from '@vitrina/shared/auth';
import { MENSAJES_SHELL } from '../../models/mensajes-shell';

/** TR-CA-046: fuera del layout, porque sin accesos no hay menú que pintar. */
@Component({
  selector: 'vit-sin-accesos',
  imports: [MatButtonModule],
  templateUrl: './sin-accesos.page.html',
})
export class SinAccesosPage {
  private readonly sesion = inject(SesionService);
  private readonly router = inject(Router);
  private readonly rutas = inject(CONFIG_AUTH).rutas;

  protected readonly mensajes = MENSAJES_SHELL;

  protected async salir(): Promise<void> {
    await this.sesion.salir();
    await this.router.navigateByUrl(this.rutas.ingresar);
  }
}
