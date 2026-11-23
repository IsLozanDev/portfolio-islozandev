import { MatDialogRef } from '@angular/material/dialog';
import { EMPTY } from 'rxjs';

/** MatDialogRef de prueba para el contenido de un panel lateral: `vit-panel-lateral` escucha Esc en `keydownEvents`. */
export function referenciaDialogoDePrueba() {
  const referencia = { close: vi.fn(), keydownEvents: () => EMPTY };
  return { referencia, proveedor: { provide: MatDialogRef, useValue: referencia } };
}
