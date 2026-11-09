import { DOCUMENT, inject, Injectable } from '@angular/core';
import type { ComponentType } from '@angular/cdk/portal';
import { MatDialog, type MatDialogRef } from '@angular/material/dialog';
import {
  ALTO_PANEL_LATERAL,
  ANCHO_PANEL_LATERAL,
  CLASE_FONDO_PANEL_LATERAL,
  CLASE_PANEL_LATERAL,
  CONSULTA_MOVIMIENTO_REDUCIDO,
  DURACION_PANEL_ENTRADA_MS,
  DURACION_PANEL_REDUCIDA_MS,
  DURACION_PANEL_SALIDA_MS,
  SELECTOR_PRIMER_CAMPO,
  type OpcionesPanelLateral,
} from '../models/panel-lateral';

/**
 * Formularios en un panel que entra desde la derecha. Un clic en el fondo no lo cierra (`disableClose`);
 * Esc, la X y «Cancelar» sí, desde `vit-panel-lateral` o el contenido. Las confirmaciones van con `AvisosService`.
 */
@Injectable({ providedIn: 'root' })
export class PanelLateralService {
  private readonly dialogo = inject(MatDialog);
  private readonly documento = inject(DOCUMENT);

  abrir<Componente, Datos, Resultado>(componente: ComponentType<Componente>, opciones: OpcionesPanelLateral<Datos>): MatDialogRef<Componente, Resultado> {
    const reducido = this.movimientoReducido();
    return this.dialogo.open<Componente, Datos, Resultado>(componente, {
      data: opciones.datos,
      position: { right: '0' },
      height: ALTO_PANEL_LATERAL,
      maxHeight: ALTO_PANEL_LATERAL,
      width: ANCHO_PANEL_LATERAL,
      maxWidth: '100vw',
      panelClass: CLASE_PANEL_LATERAL,
      backdropClass: CLASE_FONDO_PANEL_LATERAL,
      disableClose: true,
      autoFocus: SELECTOR_PRIMER_CAMPO,
      restoreFocus: true,
      enterAnimationDuration: reducido ? DURACION_PANEL_REDUCIDA_MS : DURACION_PANEL_ENTRADA_MS,
      exitAnimationDuration: reducido ? DURACION_PANEL_REDUCIDA_MS : DURACION_PANEL_SALIDA_MS,
    });
  }

  private movimientoReducido(): boolean {
    return this.documento.defaultView?.matchMedia?.(CONSULTA_MOVIMIENTO_REDUCIDO).matches ?? false;
  }
}
