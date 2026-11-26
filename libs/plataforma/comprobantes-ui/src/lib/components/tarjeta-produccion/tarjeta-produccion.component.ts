import { Component, computed, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { SiPermisoDirective } from '@vitrina/shared/auth';
import type { Emisor } from '../../models/emisor';
import { MENSAJES_EMISOR } from '../../models/mensajes-emisor';
import { PERMISOS_FE_UI } from '../../models/permisos-fe';
import { motivoProduccionDeshabilitada } from '../../utils/reglas-emisor';
import { resumenProduccion, vigenciaDePrueba } from '../../utils/resumenes-emisor';

/** Tarjeta 4: el paso a producción, con su motivo si está deshabilitado. La confirmación la abre la página. */
@Component({
  selector: 'vit-tarjeta-produccion',
  imports: [MatButtonModule, MatIconModule, MatProgressSpinnerModule, SiPermisoDirective],
  templateUrl: './tarjeta-produccion.component.html',
})
export class TarjetaProduccionComponent {
  readonly emisor = input.required<Emisor | null>();
  readonly ahora = input.required<Date>();
  readonly pasando = input<boolean>(false);
  readonly error = input<string | null>(null);
  readonly pasar = output<void>();

  protected readonly mensajes = MENSAJES_EMISOR.produccion;
  protected readonly permisos = PERMISOS_FE_UI;

  protected readonly enProduccion = computed(() => this.emisor()?.estado === 'PRODUCCION');
  protected readonly motivo = computed(() => motivoProduccionDeshabilitada(this.emisor(), this.ahora()));
  protected readonly vigencia = computed(() => (this.motivo() ? null : vigenciaDePrueba(this.emisor())));
  protected readonly desde = computed(() => resumenProduccion(this.emisor(), this.ahora()));
}
