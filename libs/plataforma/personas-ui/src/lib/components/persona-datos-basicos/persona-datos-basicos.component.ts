import { Component, computed, inject, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { SesionService } from '@vitrina/shared/auth';
import { PanelLateralService } from '@vitrina/shared/ui';
import { firstValueFrom } from 'rxjs';
import { ETIQUETAS_TIPO_DOCUMENTO } from '../../models/etiquetas-personas';
import type { CambioFicha, ResultadoPanelFicha } from '../../models/ficha';
import { MENSAJES_FICHA } from '../../models/mensajes-ficha';
import type { PersonaDetalle } from '../../models/persona';
import { PERMISOS_PERSONAS } from '../../models/permisos-personas';
import { cambioDePanel } from '../../utils/cambios-ficha';
import { PanelDatosBasicosComponent, type DatosPanelDatosBasicos } from '../panel-datos-basicos/panel-datos-basicos.component';

/** Sección «Datos básicos» de la ficha: documento y denominación; «Editar» abre el panel (`plat.persona.editar`). */
@Component({
  selector: 'vit-persona-datos-basicos',
  imports: [MatButtonModule, MatIconModule],
  templateUrl: './persona-datos-basicos.component.html',
})
export class PersonaDatosBasicosComponent {
  private readonly paneles = inject(PanelLateralService);
  private readonly sesion = inject(SesionService);

  readonly persona = input.required<PersonaDetalle>();
  readonly cambio = output<CambioFicha>();

  protected readonly mensajes = MENSAJES_FICHA.datos;
  protected readonly puedeEditar = computed(() => this.sesion.tiene(PERMISOS_PERSONAS.editar));
  protected readonly juridica = computed(() => this.persona().tipoPersona === 'JURIDICA');
  protected readonly tipoDocumento = computed(() => ETIQUETAS_TIPO_DOCUMENTO[this.persona().tipoDocumento]);

  protected async editar(): Promise<void> {
    const panel = this.paneles.abrir<PanelDatosBasicosComponent, DatosPanelDatosBasicos, ResultadoPanelFicha>(PanelDatosBasicosComponent, {
      datos: { persona: this.persona() },
    });
    const cambio = cambioDePanel(await firstValueFrom(panel.afterClosed()));
    if (cambio) this.cambio.emit(cambio);
  }
}
