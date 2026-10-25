import type { Clock } from '@vitrina/plataforma/kernel';
import type { EventoEntregado } from '../domain/evento-entregado.js';
import type { Avisar } from './dependencias-entrega.js';
import type { ColaEventos, CursorRelay, EntregaEncolada, LectorOutbox } from './ports/relay.js';
import type { RegistroSuscripciones } from './ports/suscripciones.js';

export const RELAY_PRINCIPAL = 'principal';

export interface OpcionesDespacho {
  margenSeg: number;
  lote: number;
  ventanaSeg: number;
  /** Cada cuánto se relee la ventana. */
  rebarridoCadaMs: number;
}

export interface DependenciasDespacho {
  cursor: CursorRelay;
  cola: ColaEventos;
  suscripciones: RegistroSuscripciones;
  reloj: Clock;
  depurar: Avisar;
}

export interface LoteDespachado {
  leidos: number;
  rebarridos: number;
  encolados: number;
  cursor: string;
}

/**
 * Un ciclo del relay (TR-RF-093): lee el outbox por cursor con margen y encola cada evento para cada
 * consumidor suscrito. Se encola dentro de la transacción del cursor: si Redis falla, el cursor no avanza
 * y el siguiente ciclo reintenta; el `jobId` descarta lo ya encolado.
 */
export class DespacharLote {
  private ultimoRebarridoMs = Number.NEGATIVE_INFINITY;

  constructor(
    private readonly dependencias: DependenciasDespacho,
    private readonly opciones: OpcionesDespacho,
  ) {}

  /** null si otra instancia tenía el cursor. */
  ejecutar(): Promise<LoteDespachado | null> {
    return this.dependencias.cursor.conBloqueo(RELAY_PRINCIPAL, (cursor, lector) => this.despachar(cursor, lector));
  }

  private async despachar(cursor: string, lector: LectorOutbox) {
    const { margenSeg, lote, ventanaSeg } = this.opciones;
    const ahoraMs = this.dependencias.reloj.now().getTime();
    const nuevos = await lector.leer(cursor, margenSeg, lote);
    const rebarrer = this.tocaRebarrido(ahoraMs);
    const rebarridos = rebarrer ? await lector.leerVentana(cursor, ventanaSeg, lote) : [];
    const entregas = [...nuevos, ...rebarridos].flatMap((evento) => this.entregasDe(evento));

    await this.dependencias.cola.encolar(entregas);
    if (rebarrer) this.ultimoRebarridoMs = ahoraMs;

    const nuevoCursor = nuevos.at(-1)?.seq ?? cursor;
    const resultado: LoteDespachado = { leidos: nuevos.length, rebarridos: rebarridos.length, encolados: entregas.length, cursor: nuevoCursor };
    this.dependencias.depurar('Lote del outbox despachado', { ...resultado });
    return { nuevoCursor, resultado };
  }

  private tocaRebarrido(ahoraMs: number): boolean {
    return ahoraMs - this.ultimoRebarridoMs >= this.opciones.rebarridoCadaMs;
  }

  /** Un tipo sin suscriptores no se encola. */
  private entregasDe(evento: EventoEntregado): EntregaEncolada[] {
    return this.dependencias.suscripciones
      .consumidoresDe(evento.eventType)
      .map((consumidor) => ({ consumidor, evento, idTrabajo: evento.eventId }));
  }
}
