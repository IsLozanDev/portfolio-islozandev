import { Component, input } from '@angular/core';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MENSAJES_UI } from '../../models/mensajes-ui';

@Component({
  selector: 'vit-cargando',
  imports: [MatProgressSpinnerModule],
  templateUrl: './cargando.component.html',
})
export class CargandoComponent {
  readonly texto = input<string>(MENSAJES_UI.cargando);
}
