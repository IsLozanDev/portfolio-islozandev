import { Component, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MENSAJES_UI } from '../../models/mensajes-ui';

/** Va dentro del `<form>`: «Guardar» es `type="submit"` y dispara su `ngSubmit`. */
@Component({
  selector: 'vit-acciones-formulario',
  imports: [MatButtonModule, MatProgressSpinnerModule],
  templateUrl: './acciones-formulario.component.html',
})
export class AccionesFormularioComponent {
  readonly guardando = input<boolean>(false);
  readonly textoGuardar = input<string>(MENSAJES_UI.guardar);
  readonly cancelar = output<void>();

  protected readonly textoCancelar = MENSAJES_UI.cancelar;
  protected readonly textoGuardando = MENSAJES_UI.guardando;
}
