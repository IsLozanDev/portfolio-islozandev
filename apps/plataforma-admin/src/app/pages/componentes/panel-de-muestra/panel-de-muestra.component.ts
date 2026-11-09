import { Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { AccionesFormularioComponent, MensajeValidacionPipe, PanelLateralComponent } from '@vitrina/shared/ui';

const LONGITUD_MINIMA_NOMBRE = 3;
const DEMORA_GUARDADO_MS = 1000;

export interface DatosPanelDeMuestra {
  nombre: string;
}

/** Contenido de muestra del panel lateral en `/dev/componentes`. */
@Component({
  selector: 'vit-panel-de-muestra',
  imports: [ReactiveFormsModule, MatCheckboxModule, MatFormFieldModule, MatInputModule, AccionesFormularioComponent, MensajeValidacionPipe, PanelLateralComponent],
  templateUrl: './panel-de-muestra.component.html',
})
export class PanelDeMuestraComponent {
  private readonly referencia = inject<MatDialogRef<PanelDeMuestraComponent, string>>(MatDialogRef);
  private readonly datos = inject<DatosPanelDeMuestra>(MAT_DIALOG_DATA);

  protected readonly guardando = signal(false);
  protected readonly formulario = inject(NonNullableFormBuilder).group({
    nombre: [this.datos.nombre, [Validators.required, Validators.minLength(LONGITUD_MINIMA_NOMBRE)]],
    descripcion: [''],
    recurrente: [false],
  });

  protected async guardar(): Promise<void> {
    if (this.formulario.invalid) {
      this.formulario.markAllAsTouched();
      return;
    }
    this.guardando.set(true);
    await new Promise((resolver) => setTimeout(resolver, DEMORA_GUARDADO_MS));
    this.referencia.close(this.formulario.controls.nombre.value);
  }

  protected cancelar(): void {
    this.referencia.close();
  }
}
