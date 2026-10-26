import { Component, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

export const ICONO_ESTADO_VACIO = 'inbox';

@Component({
  selector: 'vit-estado-vacio',
  imports: [MatIconModule],
  templateUrl: './estado-vacio.component.html',
})
export class EstadoVacioComponent {
  readonly icono = input<string>(ICONO_ESTADO_VACIO);
  readonly titulo = input.required<string>();
  readonly texto = input<string>();
}
