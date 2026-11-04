import { Component, computed, inject, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { INSIGNIAS_MENU } from '../../config/insignias-menu';
import { MENSAJES_SHELL, mensajeInsigniaMenu } from '../../models/mensajes-shell';
import type { NodoMenu } from '../../models/nodo-menu';
import { RutaActualService } from '../../services/ruta-actual.service';
import { esRutaExacta, gruposDeRuta } from '../../utils/buscar-en-menu';
import { insigniaDe } from '../../utils/insignias-menu';

/** Relleno inicial de `mat-menu-item` (12 px) más un escalón por nivel de anidación. */
const SANGRIA_BASE_PX = 12;
const SANGRIA_POR_NIVEL_PX = 16;
const INICIAL_MARCA = 'V';

interface EntradaSubmenu {
  nodo: NodoMenu;
  nivel: number;
}

/**
 * Franja de iconos del menú oculto en escritorio: un botón por nodo de primer nivel. Un grupo abre
 * un `mat-menu` con todo su subárbol, sin expandir ni plegar.
 */
@Component({
  selector: 'vit-riel-menu',
  imports: [MatButtonModule, MatIconModule, MatMenuModule, MatTooltipModule, RouterLink, RouterLinkActive],
  templateUrl: './riel-menu.component.html',
  styleUrl: './riel-menu.component.css',
})
export class RielMenuComponent {
  readonly nodos = input.required<NodoMenu[]>();
  readonly buscar = output<void>();

  private readonly urlActual = inject(RutaActualService).url;
  private readonly insignias = inject(INSIGNIAS_MENU);

  protected readonly mensajes = MENSAJES_SHELL;
  protected readonly inicialMarca = INICIAL_MARCA;
  protected readonly esRutaExacta = esRutaExacta;
  protected readonly gruposActivos = computed(() => gruposDeRuta(this.nodos(), this.urlActual()));

  protected insignia(nodo: NodoMenu): number {
    return insigniaDe(nodo, this.insignias());
  }

  /** En el riel solo hay ícono: el nombre accesible lleva el número. */
  protected etiqueta(nodo: NodoMenu): string {
    const cantidad = this.insignia(nodo);
    return cantidad > 0 ? `${nodo.nombre}, ${mensajeInsigniaMenu(cantidad)}` : nodo.nombre;
  }

  protected subarbol(grupo: NodoMenu): EntradaSubmenu[] {
    return aplanar(grupo.hijos, 0);
  }

  protected sangria(nivel: number): number {
    return SANGRIA_BASE_PX + nivel * SANGRIA_POR_NIVEL_PX;
  }
}

function aplanar(nodos: readonly NodoMenu[], nivel: number): EntradaSubmenu[] {
  return nodos.flatMap((nodo) => [{ nodo, nivel }, ...aplanar(nodo.hijos, nivel + 1)]);
}
