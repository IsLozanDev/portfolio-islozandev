import { NgTemplateOutlet } from '@angular/common';
import { Component, effect, inject, input, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { EstadoVacioComponent } from '@vitrina/shared/ui';
import { MENSAJES_SHELL } from '../../models/mensajes-shell';
import type { NodoMenu } from '../../models/nodo-menu';
import type { ResultadoBusquedaMenu } from '../../models/resultado-busqueda-menu';
import { RutaActualService } from '../../services/ruta-actual.service';
import { esRutaExacta, gruposDeRuta } from '../../utils/buscar-en-menu';
import { BuscadorMenuComponent } from '../buscador-menu/buscador-menu.component';

const ICONO_SIN_OPCIONES = 'menu_open';
/** Relleno inicial de `mat-list-item` (16 px) más un escalón por nivel de anidación. */
const SANGRIA_BASE_REM = 1;
const SANGRIA_POR_NIVEL_REM = 1;

/** Pinta el árbol del menú tal como lo entrega la API: no decide permisos. */
@Component({
  selector: 'vit-menu-lateral',
  imports: [NgTemplateOutlet, BuscadorMenuComponent, MatIconModule, MatListModule, RouterLink, RouterLinkActive, EstadoVacioComponent],
  templateUrl: './menu-lateral.component.html',
})
export class MenuLateralComponent {
  readonly nodos = input.required<NodoMenu[]>();
  readonly nombreApp = input.required<string>();

  protected readonly mensajes = MENSAJES_SHELL;
  protected readonly iconoSinOpciones = ICONO_SIN_OPCIONES;
  protected readonly esRutaExacta = esRutaExacta;
  private readonly router = inject(Router);
  private readonly expandidos = signal<ReadonlySet<string>>(new Set());
  private readonly urlActual = inject(RutaActualService).url;

  constructor() {
    effect(() => this.expandir(gruposDeRuta(this.nodos(), this.urlActual())));
  }

  protected estaExpandido(codigo: string): boolean {
    return this.expandidos().has(codigo);
  }

  /** Expande sus grupos aquí también: si ya está en esa página, el router no emite `NavigationEnd`. */
  protected abrir(resultado: ResultadoBusquedaMenu): void {
    this.expandir(gruposDeRuta(this.nodos(), resultado.ruta));
    void this.router.navigateByUrl(resultado.ruta);
  }

  protected alternar(codigo: string): void {
    this.expandidos.update((actuales) => {
      const siguientes = new Set(actuales);
      if (!siguientes.delete(codigo)) siguientes.add(codigo);
      return siguientes;
    });
  }

  /** Suma los grupos de la página actual sin cerrar los que abrió el usuario. */
  private expandir(codigos: ReadonlySet<string>): void {
    if (codigos.size === 0) return;
    this.expandidos.update((actuales) => new Set([...actuales, ...codigos]));
  }

  protected sangria(nivel: number): number {
    return SANGRIA_BASE_REM + nivel * SANGRIA_POR_NIVEL_REM;
  }
}
