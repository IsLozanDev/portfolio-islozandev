import { Component, computed, inject, input } from '@angular/core';
import { SesionService } from '@vitrina/shared/auth';
import { ChipEstadoComponent, SeccionPlegableComponent, type TonoEstado } from '@vitrina/shared/ui';
import { MENSAJES_HISTORIAL_PLANTILLA } from '../../models/mensajes-plantillas';
import type { VersionPlantilla } from '../../models/plantilla';
import { formatearFechaHora } from '../../utils/formato';

interface FilaHistorial {
  version: number;
  numero: string;
  estado: string;
  tono: TonoEstado;
  autor: string;
  fecha: string;
}

/**
 * Historial de versiones del tenant en una sección plegable que abre contraída (spec 47). La API solo da el id del
 * autor: se muestra «Usted» si es quien mira y «Otro usuario» si no.
 */
@Component({
  selector: 'vit-historial-plantilla',
  imports: [ChipEstadoComponent, SeccionPlegableComponent],
  templateUrl: './historial-plantilla.component.html',
})
export class HistorialPlantillaComponent {
  private readonly sesion = inject(SesionService);

  /** `null` si no se pudo cargar. */
  readonly versiones = input.required<readonly VersionPlantilla[] | null>();

  protected readonly mensajes = MENSAJES_HISTORIAL_PLANTILLA;
  protected readonly filas = computed(() => (this.versiones() ?? []).map((version) => this.filaDe(version)));
  protected readonly rigeBase = computed(() => !(this.versiones() ?? []).some((version) => version.activa));
  protected readonly resumen = computed(() => this.resumenDe(this.versiones()));

  private resumenDe(versiones: readonly VersionPlantilla[] | null): string {
    if (versiones === null) return this.mensajes.noSePudo;
    if (versiones.length === 0) return this.mensajes.sinVersiones;
    const vigente = versiones.find((version) => version.activa);
    return vigente ? this.mensajes.conVigente(versiones.length, vigente.version) : this.mensajes.sinVigente(versiones.length);
  }

  private filaDe(version: VersionPlantilla): FilaHistorial {
    const esUsted = version.creadoPor !== null && version.creadoPor === this.sesion.contexto()?.usuarioId;
    return {
      version: version.version,
      numero: this.mensajes.numero(version.version),
      estado: version.activa ? this.mensajes.vigente : this.mensajes.inactiva,
      tono: version.activa ? 'exito' : 'neutro',
      autor: esUsted ? this.mensajes.usted : this.mensajes.otroUsuario,
      fecha: formatearFechaHora(new Date(version.creadoEn)),
    };
  }
}
