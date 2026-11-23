import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators, type AbstractControl, type ValidationErrors } from '@angular/forms';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { AccionesFormularioComponent, MensajeValidacionPipe, PanelLateralComponent } from '@vitrina/shared/ui';
import { ETIQUETAS_TIPO_CONTACTO } from '../../models/etiquetas-personas';
import type { ResultadoPanelFicha } from '../../models/ficha';
import { MENSAJES_CONTACTO } from '../../models/mensajes-contacto';
import { MENSAJES_FICHA } from '../../models/mensajes-ficha';
import { TIPOS_CONTACTO, type ContactoPersona, type PersonaDetalle, type TipoContacto } from '../../models/persona';
import { ContactosCliente } from '../../services/contactos.cliente';
import { esPersonaCambiada, mensajeDe } from '../../utils/cambios-ficha';
import { validarContacto } from '../../utils/validar-contacto';

export interface DatosPanelContacto {
  persona: PersonaDetalle;
  /** Sin contacto: agregar. Con contacto: editar su valor o su principal; el tipo no cambia. */
  contacto?: ContactoPersona;
}

/** Panel «Agregar contacto» o «Editar contacto» (TR-RF-041), con el formato de cada tipo. */
@Component({
  selector: 'vit-panel-contacto',
  imports: [
    ReactiveFormsModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
    AccionesFormularioComponent,
    MensajeValidacionPipe,
    PanelLateralComponent,
  ],
  templateUrl: './panel-contacto.component.html',
})
export class PanelContactoComponent {
  private readonly referencia = inject<MatDialogRef<PanelContactoComponent, ResultadoPanelFicha>>(MatDialogRef);
  private readonly contactos = inject(ContactosCliente);
  private readonly datos = inject<DatosPanelContacto>(MAT_DIALOG_DATA);

  protected readonly mensajes = MENSAJES_FICHA.contactos;
  protected readonly editando = this.datos.contacto !== undefined;
  protected readonly titulo = this.editando ? this.mensajes.tituloEditar : this.mensajes.tituloAgregar;
  protected readonly tipos = TIPOS_CONTACTO.map((codigo) => ({ codigo, texto: ETIQUETAS_TIPO_CONTACTO[codigo] }));
  protected readonly formulario = inject(NonNullableFormBuilder).group({
    tipo: [this.datos.contacto?.tipo ?? ('CELULAR' as TipoContacto)],
    valor: [this.datos.contacto?.valor ?? '', [Validators.required, (control: AbstractControl<string>) => this.validarValor(control)]],
    principal: [this.datos.contacto?.principal ?? false],
  });
  private readonly tipo = toSignal(this.formulario.controls.tipo.valueChanges, { initialValue: this.formulario.controls.tipo.value });
  protected readonly reglas = computed(() => MENSAJES_CONTACTO[this.tipo()]);
  protected readonly etiquetaTipo = computed(() => ETIQUETAS_TIPO_CONTACTO[this.tipo()]);
  protected readonly notaPrincipal = computed(() => this.mensajes.notaPrincipal(this.etiquetaTipo().toLowerCase()));
  protected readonly guardando = signal(false);
  protected readonly error = signal<string | null>(null);

  constructor() {
    if (this.editando) this.formulario.controls.tipo.disable();
    this.formulario.controls.tipo.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => this.formulario.controls.valor.updateValueAndValidity());
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
    const { tipo, valor, principal } = this.formulario.getRawValue();
    const { persona, contacto } = this.datos;
    if (!contacto) return this.contactos.agregar(persona.id, { tipo, valor: valor.trim(), principal });
    return this.contactos.editar(persona.id, contacto.id, { version: persona.version, valor: valor.trim(), principal });
  }

  private validarValor(control: AbstractControl<string>): ValidationErrors | null {
    const valor = control.value?.trim() ?? '';
    const tipo = this.formulario?.controls.tipo.getRawValue() ?? 'CELULAR';
    return valor === '' || validarContacto(tipo, valor) ? null : { formatoContacto: true };
  }
}
