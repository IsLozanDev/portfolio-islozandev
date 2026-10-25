import type { EventoEntregado } from '../domain/evento-entregado.js';
import { EventoFallido } from '../domain/evento-fallido.js';
import { alcanceDelEvento, datosDeLog, type DependenciasEntrega } from './dependencias-entrega.js';

export interface FalloEntrega {
  consumidor: string;
  evento: EventoEntregado;
  error: string;
  intentos: number;
}

/** Deja la entrega en la cola de fallidos (TR-RF-095). Un reproceso que vuelve a fallar suma sus intentos. */
export class RegistrarFallo {
  constructor(private readonly dependencias: DependenciasEntrega) {}

  ejecutar(fallo: FalloEntrega): Promise<void> {
    const { contexto, unidadDeTrabajo } = this.dependencias;
    return contexto.run(alcanceDelEvento(fallo.evento), () => unidadDeTrabajo.run(() => this.guardar(fallo)));
  }

  private async guardar(fallo: FalloEntrega): Promise<void> {
    const { fallidos, ids, reloj, avisar } = this.dependencias;
    const ahora = reloj.now();
    const existente = await fallidos.buscarPorEvento(fallo.consumidor, fallo.evento.eventId);
    existente?.registrarFallo(fallo.error, fallo.intentos, ahora);
    const fallido = existente ?? EventoFallido.registrar({ id: ids.next(), ...fallo, ahora });
    await fallidos.guardar(fallido);
    avisar('Entrega agotó sus intentos', { ...datosDeLog(fallo.consumidor, fallo.evento), intentos: fallido.intentos });
  }
}
