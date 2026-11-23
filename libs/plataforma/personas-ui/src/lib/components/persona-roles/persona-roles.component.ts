import { Component, computed, inject, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { SesionService } from '@vitrina/shared/auth';
import { PanelLateralService, TablaComponent, type ColumnaTabla } from '@vitrina/shared/ui';
import { firstValueFrom } from 'rxjs';
import { ETIQUETAS_ROL } from '../../models/etiquetas-personas';
import { TAMANO_LISTA_FICHA, type CambioFicha, type ResultadoPanelFicha } from '../../models/ficha';
import { MENSAJES_FICHA } from '../../models/mensajes-ficha';
import type { PersonaDetalle } from '../../models/persona';
import { PERMISOS_PERSONAS } from '../../models/permisos-personas';
import { cambioDePanel } from '../../utils/cambios-ficha';
import { formatoFecha } from '../../utils/fechas';
import { PanelRolComponent, type DatosPanelRol } from '../panel-rol/panel-rol.component';

export interface FilaRol {
  producto: string;
  rol: string;
  desde: string;
}

/** Sección «Roles por producto» (TR-RF-040): los vigentes y «Asignar rol» con `plat.persona.rol`. */
@Component({
  selector: 'vit-persona-roles',
  imports: [MatButtonModule, MatIconModule, TablaComponent],
  templateUrl: './persona-roles.component.html',
})
export class PersonaRolesComponent {
  private readonly paneles = inject(PanelLateralService);
  private readonly sesion = inject(SesionService);

  readonly persona = input.required<PersonaDetalle>();
  readonly cambio = output<CambioFicha>();

  protected readonly mensajes = MENSAJES_FICHA.roles;
  protected readonly tamanosPagina = [TAMANO_LISTA_FICHA];
  protected readonly columnas: ColumnaTabla<FilaRol>[] = [
    { clave: 'producto', titulo: this.mensajes.producto, movil: 'detalle' },
    { clave: 'rol', titulo: this.mensajes.rol, movil: 'titulo' },
    { clave: 'desde', titulo: this.mensajes.desde, movil: 'detalle' },
  ];
  protected readonly puedeAsignar = computed(() => this.sesion.tiene(PERMISOS_PERSONAS.rol));
  protected readonly filas = computed(() =>
    this.persona()
      .roles.filter((rol) => rol.hasta === null)
      .map((rol) => ({ producto: rol.productoCodigo, rol: ETIQUETAS_ROL[rol.rol], desde: formatoFecha(rol.desde) })),
  );

  protected async asignar(): Promise<void> {
    const panel = this.paneles.abrir<PanelRolComponent, DatosPanelRol, ResultadoPanelFicha>(PanelRolComponent, { datos: { persona: this.persona() } });
    const cambio = cambioDePanel(await firstValueFrom(panel.afterClosed()));
    if (cambio) this.cambio.emit(cambio);
  }
}
