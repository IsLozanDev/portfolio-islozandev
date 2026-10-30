import { Component, input } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MensajeValidacionPipe } from '@vitrina/shared/ui';
import { MENSAJES_ROLES } from '../../models/mensajes-admin';
import type { GrupoRol } from '../../utils/formulario-rol';

/** Código y nombre de un rol nuevo o copiado (TR-RF-011). El grupo lo crea la página. */
@Component({
  selector: 'vit-form-rol',
  imports: [ReactiveFormsModule, MatFormFieldModule, MatInputModule, MensajeValidacionPipe],
  templateUrl: './form-rol.component.html',
})
export class FormRolComponent {
  readonly grupo = input.required<GrupoRol>();

  protected readonly mensajes = MENSAJES_ROLES;
}
