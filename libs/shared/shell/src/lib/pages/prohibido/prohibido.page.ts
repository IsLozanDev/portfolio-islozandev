import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { RouterLink } from '@angular/router';
import { CONFIG_AUTH } from '@vitrina/shared/auth';
import { MENSAJES_SHELL } from '../../models/mensajes-shell';

/** Destino de `permisoGuard` cuando falta el permiso; dentro del layout. */
@Component({
  selector: 'vit-prohibido',
  imports: [MatButtonModule, RouterLink],
  templateUrl: './prohibido.page.html',
})
export class ProhibidoPage {
  protected readonly mensajes = MENSAJES_SHELL;
  protected readonly rutaInicio = inject(CONFIG_AUTH).rutas.inicio;
}
