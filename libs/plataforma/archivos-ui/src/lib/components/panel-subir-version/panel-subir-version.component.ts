import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { PanelLateralComponent } from '@vitrina/shared/ui';
import type { ArchivoDisponible } from '../../models/estado-carga';
import { MENSAJES_ARCHIVO_VERSIONES } from '../../models/mensajes-archivo-versiones';
import { ArchivoCargaComponent } from '../archivo-carga/archivo-carga.component';

export interface DatosPanelSubirVersion {
  archivoId: string;
  categoria: string;
  nombre: string;
  versionVigente?: number;
}

/** Contenido del panel lateral «Subir versión»: cierra con la versión disponible; un rechazo queda a la vista en el panel. */
@Component({
  selector: 'vit-panel-subir-version',
  imports: [MatButtonModule, MatIconModule, PanelLateralComponent, ArchivoCargaComponent],
  templateUrl: './panel-subir-version.component.html',
})
export class PanelSubirVersionComponent {
  private readonly referencia = inject<MatDialogRef<PanelSubirVersionComponent, ArchivoDisponible>>(MatDialogRef);
  protected readonly datos = inject<DatosPanelSubirVersion>(MAT_DIALOG_DATA);
  protected readonly mensajes = MENSAJES_ARCHIVO_VERSIONES;
  protected readonly subtitulo = MENSAJES_ARCHIVO_VERSIONES.subtituloPanel(this.datos.nombre, this.datos.versionVigente);

  protected alDisponible(disponible: ArchivoDisponible): void {
    this.referencia.close(disponible);
  }

  protected cerrar(): void {
    this.referencia.close();
  }
}
