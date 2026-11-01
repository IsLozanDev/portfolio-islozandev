import { Component, input } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MensajeValidacionPipe } from '@vitrina/shared/ui';
import { MENSAJES_CODIGO_NOMBRE } from '../../models/mensajes-admin';
import type { GrupoCodigoNombre } from '../../utils/formulario-codigo-nombre';

/** Código y nombre de un rol o un perfil nuevo o copiado (TR-RF-011, TR-RF-012). El grupo lo crea la página. */
@Component({
  selector: 'vit-form-codigo-nombre',
  imports: [ReactiveFormsModule, MatFormFieldModule, MatInputModule, MensajeValidacionPipe],
  templateUrl: './form-codigo-nombre.component.html',
})
export class FormCodigoNombreComponent {
  readonly grupo = input.required<GrupoCodigoNombre>();

  protected readonly mensajes = MENSAJES_CODIGO_NOMBRE;
}
