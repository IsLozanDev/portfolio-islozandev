import { Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators, type ValidationErrors } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { AccionesFormularioComponent, mensajeDeValidacion, PanelLateralComponent } from '@vitrina/shared/ui';
import type { DetalleCuota } from '../../models/cuota';
import { aErrorIdentidad, type ErrorIdentidad } from '../../models/error-identidad';
import { MENSAJES_AJUSTE_CUOTA, textoContextoAjuste, textoMinimoConsumidas } from '../../models/mensajes-identidad';
import { CuotasCliente } from '../../services/cuotas.cliente';
import { etiquetaPeriodo } from '../../utils/periodo';

/** Error del control con el mensaje de la API (422). */
const ERROR_API = 'api';
const CODIGO_VERSION_OBSOLETA = 'VERSION_OBSOLETA';
const HTTP_ENTIDAD_NO_PROCESABLE = 422;
const PATRON_ENTERO = /^\d+$/;

export interface DatosPanelAjusteCuota {
  detalle: DetalleCuota;
  /** Recarga el detalle de la página y lo devuelve: tras un 409 el panel sigue abierto con los datos nuevos. */
  recargarDetalle: () => Promise<DetalleCuota>;
}

export type ResultadoPanelAjusteCuota = 'ajustada';

/** Contenido del panel lateral «Ajustar incluidas» (spec 30): un entero ≥ consumidas. */
@Component({
  selector: 'vit-panel-ajuste-cuota',
  imports: [ReactiveFormsModule, MatFormFieldModule, MatInputModule, AccionesFormularioComponent, PanelLateralComponent],
  templateUrl: './panel-ajuste-cuota.component.html',
})
export class PanelAjusteCuotaComponent {
  private readonly referencia = inject<MatDialogRef<PanelAjusteCuotaComponent, ResultadoPanelAjusteCuota>>(MatDialogRef);
  private readonly datos = inject<DatosPanelAjusteCuota>(MAT_DIALOG_DATA);
  private readonly cuotas = inject(CuotasCliente);

  protected readonly mensajes = MENSAJES_AJUSTE_CUOTA;
  protected readonly detalle = signal(this.datos.detalle);
  protected readonly contexto = textoContextoAjuste(this.datos.detalle.tenantNombre, etiquetaPeriodo(this.datos.detalle.periodo));
  protected readonly formulario = inject(NonNullableFormBuilder).group({
    incluidas: [this.datos.detalle.incluidas, this.validadores(this.datos.detalle.consumidas)],
  });
  protected readonly guardando = signal(false);
  protected readonly error = signal<string | null>(null);

  protected mensajeDeError(errores: ValidationErrors | null): string | null {
    if (typeof errores?.[ERROR_API] === 'string') return errores[ERROR_API];
    if (errores?.['pattern']) return MENSAJES_AJUSTE_CUOTA.enteroRequerido;
    if (errores?.['min']) return textoMinimoConsumidas(this.detalle().consumidas);
    return mensajeDeValidacion(errores);
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
      const { tenantId, periodo, version } = this.detalle();
      await this.cuotas.ajustar(tenantId, periodo, Number(this.formulario.controls.incluidas.value), version);
      this.referencia.close('ajustada');
    } catch (error) {
      await this.mostrarError(aErrorIdentidad(error));
    } finally {
      this.guardando.set(false);
    }
  }

  protected cerrar(): void {
    this.referencia.close();
  }

  /** 409: avisa y recarga sin cerrar. 422: bajo el campo. Lo demás, como alerta. */
  private async mostrarError(error: ErrorIdentidad): Promise<void> {
    if (error.codigo === CODIGO_VERSION_OBSOLETA) {
      this.error.set(MENSAJES_AJUSTE_CUOTA.versionObsoleta);
      await this.recargar();
      return;
    }
    if (error.estado === HTTP_ENTIDAD_NO_PROCESABLE) {
      const control = this.formulario.controls.incluidas;
      control.setErrors({ [ERROR_API]: error.message });
      control.markAsTouched();
      return;
    }
    this.error.set(error.message);
  }

  private async recargar(): Promise<void> {
    try {
      const detalle = await this.datos.recargarDetalle();
      this.detalle.set(detalle);
      this.formulario.controls.incluidas.setValidators(this.validadores(detalle.consumidas));
      this.formulario.controls.incluidas.updateValueAndValidity();
    } catch (error) {
      this.error.set(aErrorIdentidad(error).message);
    }
  }

  private validadores(consumidas: number) {
    return [Validators.required, Validators.pattern(PATRON_ENTERO), Validators.min(consumidas)];
  }
}
