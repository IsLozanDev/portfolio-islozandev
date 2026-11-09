import { Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { AccionesFormularioComponent, MensajeValidacionPipe, PanelLateralComponent } from '@vitrina/shared/ui';
import type { FilaItemAdmin, SolicitudAjuste } from '../../models/catalogo-admin';
import { aErrorAdmin, CODIGO_VERSION_OBSOLETA } from '../../models/error-admin';
import { MENSAJES_PANEL_AJUSTE } from '../../models/mensajes-catalogos-admin';
import { CatalogosAdminCliente } from '../../services/catalogos-admin.cliente';

/** Los mismos límites del back (19a). */
const ALIAS_MAXIMO = 200;
const ENTERO = /^-?\d+$/;

export interface DatosPanelAjuste {
  codigoCatalogo: string;
  fila: FilaItemAdmin;
}

/** `obsoleta`: otro usuario cambió el ajuste; la página avisa y recarga. */
export type ResultadoPanelAjuste = 'guardado' | 'sin-cambios' | 'obsoleta';

/** Contenido del panel «Personalizar» de un ítem global en un catálogo MIXTO (TR-RF-025): alias, orden y visible. */
@Component({
  selector: 'vit-panel-ajuste',
  imports: [ReactiveFormsModule, MatCheckboxModule, MatFormFieldModule, MatInputModule, AccionesFormularioComponent, MensajeValidacionPipe, PanelLateralComponent],
  templateUrl: './panel-ajuste.component.html',
})
export class PanelAjusteComponent {
  private readonly referencia = inject<MatDialogRef<PanelAjusteComponent, ResultadoPanelAjuste>>(MatDialogRef);
  private readonly datos = inject<DatosPanelAjuste>(MAT_DIALOG_DATA);
  private readonly catalogos = inject(CatalogosAdminCliente);

  protected readonly mensajes = MENSAJES_PANEL_AJUSTE;
  protected readonly fila = this.datos.fila;
  protected readonly titulo = MENSAJES_PANEL_AJUSTE.titulo(this.fila.nombre);
  protected readonly formulario = inject(NonNullableFormBuilder).group({
    alias: [this.fila.ajuste?.alias ?? '', Validators.maxLength(ALIAS_MAXIMO)],
    orden: [this.fila.ajuste?.orden?.toString() ?? '', Validators.pattern(ENTERO)],
    visible: [this.fila.ajuste?.visible ?? true],
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
      const cambiado = await this.catalogos.ajustar(this.datos.codigoCatalogo, this.fila.itemId, this.solicitud());
      this.referencia.close(cambiado ? 'guardado' : 'sin-cambios');
    } catch (error) {
      const errorAdmin = aErrorAdmin(error);
      if (errorAdmin.codigo === CODIGO_VERSION_OBSOLETA) this.referencia.close('obsoleta');
      else this.error.set(errorAdmin.message);
    } finally {
      this.guardando.set(false);
    }
  }

  protected cerrar(): void {
    this.referencia.close();
  }

  /** Alias y orden vacíos viajan como null: el ítem usa los valores globales. */
  private solicitud(): SolicitudAjuste {
    const { alias, orden, visible } = this.formulario.getRawValue();
    return {
      visible,
      alias: alias.trim() || null,
      orden: orden.trim() === '' ? null : Number(orden),
      version: this.fila.ajuste?.version ?? null,
    };
  }
}
