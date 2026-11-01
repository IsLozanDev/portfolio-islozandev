import { Component, computed, input, model } from '@angular/core';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { EstadoVacioComponent } from '@vitrina/shared/ui';
import { MENSAJES_PERFILES } from '../../models/mensajes-admin';
import type { RolDisponible } from '../../models/perfil';
import { agruparRolesPorProducto } from '../../utils/roles-por-producto';
import { alternarPermiso } from '../../utils/seleccion-permisos';

const ICONO_SIN_ROLES = 'badge';

/** Roles de un perfil, agrupados por producto (TR-CA-034). Solo muestra los disponibles (TR-CA-035). */
@Component({
  selector: 'vit-selector-roles',
  imports: [MatCheckboxModule, EstadoVacioComponent],
  templateUrl: './selector-roles.component.html',
})
export class SelectorRolesComponent {
  readonly roles = input.required<readonly RolDisponible[]>();
  readonly soloLectura = input(false);
  readonly seleccionados = model<ReadonlySet<string>>(new Set());

  protected readonly mensajes = MENSAJES_PERFILES;
  protected readonly iconoSinRoles = ICONO_SIN_ROLES;
  protected readonly grupos = computed(() => agruparRolesPorProducto(this.roles()));

  protected alternar(rolId: string): void {
    // Alterna un id en el conjunto: el mismo cálculo que un permiso del árbol.
    this.seleccionados.update((seleccionados) => alternarPermiso(rolId, seleccionados));
  }
}
