import { Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { AccionesFormularioComponent, MensajeValidacionPipe, PanelLateralComponent } from '@vitrina/shared/ui';
import { ETIQUETAS_TIPO_PERSONA } from '../../models/etiquetas-personas';
import type { ResultadoPanelFicha } from '../../models/ficha';
import { MENSAJES_FICHA } from '../../models/mensajes-ficha';
import type { PersonaDetalle } from '../../models/persona';
import type { CambiosDatosBasicos } from '../../models/solicitudes-persona';
import { PersonasCliente } from '../../services/personas.cliente';
import { esPersonaCambiada, mensajeDe } from '../../utils/cambios-ficha';
import { formatoDocumento } from '../../utils/formato-persona';

/** Los mismos límites del dominio (spec 31). */
const LONGITUD_NOMBRES = 100;
const LONGITUD_APELLIDO = 60;
const LONGITUD_RAZON_SOCIAL = 200;

export interface DatosPanelDatosBasicos {
  persona: PersonaDetalle;
}

/** Panel «Editar datos básicos» (spec 32): nombres y apellidos de una natural o la razón social de una jurídica. */
@Component({
  selector: 'vit-panel-datos-basicos',
  imports: [ReactiveFormsModule, MatFormFieldModule, MatIconModule, MatInputModule, AccionesFormularioComponent, MensajeValidacionPipe, PanelLateralComponent],
  templateUrl: './panel-datos-basicos.component.html',
})
export class PanelDatosBasicosComponent {
  private readonly referencia = inject<MatDialogRef<PanelDatosBasicosComponent, ResultadoPanelFicha>>(MatDialogRef);
  private readonly personas = inject(PersonasCliente);
  protected readonly persona = inject<DatosPanelDatosBasicos>(MAT_DIALOG_DATA).persona;

  protected readonly mensajes = MENSAJES_FICHA.datos;
  protected readonly juridica = this.persona.tipoPersona === 'JURIDICA';
  protected readonly documento = formatoDocumento(this.persona.tipoDocumento, this.persona.numeroDocumento);
  protected readonly tipoPersona = ETIQUETAS_TIPO_PERSONA[this.persona.tipoPersona];
  protected readonly formulario = inject(NonNullableFormBuilder).group({
    nombres: [this.persona.nombres ?? '', [Validators.required, Validators.maxLength(LONGITUD_NOMBRES)]],
    apellidoPaterno: [this.persona.apellidoPaterno ?? '', [Validators.required, Validators.maxLength(LONGITUD_APELLIDO)]],
    apellidoMaterno: [this.persona.apellidoMaterno ?? '', Validators.maxLength(LONGITUD_APELLIDO)],
    razonSocial: [this.persona.razonSocial ?? '', [Validators.required, Validators.maxLength(LONGITUD_RAZON_SOCIAL)]],
  });
  protected readonly guardando = signal(false);
  protected readonly error = signal<string | null>(null);

  constructor() {
    const { nombres, apellidoPaterno, apellidoMaterno, razonSocial } = this.formulario.controls;
    for (const control of this.juridica ? [nombres, apellidoPaterno, apellidoMaterno] : [razonSocial]) control.disable();
  }

  protected async guardar(): Promise<void> {
    if (this.guardando()) return;
    if (this.formulario.invalid) {
      this.formulario.markAllAsTouched();
      return;
    }
    this.guardando.set(true);
    this.error.set(null);
    try {
      const persona = await this.personas.actualizarDatosBasicos(this.persona.id, this.cambios());
      this.referencia.close({ tipo: 'guardada', persona });
    } catch (error) {
      if (esPersonaCambiada(error)) this.referencia.close({ tipo: 'obsoleta' });
      else this.error.set(mensajeDe(error));
    } finally {
      this.guardando.set(false);
    }
  }

  protected cerrar(): void {
    this.referencia.close();
  }

  /** Solo los campos del tipo de persona; el materno vacío viaja como null y lo borra. */
  private cambios(): CambiosDatosBasicos {
    const valores = this.formulario.getRawValue();
    if (this.juridica) return { version: this.persona.version, razonSocial: valores.razonSocial.trim() };
    return {
      version: this.persona.version,
      nombres: valores.nombres.trim(),
      apellidoPaterno: valores.apellidoPaterno.trim(),
      apellidoMaterno: valores.apellidoMaterno.trim() || null,
    };
  }
}
