import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { RouterLink } from '@angular/router';
import { CONFIG_AUTH } from '@vitrina/shared/auth';

export const MENSAJE_PROHIBIDO = 'No tiene permiso para ver esta página.';

/** Destino de `permisoGuard` cuando falta el permiso. */
@Component({
  selector: 'vit-prohibido',
  imports: [MatButtonModule, RouterLink],
  templateUrl: './prohibido.page.html',
})
export class ProhibidoPage {
  protected readonly mensaje = MENSAJE_PROHIBIDO;
  protected readonly rutaInicio = inject(CONFIG_AUTH).rutas.inicio;
}
