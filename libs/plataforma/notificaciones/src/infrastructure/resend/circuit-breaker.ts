import type { Clock } from '@vitrina/plataforma/kernel';

// Copia del de TR-IDN (NOT no depende de IDN en PL-10). Si un tercer componente lo necesita, sube a kernel-infra.
export const UMBRAL_FALLOS = 5;
export const APERTURA_MS = 30_000;

type EstadoBreaker = 'CERRADO' | 'ABIERTO' | 'SEMIABIERTO';

/** En memoria, por instancia del worker. */
export class CircuitBreaker {
  private estado: EstadoBreaker = 'CERRADO';
  private fallosSeguidos = 0;
  private abiertoEn = 0;

  constructor(private readonly reloj: Clock) {}

  permiteLlamada(): boolean {
    if (this.estado !== 'ABIERTO') return true;
    if (this.reloj.now().getTime() - this.abiertoEn < APERTURA_MS) return false;
    this.estado = 'SEMIABIERTO';
    return true;
  }

  registrarExito(): void {
    this.estado = 'CERRADO';
    this.fallosSeguidos = 0;
  }

  registrarFallo(): void {
    this.fallosSeguidos += 1;
    if (this.estado === 'SEMIABIERTO' || this.fallosSeguidos >= UMBRAL_FALLOS) this.abrir();
  }

  private abrir(): void {
    this.estado = 'ABIERTO';
    this.abiertoEn = this.reloj.now().getTime();
  }
}
