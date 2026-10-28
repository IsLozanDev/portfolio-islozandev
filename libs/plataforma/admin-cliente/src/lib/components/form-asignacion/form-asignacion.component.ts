import { Component, input } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { MAT_DATE_LOCALE, provideNativeDateAdapter } from '@angular/material/core';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MensajeValidacionPipe } from '@vitrina/shared/ui';
import type { Asignables } from '../../models/asignable';
import { MENSAJES_ASIGNACION } from '../../models/mensajes-admin';
import { ERROR_UBICACION_REQUERIDA, ERROR_VIGENCIA_INVALIDA, PREFIJO_PERFIL, PREFIJO_ROL, type GrupoAsignacion } from '../../utils/formulario-asignacion';
import { SelectorAlcanceComponent } from '../selector-alcance/selector-alcance.component';

const LOCALE_PERU = 'es-PE';

/**
 * Rol o perfil, alcance y vigencia de una asignación (TR-RF-013). Rol y perfil van en un solo
 * selector agrupado: no se pueden elegir los dos (TR-CA-037). El grupo lo crea la página.
 */
@Component({
  selector: 'vit-form-asignacion',
  imports: [ReactiveFormsModule, MatDatepickerModule, MatFormFieldModule, MatInputModule, MatSelectModule, MensajeValidacionPipe, SelectorAlcanceComponent],
  providers: [provideNativeDateAdapter(), { provide: MAT_DATE_LOCALE, useValue: LOCALE_PERU }],
  templateUrl: './form-asignacion.component.html',
})
export class FormAsignacionComponent {
  readonly grupo = input.required<GrupoAsignacion>();
  readonly asignables = input.required<Asignables>();
  /** Invitar no recibe `vigente_desde` (spec 08): la API usa hoy. */
  readonly conVigenteDesde = input<boolean>(true);

  protected readonly mensajes = MENSAJES_ASIGNACION;
  protected readonly prefijoRol = PREFIJO_ROL;
  protected readonly prefijoPerfil = PREFIJO_PERFIL;
  protected readonly errorVigencia = ERROR_VIGENCIA_INVALIDA;
  protected readonly errorUbicacion = ERROR_UBICACION_REQUERIDA;
}
