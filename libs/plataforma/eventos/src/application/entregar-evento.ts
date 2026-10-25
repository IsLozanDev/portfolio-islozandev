import type { EventoEntregado } from '../domain/evento-entregado.js';
import { alcanceDelEvento, datosDeLog, type DependenciasEntrega } from './dependencias-entrega.js';
import type { Manejador } from './ports/suscripciones.js';
import type { RegistrarFallo } from './registrar-fallo.js';

export interface Entrega {
  consumidor: string;
  evento: EventoEntregado;
  /** Número de este intento, desde 1. */
  intento: number;
  intentosMaximos: number;
}

/**
 * Entrega un evento a un consumidor, al menos una vez e idempotente por `event_id` (TR-RF-093, TR-RN-034).
 * La fila de procesado y el efecto van en la misma transacción: si el manejador lanza, se revierten juntos.
 */
export class EntregarEvento {
  constructor(
    private readonly dependencias: DependenciasEntrega,
    private readonly registrarFallo: RegistrarFallo,
  ) {}

  async ejecutar(entrega: Entrega): Promise<void> {
    const { suscripciones, contexto, unidadDeTrabajo, avisar } = this.dependencias;
    const { consumidor, evento } = entrega;
    const manejador = suscripciones.manejador(consumidor, evento.eventType);
    if (!manejador) {
      avisar('Evento sin manejador en el consumidor', datosDeLog(consumidor, evento));
      return;
    }

    try {
      await contexto.run(alcanceDelEvento(evento), () => unidadDeTrabajo.run(() => this.procesar(consumidor, evento, manejador)));
    } catch (error) {
      // Antes de relanzar: si el proceso muere después, la fila de fallido ya existe.
      if (entrega.intento >= entrega.intentosMaximos) {
        await this.registrarFallo.ejecutar({ consumidor, evento, error: mensajeDe(error), intentos: entrega.intento });
      }
      throw error;
    }
  }

  private async procesar(consumidor: string, evento: EventoEntregado, manejador: Manejador): Promise<void> {
    const esNuevo = await this.dependencias.procesados.registrar(consumidor, evento);
    if (esNuevo) await manejador(evento);
    await this.cerrarFallido(consumidor, evento.eventId);
  }

  /** Un reproceso, o un fallido que otra vía ya procesó (TR-CA-234), sale de la cola de fallidos. */
  private async cerrarFallido(consumidor: string, eventId: string): Promise<void> {
    const { fallidos } = this.dependencias;
    const fallido = await fallidos.buscarPorEvento(consumidor, eventId);
    if (fallido?.marcarProcesado()) await fallidos.guardar(fallido);
  }
}

function mensajeDe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
