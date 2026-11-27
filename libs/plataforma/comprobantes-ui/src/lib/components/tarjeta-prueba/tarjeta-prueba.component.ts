import { Component, computed, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { SiPermisoDirective } from '@vitrina/shared/auth';
import type { Emisor } from '../../models/emisor';
import { MENSAJE_PRUEBA_ACEPTADA, MENSAJE_PRUEBA_SIGUE_EN_PROCESO, MENSAJES_EMISOR, MOTIVOS_DESHABILITADA, mensajePruebaRechazada } from '../../models/mensajes-emisor';
import { PERMISOS_FE_UI } from '../../models/permisos-fe';
import { formatoFechaHoraCorta } from '../../utils/fechas';
import { pruebaEnProceso } from '../../utils/reglas-emisor';

type ResultadoPrueba = { tipo: 'aceptada' | 'rechazada' | 'error'; texto: string; detalle: string };

/** Tarjeta 3: la última prueba en beta y su resultado (TR-CA-133 y 134). La consulta automática la lleva la página. */
@Component({
  selector: 'vit-tarjeta-prueba',
  imports: [MatButtonModule, MatIconModule, MatProgressBarModule, SiPermisoDirective],
  templateUrl: './tarjeta-prueba.component.html',
})
export class TarjetaPruebaComponent {
  readonly emisor = input.required<Emisor | null>();
  readonly solicitando = input<boolean>(false);
  /** La consulta automática terminó y la prueba sigue EN_PROCESO. */
  readonly agotado = input<boolean>(false);
  readonly error = input<string | null>(null);
  readonly ejecutar = output<void>();
  readonly actualizar = output<void>();

  protected readonly mensajes = MENSAJES_EMISOR.prueba;
  protected readonly permisos = PERMISOS_FE_UI;
  protected readonly sigueEnProceso = MENSAJE_PRUEBA_SIGUE_EN_PROCESO;
  protected readonly sinPruebasEnProduccion = MOTIVOS_DESHABILITADA.pruebaEnProduccion;

  protected readonly prueba = computed(() => this.emisor()?.prueba ?? null);
  protected readonly enProceso = computed(() => pruebaEnProceso(this.emisor()));
  protected readonly enProduccion = computed(() => this.emisor()?.estado === 'PRODUCCION');
  protected readonly resultado = computed<ResultadoPrueba | null>(() => {
    const prueba = this.prueba();
    if (!prueba || prueba.estado === 'EN_PROCESO') return null;
    const detalle = `${this.mensajes.numero(prueba.numero)} · ${formatoFechaHoraCorta(prueba.resultadoEn ?? prueba.solicitadaEn)}`;
    if (prueba.estado === 'ACEPTADA') return { tipo: 'aceptada', texto: MENSAJE_PRUEBA_ACEPTADA, detalle };
    if (prueba.estado === 'RECHAZADA') return { tipo: 'rechazada', texto: mensajePruebaRechazada(prueba.codigo, prueba.descripcion), detalle };
    return { tipo: 'error', texto: this.mensajes.errorEnvio, detalle };
  });
  protected readonly iconoBoton = computed(() => {
    if (this.enProceso()) return 'hourglass_top';
    return this.prueba() ? 'replay' : 'send';
  });
  protected readonly textoBoton = computed(() => {
    if (this.enProceso()) return this.mensajes.probando;
    return this.prueba() ? this.mensajes.volverAProbar : this.mensajes.ejecutar;
  });
}
