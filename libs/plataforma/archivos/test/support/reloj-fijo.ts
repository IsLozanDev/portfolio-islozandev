import type { Clock } from '@vitrina/plataforma/kernel';

const MILISEGUNDOS_POR_MINUTO = 60_000;

/** Reloj que solo avanza cuando la prueba lo pide. */
export class RelojFijo implements Clock {
  private instante: Date;

  constructor(inicio: string) {
    this.instante = new Date(inicio);
  }

  now(): Date {
    return new Date(this.instante);
  }

  adelantarMinutos(minutos: number): void {
    this.instante = new Date(this.instante.getTime() + minutos * MILISEGUNDOS_POR_MINUTO);
  }
}
