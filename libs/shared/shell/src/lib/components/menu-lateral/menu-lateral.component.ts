import { NgTemplateOutlet } from '@angular/common';
import { Component, input, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { EstadoVacioComponent } from '@vitrina/shared/ui';
import { MENSAJES_SHELL } from '../../models/mensajes-shell';
import type { NodoMenu } from '../../models/nodo-menu';

const RUTA_RAIZ = '/';
const ICONO_SIN_OPCIONES = 'menu_open';

/** Pinta el árbol del menú tal como lo entrega la API: no decide permisos. */
@Component({
  selector: 'vit-menu-lateral',
  imports: [NgTemplateOutlet, MatIconModule, MatListModule, RouterLink, RouterLinkActive, EstadoVacioComponent],
  templateUrl: './menu-lateral.component.html',
})
export class MenuLateralComponent {
  readonly nodos = input.required<NodoMenu[]>();

  protected readonly mensajes = MENSAJES_SHELL;
  protected readonly iconoSinOpciones = ICONO_SIN_OPCIONES;
  private readonly expandidos = signal<ReadonlySet<string>>(new Set());

  protected estaExpandido(codigo: string): boolean {
    return this.expandidos().has(codigo);
  }

  protected alternar(codigo: string): void {
    this.expandidos.update((actuales) => {
      const siguientes = new Set(actuales);
      if (!siguientes.delete(codigo)) siguientes.add(codigo);
      return siguientes;
    });
  }

  /** La raíz solo está activa en sí misma; el resto también en sus subrutas. */
  protected esRutaExacta(ruta: string | null): boolean {
    return ruta === RUTA_RAIZ;
  }
}
