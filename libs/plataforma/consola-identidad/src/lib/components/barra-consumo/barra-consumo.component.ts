import { Component, computed, input } from '@angular/core';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import type { TonoEstado } from '@vitrina/shared/ui';

const PORCENTAJE_MAXIMO = 100;

/** Barra de consumo con el color del tono del estado (solo tokens). `grande` para el detalle. */
@Component({
  selector: 'vit-barra-consumo',
  imports: [MatProgressBarModule],
  templateUrl: './barra-consumo.component.html',
  styleUrl: './barra-consumo.component.css',
})
export class BarraConsumoComponent {
  readonly porcentaje = input.required<number>();
  readonly tono = input.required<TonoEstado>();
  /** Nombre accesible de la barra, p. ej. «Consumo de Pollería Doña Rosa». */
  readonly etiqueta = input.required<string>();
  readonly grande = input<boolean>(false);

  /** La API da 100 si no hay incluidas; la barra no pasa de llena. */
  protected readonly valor = computed(() => Math.min(this.porcentaje(), PORCENTAJE_MAXIMO));
  protected readonly clases = computed(() => `vit-barra-consumo vit-barra-${this.tono()}${this.grande() ? ' vit-barra-grande' : ''}`);
}
