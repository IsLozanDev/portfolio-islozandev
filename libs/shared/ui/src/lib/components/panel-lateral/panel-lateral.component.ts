import { Component, inject, input } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogRef, MatDialogTitle } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { filter } from 'rxjs';
import { MENSAJES_UI } from '../../models/mensajes-ui';

const TECLA_ESCAPE = 'Escape';

/**
 * Marco del panel lateral: cabecera con título y X, cuerpo con scroll y pie fijo con lo proyectado en
 * `[accionesPanel]`. Si el pie trae `vit-acciones-formulario`, el `<form>` envuelve a este componente.
 */
@Component({
  selector: 'vit-panel-lateral',
  imports: [MatButtonModule, MatDialogTitle, MatIconModule],
  templateUrl: './panel-lateral.component.html',
  host: { class: 'flex h-dvh flex-col' },
})
export class PanelLateralComponent {
  private readonly referencia = inject(MatDialogRef);

  readonly titulo = input.required<string>();

  protected readonly textoCerrar = MENSAJES_UI.cerrar;

  constructor() {
    this.referencia
      .keydownEvents()
      .pipe(
        filter((evento) => evento.key === TECLA_ESCAPE),
        takeUntilDestroyed(),
      )
      .subscribe(() => this.cerrar());
  }

  protected cerrar(): void {
    this.referencia.close();
  }
}
