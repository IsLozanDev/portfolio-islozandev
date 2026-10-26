import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { RouterLink } from '@angular/router';
import { CONFIG_AUTH } from '@vitrina/shared/auth';
import { MENSAJES_SHELL } from '../../models/mensajes-shell';

/** Comodín dentro del layout: también recibe opciones del menú cuya ruta la app aún no registra. */
@Component({
  selector: 'vit-no-encontrado',
  imports: [MatButtonModule, RouterLink],
  templateUrl: './no-encontrado.page.html',
})
export class NoEncontradoPage {
  protected readonly mensajes = MENSAJES_SHELL;
  protected readonly rutaInicio = inject(CONFIG_AUTH).rutas.inicio;
}
