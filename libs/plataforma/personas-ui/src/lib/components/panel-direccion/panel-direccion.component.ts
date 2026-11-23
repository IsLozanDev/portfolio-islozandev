import { Component, inject, signal } from '@angular/core';
import { FormControl, NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { AccionesFormularioComponent, MensajeValidacionPipe, PanelLateralComponent } from '@vitrina/shared/ui';
import type { ResultadoPanelFicha } from '../../models/ficha';
import { MENSAJES_FICHA } from '../../models/mensajes-ficha';
import type { DireccionPersona, PersonaDetalle } from '../../models/persona';
import type { Ubigeo, ValorUbigeo } from '../../models/ubigeo';
import { DireccionesCliente } from '../../services/direcciones.cliente';
import { esPersonaCambiada, mensajeDe } from '../../utils/cambios-ficha';
import { ubigeoElegido } from '../../utils/validadores-formulario';
import { UbigeoAutocompletarComponent } from '../ubigeo-autocompletar/ubigeo-autocompletar.component';

/** Los mismos límites del dominio (spec 32). */
const LONGITUD_MINIMA_DIRECCION = 5;
const LONGITUD_MAXIMA_DIRECCION = 250;
const LONGITUD_MAXIMA_REFERENCIA = 150;

export interface DatosPanelDireccion {
  persona: PersonaDetalle;
  /** Sin dirección: agregar. Con dirección: editarla. */
  direccion?: DireccionPersona;
}

function ubigeoDe(direccion: DireccionPersona | undefined): Ubigeo | null {
  if (!direccion) return null;
  const { ubigeo: codigo, distrito, provincia, departamento } = direccion;
  return { codigo, distrito, provincia, departamento };
}

/** Panel «Agregar dirección» o «Editar dirección» (TR-RF-041) con el autocompletar de ubigeo. */
@Component({
  selector: 'vit-panel-direccion',
  imports: [
    ReactiveFormsModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatInputModule,
    AccionesFormularioComponent,
    MensajeValidacionPipe,
    PanelLateralComponent,
    UbigeoAutocompletarComponent,
  ],
  templateUrl: './panel-direccion.component.html',
})
export class PanelDireccionComponent {
  private readonly referencia = inject<MatDialogRef<PanelDireccionComponent, ResultadoPanelFicha>>(MatDialogRef);
  private readonly direcciones = inject(DireccionesCliente);
  private readonly datos = inject<DatosPanelDireccion>(MAT_DIALOG_DATA);

  protected readonly mensajes = MENSAJES_FICHA.direcciones;
  protected readonly titulo = this.datos.direccion ? this.mensajes.tituloEditar : this.mensajes.tituloAgregar;
  protected readonly formulario = inject(NonNullableFormBuilder).group({
    direccion: [
      this.datos.direccion?.direccion ?? '',
      [Validators.required, Validators.minLength(LONGITUD_MINIMA_DIRECCION), Validators.maxLength(LONGITUD_MAXIMA_DIRECCION)],
    ],
    referencia: [this.datos.direccion?.referencia ?? '', Validators.maxLength(LONGITUD_MAXIMA_REFERENCIA)],
    ubigeo: new FormControl<ValorUbigeo>(ubigeoDe(this.datos.direccion), [Validators.required, ubigeoElegido]),
    principal: [this.datos.direccion?.principal ?? false],
  });
  protected readonly guardando = signal(false);
  protected readonly error = signal<string | null>(null);

  protected async guardar(): Promise<void> {
    if (this.guardando()) return;
    if (this.formulario.invalid) {
      this.formulario.markAllAsTouched();
      return;
    }
    this.guardando.set(true);
    this.error.set(null);
    try {
      this.referencia.close({ tipo: 'guardada', persona: await this.enviar() });
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

  private enviar(): Promise<PersonaDetalle> {
    const valores = this.formulario.getRawValue();
    const { persona, direccion } = this.datos;
    const campos = {
      direccion: valores.direccion.trim(),
      referencia: valores.referencia.trim() || null,
      ubigeo: (valores.ubigeo as Ubigeo).codigo,
      principal: valores.principal,
    };
    if (!direccion) return this.direcciones.agregar(persona.id, campos);
    return this.direcciones.editar(persona.id, direccion.id, { version: persona.version, ...campos });
  }
}
