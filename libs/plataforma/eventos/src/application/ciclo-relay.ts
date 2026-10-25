import type { Avisar } from './dependencias-entrega.js';

/** Una vuelta del relay: `DespacharLote`. */
export interface Despacho {
  ejecutar(): Promise<unknown>;
}

const SIN_ESPERA = 0;

/**
 * Corre el despacho cada `intervaloMs` (TR-RF-093). La siguiente vuelta se programa al terminar la anterior:
 * nunca hay dos a la vez en el mismo proceso. Una vuelta que falla se avisa y el ciclo sigue.
 */
export class CicloRelay {
  private temporizador: NodeJS.Timeout | undefined;
  private vueltaEnCurso: Promise<void> = Promise.resolve();
  private activo = false;

  constructor(
    private readonly despacho: Despacho,
    private readonly intervaloMs: number,
    private readonly alFallar: Avisar,
  ) {}

  iniciar(): void {
    this.activo = true;
    this.programar(SIN_ESPERA);
  }

  /** Espera la vuelta en curso: su transacción del cursor confirma o revierte antes del cierre. */
  async detener(): Promise<void> {
    this.activo = false;
    clearTimeout(this.temporizador);
    await this.vueltaEnCurso;
  }

  private programar(esperaMs: number): void {
    this.temporizador = setTimeout(() => {
      this.vueltaEnCurso = this.darVuelta();
    }, esperaMs);
  }

  private async darVuelta(): Promise<void> {
    try {
      await this.despacho.ejecutar();
    } catch (error) {
      this.alFallar('Vuelta del relay falló', datosDelError(error));
    }
    if (this.activo) this.programar(this.intervaloMs);
  }
}

function datosDelError(error: unknown): Record<string, unknown> {
  if (!(error instanceof Error)) return { error: String(error) };
  return { error: error.name, mensaje: error.message };
}
