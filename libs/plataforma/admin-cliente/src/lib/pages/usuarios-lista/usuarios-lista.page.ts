import { Component } from '@angular/core';
import { MENSAJES_ADMIN } from '../../models/mensajes-admin';

/** Lista de miembros del tenant (U-03). */
@Component({
  selector: 'vit-usuarios-lista',
  templateUrl: './usuarios-lista.page.html',
})
export class UsuariosListaPage {
  protected readonly mensajes = MENSAJES_ADMIN;
}
