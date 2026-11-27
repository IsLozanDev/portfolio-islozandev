import { Component, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { CargandoComponent, ChipEstadoComponent, PanelLateralComponent } from '@vitrina/shared/ui';
import { aErrorAdmin } from '../../models/error-admin';
import {
  ETIQUETAS_CANAL_PLANTILLA,
  etiquetaOrigenConVersion,
  ICONOS_CANAL_PLANTILLA,
  MENSAJES_VISTA_PREVIA,
  MENSAJES_VISTA_RAPIDA,
} from '../../models/mensajes-plantillas';
import type { ResumenPlantilla, VistaPrevia } from '../../models/plantilla';
import { TONOS_ORIGEN_PLANTILLA } from '../../models/tonos-plantilla';
import { PlantillasCliente } from '../../services/plantillas.cliente';
import { formatearFechaCorta } from '../../utils/formato';
import { VistaPreviaCorreoComponent } from '../vista-previa-correo/vista-previa-correo.component';

export interface DatosVistaRapida {
  plantilla: ResumenPlantilla;
  puedeEditar: boolean;
}

/** `editar`: la lista navega al editor de la plantilla. */
export type ResultadoVistaRapida = 'editar';

/** Panel de solo lectura con el correo vigente renderizado con los ejemplos de cada variable (spec 47). */
@Component({
  selector: 'vit-plantilla-vista-rapida',
  imports: [MatButtonModule, MatIconModule, CargandoComponent, ChipEstadoComponent, PanelLateralComponent, VistaPreviaCorreoComponent],
  templateUrl: './plantilla-vista-rapida.component.html',
})
export class PlantillaVistaRapidaComponent {
  private readonly referencia = inject<MatDialogRef<PlantillaVistaRapidaComponent, ResultadoVistaRapida>>(MatDialogRef);
  private readonly datos = inject<DatosVistaRapida>(MAT_DIALOG_DATA);
  private readonly plantillas = inject(PlantillasCliente);

  protected readonly mensajes = MENSAJES_VISTA_RAPIDA;
  protected readonly mensajesPrevia = MENSAJES_VISTA_PREVIA;
  protected readonly plantilla = this.datos.plantilla;
  protected readonly puedeEditar = this.datos.puedeEditar;
  protected readonly canal = ETIQUETAS_CANAL_PLANTILLA[this.plantilla.canal];
  protected readonly iconoCanal = ICONOS_CANAL_PLANTILLA[this.plantilla.canal];
  protected readonly origen = etiquetaOrigenConVersion(this.plantilla.origen, this.plantilla.version);
  protected readonly tonoOrigen = TONOS_ORIGEN_PLANTILLA[this.plantilla.origen];
  protected readonly actualizada = MENSAJES_VISTA_RAPIDA.actualizada(formatearFechaCorta(new Date(this.plantilla.actualizadoEn)));

  protected readonly vista = signal<VistaPrevia | null>(null);
  protected readonly error = signal<string | null>(null);

  constructor() {
    void this.cargar();
  }

  protected editar(): void {
    this.referencia.close('editar');
  }

  protected cerrar(): void {
    this.referencia.close();
  }

  private async cargar(): Promise<void> {
    try {
      this.vista.set(await this.plantillas.vistaPrevia(this.plantilla.codigo, this.plantilla.canal, {}));
    } catch (error) {
      this.error.set(aErrorAdmin(error).message);
    }
  }
}
