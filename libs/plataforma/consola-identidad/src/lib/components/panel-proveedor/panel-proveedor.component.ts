import { Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators, type ValidationErrors, type ValidatorFn } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { AccionesFormularioComponent, AvisosService, mensajeDeValidacion, PanelLateralComponent } from '@vitrina/shared/ui';
import { aErrorIdentidad, CODIGO_VERSION_OBSOLETA, type ErrorIdentidad } from '../../models/error-identidad';
import { MENSAJES_PANEL_PROVEEDOR, textoConfirmarDesactivar } from '../../models/mensajes-identidad';
import { RANGOS_PROVEEDOR, type CambiosProveedor, type Proveedor } from '../../models/proveedor';
import { ProveedoresCliente } from '../../services/proveedores.cliente';

const CODIGO_ULTIMO_PROVEEDOR_ACTIVO = 'ULTIMO_PROVEEDOR_ACTIVO';
const PATRON_ENTERO = /^\d+$/;

export interface DatosPanelProveedor {
  proveedor: Proveedor;
  /** Recarga la lista de la página y devuelve este proveedor: tras un 409 el panel sigue abierto con los datos nuevos. */
  recargarProveedor: () => Promise<Proveedor>;
}

export type ResultadoPanelProveedor = 'actualizado';

/** Contenido del panel lateral «Editar proveedor» (spec 30). Sin credenciales (regla 9). Desactivar pide confirmación. */
@Component({
  selector: 'vit-panel-proveedor',
  imports: [ReactiveFormsModule, MatFormFieldModule, MatInputModule, MatSlideToggleModule, AccionesFormularioComponent, PanelLateralComponent],
  templateUrl: './panel-proveedor.component.html',
})
export class PanelProveedorComponent {
  private readonly referencia = inject<MatDialogRef<PanelProveedorComponent, ResultadoPanelProveedor>>(MatDialogRef);
  private readonly datos = inject<DatosPanelProveedor>(MAT_DIALOG_DATA);
  private readonly proveedores = inject(ProveedoresCliente);
  private readonly avisos = inject(AvisosService);

  protected readonly mensajes = MENSAJES_PANEL_PROVEEDOR;
  protected readonly rangos = RANGOS_PROVEEDOR;
  protected readonly proveedor = signal(this.datos.proveedor);
  protected readonly formulario = inject(NonNullableFormBuilder).group({
    prioridad: [this.datos.proveedor.prioridad, validadoresDeEntero(RANGOS_PROVEEDOR.prioridad)],
    ttlDias: [this.datos.proveedor.ttlDias, validadoresDeEntero(RANGOS_PROVEEDOR.ttlDias)],
    timeoutMs: [this.datos.proveedor.timeoutMs, validadoresDeEntero(RANGOS_PROVEEDOR.timeoutMs)],
    activo: [this.datos.proveedor.activo],
  });
  protected readonly guardando = signal(false);
  protected readonly error = signal<string | null>(null);

  protected mensajeDeError(errores: ValidationErrors | null): string | null {
    if (errores?.['pattern']) return MENSAJES_PANEL_PROVEEDOR.enteroRequerido;
    return mensajeDeValidacion(errores);
  }

  protected async guardar(): Promise<void> {
    if (this.guardando()) return;
    if (this.formulario.invalid) {
      this.formulario.markAllAsTouched();
      return;
    }
    const cambios = this.cambios();
    if (!tieneCambios(cambios)) {
      this.cerrar();
      return;
    }
    if (cambios.activo === false && !(await this.confirmarDesactivar())) {
      this.volverAActivo();
      return;
    }
    await this.enviar(cambios);
  }

  protected cerrar(): void {
    this.referencia.close();
  }

  private async enviar(cambios: CambiosProveedor): Promise<void> {
    this.guardando.set(true);
    this.error.set(null);
    try {
      await this.proveedores.actualizar(this.proveedor().codigo, cambios);
      this.referencia.close('actualizado');
    } catch (error) {
      await this.mostrarError(aErrorIdentidad(error));
    } finally {
      this.guardando.set(false);
    }
  }

  private async confirmarDesactivar(): Promise<boolean> {
    const resultado = await this.avisos.confirmarDestructiva({
      titulo: MENSAJES_PANEL_PROVEEDOR.tituloDesactivar,
      texto: textoConfirmarDesactivar(this.proveedor().codigo),
      textoConfirmar: MENSAJES_PANEL_PROVEEDOR.desactivar,
    });
    return resultado.confirmado;
  }

  /** Solo los campos que cambió el operador, para que el evento refleje lo que tocó. */
  private cambios(): CambiosProveedor {
    const original = this.proveedor();
    const valor = this.formulario.getRawValue();
    const cambios: CambiosProveedor = { version: original.version };
    if (Number(valor.prioridad) !== original.prioridad) cambios.prioridad = Number(valor.prioridad);
    if (Number(valor.ttlDias) !== original.ttlDias) cambios.ttlDias = Number(valor.ttlDias);
    if (Number(valor.timeoutMs) !== original.timeoutMs) cambios.timeoutMs = Number(valor.timeoutMs);
    if (valor.activo !== original.activo) cambios.activo = valor.activo;
    return cambios;
  }

  /** 409: avisa y recarga sin cerrar. 422 ULTIMO_PROVEEDOR_ACTIVO: el interruptor vuelve a activo. Lo demás, como alerta. */
  private async mostrarError(error: ErrorIdentidad): Promise<void> {
    if (error.codigo === CODIGO_VERSION_OBSOLETA) {
      this.error.set(MENSAJES_PANEL_PROVEEDOR.versionObsoleta);
      await this.recargar();
      return;
    }
    if (error.codigo === CODIGO_ULTIMO_PROVEEDOR_ACTIVO) this.volverAActivo();
    this.error.set(error.message);
  }

  private async recargar(): Promise<void> {
    try {
      const proveedor = await this.datos.recargarProveedor();
      this.proveedor.set(proveedor);
      this.formulario.reset({ prioridad: proveedor.prioridad, ttlDias: proveedor.ttlDias, timeoutMs: proveedor.timeoutMs, activo: proveedor.activo });
    } catch (error) {
      this.error.set(aErrorIdentidad(error).message);
    }
  }

  private volverAActivo(): void {
    this.formulario.controls.activo.setValue(true);
  }
}

function validadoresDeEntero(rango: { minimo: number; maximo?: number }): ValidatorFn[] {
  const validadores = [Validators.required, Validators.pattern(PATRON_ENTERO), Validators.min(rango.minimo)];
  if (rango.maximo === undefined) return validadores;
  return [...validadores, Validators.max(rango.maximo)];
}

function tieneCambios(cambios: CambiosProveedor): boolean {
  return Object.keys(cambios).some((clave) => clave !== 'version');
}
