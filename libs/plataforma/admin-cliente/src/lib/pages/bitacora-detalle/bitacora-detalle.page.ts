import { Component, computed, inject, signal, type OnInit } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { CargandoComponent, ChipEstadoComponent, type TonoEstado } from '@vitrina/shared/ui';
import { aErrorAdmin } from '../../models/error-admin';
import type { EventoSeguridadDetalle } from '../../models/evento-seguridad';
import { ETIQUETAS_TIPO_EVENTO, MENSAJES_BITACORA, TONOS_TIPO_EVENTO } from '../../models/mensajes-bitacora';
import { BitacoraCliente } from '../../services/bitacora.cliente';
import { formatearFechaHora } from '../../utils/formato';

const PARAMETRO_EVENTO = 'eventoId';

/** Una línea de «Datos del evento»: el valor ya como texto plano (no se interpreta HTML). */
export interface DatoDelEvento {
  clave: string;
  valor: string;
}

/** Detalle de un evento con su IP y sus datos (spec 18, TR-RF-019; pantalla tipo «Detalle», solo lectura). */
@Component({
  selector: 'vit-bitacora-detalle',
  imports: [MatButtonModule, RouterLink, CargandoComponent, ChipEstadoComponent],
  templateUrl: './bitacora-detalle.page.html',
})
export class BitacoraDetallePage implements OnInit {
  private readonly bitacora = inject(BitacoraCliente);
  private readonly eventoId = inject(ActivatedRoute).snapshot.paramMap.get(PARAMETRO_EVENTO) ?? '';

  protected readonly mensajes = MENSAJES_BITACORA;
  protected readonly evento = signal<EventoSeguridadDetalle | null>(null);
  protected readonly cargando = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly fecha = computed(() => {
    const evento = this.evento();
    return evento ? formatearFechaHora(evento.ocurridoEn) : '';
  });
  protected readonly datos = computed(() => datosDe(this.evento()?.detalle ?? {}));

  ngOnInit(): void {
    void this.cargar();
  }

  protected etiquetaTipo(evento: EventoSeguridadDetalle): string {
    return ETIQUETAS_TIPO_EVENTO[evento.tipo];
  }

  protected tonoTipo(evento: EventoSeguridadDetalle): TonoEstado {
    return TONOS_TIPO_EVENTO[evento.tipo];
  }

  private async cargar(): Promise<void> {
    try {
      this.evento.set(await this.bitacora.detalle(this.eventoId));
    } catch (error) {
      this.error.set(aErrorAdmin(error).message);
    } finally {
      this.cargando.set(false);
    }
  }
}

function datosDe(detalle: Readonly<Record<string, unknown>>): DatoDelEvento[] {
  return Object.entries(detalle).map(([clave, valor]) => ({ clave, valor: comoTexto(valor) }));
}

function comoTexto(valor: unknown): string {
  if (valor === null || valor === undefined) return MENSAJES_BITACORA.sinDato;
  return typeof valor === 'string' ? valor : JSON.stringify(valor);
}
