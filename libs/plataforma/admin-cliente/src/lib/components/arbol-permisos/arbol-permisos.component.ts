import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, input, model } from '@angular/core';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatExpansionModule } from '@angular/material/expansion';
import type { ArbolPermisos, ModuloDelArbol, OpcionDelArbol } from '../../models/catalogo-permisos';
import { MENSAJES_ROLES } from '../../models/mensajes-admin';
import { alternarGrupo, alternarPermiso, codigosDeModulo, codigosDeOpcion, estadoDelGrupo, type EstadoGrupo } from '../../utils/seleccion-permisos';

/**
 * Árbol módulo → opción → permiso del editor de roles (TR-RF-011). Marca los permisos sensibles
 * (TR-RN-009). Cada permiso aparece una sola vez; los que no tienen opción van al final.
 */
@Component({
  selector: 'vit-arbol-permisos',
  imports: [NgTemplateOutlet, MatCheckboxModule, MatExpansionModule],
  templateUrl: './arbol-permisos.component.html',
})
export class ArbolPermisosComponent {
  readonly arbol = input.required<ArbolPermisos>();
  readonly soloLectura = input(false);
  readonly seleccionados = model<ReadonlySet<string>>(new Set());

  protected readonly mensajes = MENSAJES_ROLES;
  protected readonly vacio = computed(() => this.arbol().modulos.length === 0 && this.arbol().otros.length === 0);

  protected estadoDeOpcion(opcion: OpcionDelArbol): EstadoGrupo {
    return estadoDelGrupo(codigosDeOpcion(opcion), this.seleccionados());
  }

  protected estadoDeModulo(modulo: ModuloDelArbol): EstadoGrupo {
    return estadoDelGrupo(codigosDeModulo(modulo), this.seleccionados());
  }

  protected alternarOpcion(opcion: OpcionDelArbol): void {
    this.seleccionados.update((seleccionados) => alternarGrupo(codigosDeOpcion(opcion), seleccionados));
  }

  protected alternarModulo(modulo: ModuloDelArbol): void {
    this.seleccionados.update((seleccionados) => alternarGrupo(codigosDeModulo(modulo), seleccionados));
  }

  protected alternarPermiso(codigo: string): void {
    this.seleccionados.update((seleccionados) => alternarPermiso(codigo, seleccionados));
  }
}
