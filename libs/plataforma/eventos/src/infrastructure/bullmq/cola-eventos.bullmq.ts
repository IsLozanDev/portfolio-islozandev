import { Queue } from 'bullmq';
import type { Redis } from 'ioredis';
import type { ColaEventos, EntregaEncolada } from '../../application/ports/relay.js';
import type { EventoEntregado } from '../../domain/evento-entregado.js';
import { NombreConsumidor } from '../../domain/nombre-consumidor.js';
import { opcionesDeTrabajo, type PoliticaReintentos } from './politica-reintentos.js';

/**
 * BullMQ espera a que Redis esté listo antes de cada comando, sin límite: con Redis caído, el relay quedaría
 * con el cursor bloqueado para siempre. Pasado este tiempo, encolar lanza y la transacción del cursor revierte.
 */
const TIEMPO_MAXIMO_ENCOLAR_MS = 5000;

export class RedisSinRespuestaError extends Error {
  constructor() {
    super(`Redis no respondió en ${TIEMPO_MAXIMO_ENCOLAR_MS} ms al encolar`);
  }
}

/** Productor de las colas `evt-<consumidor>`: una `Queue` por consumidor, creada al primer uso. */
export class ColaEventosBullMQ implements ColaEventos {
  private readonly colas = new Map<string, Queue<EventoEntregado>>();

  constructor(
    private readonly conexion: Redis,
    private readonly politica: PoliticaReintentos,
    private readonly alFallar: (error: Error) => void,
  ) {}

  /** Un trabajo que llegue a Redis después del tiempo máximo no se duplica: el relay lo vuelve a encolar con el mismo `jobId`. */
  encolar(entregas: EntregaEncolada[]): Promise<void> {
    return conTiempoMaximo(this.agregar(entregas));
  }

  async cerrar(): Promise<void> {
    await Promise.all([...this.colas.values()].map((cola) => cola.close()));
    this.colas.clear();
  }

  private async agregar(entregas: EntregaEncolada[]): Promise<void> {
    await Promise.all(
      [...agruparPorConsumidor(entregas)].map(([consumidor, delConsumidor]) =>
        this.cola(consumidor).addBulk(
          delConsumidor.map(({ evento, idTrabajo }) => ({ name: evento.eventType, data: evento, opts: opcionesDeTrabajo(this.politica, idTrabajo) })),
        ),
      ),
    );
  }

  private cola(consumidor: string): Queue<EventoEntregado> {
    const existente = this.colas.get(consumidor);
    if (existente) return existente;
    const cola = new Queue<EventoEntregado>(NombreConsumidor.de(consumidor).cola, { connection: this.conexion });
    cola.on('error', this.alFallar);
    this.colas.set(consumidor, cola);
    return cola;
  }
}

async function conTiempoMaximo(operacion: Promise<void>): Promise<void> {
  let temporizador: NodeJS.Timeout | undefined;
  const vencimiento = new Promise<never>((_resolver, rechazar) => {
    temporizador = setTimeout(() => rechazar(new RedisSinRespuestaError()), TIEMPO_MAXIMO_ENCOLAR_MS);
  });
  try {
    await Promise.race([operacion, vencimiento]);
  } finally {
    clearTimeout(temporizador);
  }
}

function agruparPorConsumidor(entregas: EntregaEncolada[]): Map<string, EntregaEncolada[]> {
  const grupos = new Map<string, EntregaEncolada[]>();
  for (const entrega of entregas) grupos.set(entrega.consumidor, [...(grupos.get(entrega.consumidor) ?? []), entrega]);
  return grupos;
}
