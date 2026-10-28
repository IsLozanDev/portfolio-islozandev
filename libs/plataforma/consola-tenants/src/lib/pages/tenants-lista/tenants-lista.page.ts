import { Component } from '@angular/core';
import { MENSAJES_CONSOLA } from '../../models/mensajes-consola';

/** Lista de tenants del operador (TR-RF-001 y 006). */
@Component({
  selector: 'vit-tenants-lista',
  templateUrl: './tenants-lista.page.html',
})
export class TenantsListaPage {
  protected readonly mensajes = MENSAJES_CONSOLA;
}
