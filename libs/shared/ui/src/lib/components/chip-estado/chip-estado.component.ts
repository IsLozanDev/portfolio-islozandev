import { Component, computed, input } from '@angular/core';
import type { TonoEstado } from '../../models/tono-estado';

export const TONO_ESTADO_POR_DEFECTO: TonoEstado = 'neutro';

/* Clases literales para que Tailwind las encuentre al recorrer el código. */
export const CLASES_POR_TONO: Record<TonoEstado, string> = {
  exito: 'bg-chip-exito text-sobre-chip-exito',
  advertencia: 'bg-chip-advertencia text-sobre-chip-advertencia',
  info: 'bg-chip-info text-sobre-chip-info',
  neutro: 'bg-chip-neutro text-sobre-chip-neutro',
  error: 'bg-contenedor-error text-sobre-contenedor-error',
};

@Component({
  selector: 'vit-chip-estado',
  templateUrl: './chip-estado.component.html',
})
export class ChipEstadoComponent {
  readonly texto = input.required<string>();
  readonly tono = input<TonoEstado>(TONO_ESTADO_POR_DEFECTO);

  protected readonly clasesTono = computed(() => CLASES_POR_TONO[this.tono()]);
}
