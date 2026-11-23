import { Component, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { PanelLateralComponent } from '@vitrina/shared/ui';
import type { PedidoAlta, PersonaElegida } from '../../models/buscador';
import { MENSAJES_ALTA, MENSAJES_BUSCADOR } from '../../models/mensajes-buscador';
import type { PersonaDetalle } from '../../models/persona';
import { PersonaAltaComponent } from '../persona-alta/persona-alta.component';
import { PersonaBuscadorComponent } from '../persona-buscador/persona-buscador.component';

export interface DatosPanelNuevaPersona {
  /** Texto del botón de una persona ya registrada: «Usar» por defecto; en admin, «Abrir ficha». */
  etiquetaUsar?: string;
}

/** Con qué persona se cerró el panel y si se acaba de registrar. Sin resultado: se canceló. */
export interface ResultadoNuevaPersona {
  personaId: string;
  registrada: boolean;
}

/**
 * Panel lateral «Nueva persona» (spec 38): primero busca con `vit-persona-buscador`; si la persona no existe,
 * pasa a `vit-persona-alta` en el mismo panel. Cierra con la persona elegida, la registrada o la que ya existía.
 */
@Component({
  selector: 'vit-panel-nueva-persona',
  imports: [MatButtonModule, MatIconModule, PanelLateralComponent, PersonaAltaComponent, PersonaBuscadorComponent],
  templateUrl: './panel-nueva-persona.component.html',
})
export class PanelNuevaPersonaComponent {
  private readonly referencia = inject<MatDialogRef<PanelNuevaPersonaComponent, ResultadoNuevaPersona>>(MatDialogRef);
  private readonly datos = inject<DatosPanelNuevaPersona | null>(MAT_DIALOG_DATA, { optional: true }) ?? {};

  protected readonly mensajes = MENSAJES_ALTA;
  protected readonly etiquetaUsar = this.datos.etiquetaUsar ?? MENSAJES_BUSCADOR.usar;
  protected readonly pedido = signal<PedidoAlta | null>(null);

  protected alElegir(persona: PersonaElegida): void {
    this.referencia.close({ personaId: persona.id, registrada: false });
  }

  protected alRegistrar(persona: PersonaDetalle): void {
    this.referencia.close({ personaId: persona.id, registrada: true });
  }

  protected abrirExistente(personaId: string): void {
    this.referencia.close({ personaId, registrada: false });
  }

  protected cerrar(): void {
    this.referencia.close();
  }
}
