import { Component, computed, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { ANIO_MAXIMO, ANIO_MINIMO } from '../../models/feriado';
import { MENSAJES_SELECTOR_ANIO } from '../../models/mensajes-feriados';

/** ‹ 2026 ›: cambia el año de a uno, sin bajar de 2000 ni subir de 2100. */
@Component({
  selector: 'vit-selector-anio',
  imports: [MatButtonModule, MatIconModule],
  templateUrl: './selector-anio.component.html',
})
export class SelectorAnioComponent {
  readonly anio = input.required<number>();
  readonly cambio = output<number>();

  protected readonly mensajes = MENSAJES_SELECTOR_ANIO;
  protected readonly esElPrimero = computed(() => this.anio() <= ANIO_MINIMO);
  protected readonly esElUltimo = computed(() => this.anio() >= ANIO_MAXIMO);

  protected anterior(): void {
    if (!this.esElPrimero()) this.cambio.emit(this.anio() - 1);
  }

  protected siguiente(): void {
    if (!this.esElUltimo()) this.cambio.emit(this.anio() + 1);
  }
}
