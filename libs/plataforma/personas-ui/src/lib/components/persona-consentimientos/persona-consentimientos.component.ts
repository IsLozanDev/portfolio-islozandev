import { Component, effect, inject, input, signal } from '@angular/core';
import { TablaComponent, type ColumnaTabla } from '@vitrina/shared/ui';
import type { DecisionVigente, EstadoConsentimiento } from '../../models/consentimiento';
import { ETIQUETAS_CANAL, ETIQUETAS_ESTADO_CONSENTIMIENTO, ETIQUETAS_FINALIDAD } from '../../models/etiquetas-personas';
import { TAMANO_LISTA_FICHA } from '../../models/ficha';
import { MENSAJES_FICHA } from '../../models/mensajes-ficha';
import { TONOS_ESTADO_CONSENTIMIENTO } from '../../models/tonos-personas';
import { ConsentimientosCliente } from '../../services/consentimientos.cliente';
import { mensajeDe } from '../../utils/cambios-ficha';
import { formatoFechaHora } from '../../utils/fechas';

export interface FilaConsentimiento {
  finalidad: string;
  estado: EstadoConsentimiento;
  decision: string;
  version: string;
  canal: string;
  fecha: string;
}

/** Sección «Consentimientos» (spec 37), solo lectura: la decisión vigente por finalidad. Se registran en cada producto. */
@Component({
  selector: 'vit-persona-consentimientos',
  imports: [TablaComponent],
  templateUrl: './persona-consentimientos.component.html',
})
export class PersonaConsentimientosComponent {
  private readonly consentimientos = inject(ConsentimientosCliente);

  readonly personaId = input.required<string>();

  protected readonly mensajes = MENSAJES_FICHA.consentimientos;
  protected readonly tamanosPagina = [TAMANO_LISTA_FICHA];
  protected readonly columnas: ColumnaTabla<FilaConsentimiento>[] = [
    { clave: 'finalidad', titulo: this.mensajes.finalidad, movil: 'titulo' },
    { clave: 'decision', titulo: this.mensajes.decision, tono: (fila) => TONOS_ESTADO_CONSENTIMIENTO[fila.estado], movil: 'estado' },
    { clave: 'version', titulo: this.mensajes.texto },
    { clave: 'canal', titulo: this.mensajes.canal, movil: 'detalle' },
    { clave: 'fecha', titulo: this.mensajes.fecha, movil: 'detalle' },
  ];
  protected readonly filas = signal<FilaConsentimiento[]>([]);
  protected readonly cargando = signal(true);
  protected readonly error = signal<string | null>(null);

  constructor() {
    effect(() => void this.cargar(this.personaId()));
  }

  private async cargar(personaId: string): Promise<void> {
    this.cargando.set(true);
    this.error.set(null);
    try {
      this.filas.set((await this.consentimientos.vigentes(personaId)).map((decision) => this.filaDe(decision)));
    } catch (error) {
      this.error.set(mensajeDe(error));
    } finally {
      this.cargando.set(false);
    }
  }

  private filaDe(decision: DecisionVigente): FilaConsentimiento {
    return {
      finalidad: ETIQUETAS_FINALIDAD[decision.finalidad],
      estado: decision.estado,
      decision: ETIQUETAS_ESTADO_CONSENTIMIENTO[decision.estado],
      version: this.mensajes.version(decision.versionTexto),
      canal: ETIQUETAS_CANAL[decision.canal],
      fecha: formatoFechaHora(decision.fecha),
    };
  }
}
