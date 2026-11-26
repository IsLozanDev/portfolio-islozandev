import { Component, computed, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

/** El número del paso o la marca de hecho antes del título de cada sección (artboard FE-Emisor). */
@Component({
  selector: 'vit-entrada-seccion',
  imports: [MatIconModule],
  templateUrl: './entrada-seccion.component.html',
  host: { class: 'contents' },
})
export class EntradaSeccionComponent {
  readonly numero = input.required<number>();
  readonly hecha = input<boolean>(false);
  readonly deshabilitada = input<boolean>(false);

  protected readonly clases = computed(() => {
    if (this.hecha()) return 'bg-chip-exito text-sobre-chip-exito';
    return this.deshabilitada() ? 'bg-superficie-contenedor text-sobre-superficie-variante' : 'bg-primario text-sobre-primario';
  });
}
