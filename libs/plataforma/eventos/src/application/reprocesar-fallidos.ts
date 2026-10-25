import type { Clock, UnitOfWork } from '@vitrina/plataforma/kernel';
import type { Avisar } from './dependencias-entrega.js';
import type { ColaEventos, EntregaEncolada } from './ports/relay.js';
import type { LecturaOutbox, RepositorioFallidos } from './ports/repositorios.js';

/** NO_ENCONTRADO: no existe, es de otro tenant o su evento ya no está en el outbox. */
export type MotivoOmision = 'NO_ENCONTRADO' | 'NO_FALLIDO';

export interface ReprocesarFallidosComando {
  ids: string[];
  actorId: string;
}

export interface ResultadoReproceso {
  reprocesados: string[];
  omitidos: { id: string; motivo: MotivoOmision }[];
}

export interface DependenciasReproceso {
  unidadDeTrabajo: UnitOfWork;
  reloj: Clock;
  fallidos: RepositorioFallidos;
  outbox: LecturaOutbox;
  cola: ColaEventos;
  informar: Avisar;
}

/**
 * Vuelve a encolar fallidos del tenant (TR-RF-095). Se encola dentro de la transacción: si el worker toma
 * el trabajo antes del commit, su `marcarProcesado` espera el bloqueo de la fila; si Redis falla, nada cambia.
 */
export class ReprocesarFallidos {
  constructor(private readonly dependencias: DependenciasReproceso) {}

  ejecutar(comando: ReprocesarFallidosComando): Promise<ResultadoReproceso> {
    const { unidadDeTrabajo, cola, informar } = this.dependencias;
    return unidadDeTrabajo.run(async () => {
      const resultado: ResultadoReproceso = { reprocesados: [], omitidos: [] };
      const entregas: EntregaEncolada[] = [];
      for (const id of new Set(comando.ids)) {
        const preparada = await this.preparar(id, comando.actorId);
        if (typeof preparada === 'string') {
          resultado.omitidos.push({ id, motivo: preparada });
          continue;
        }
        entregas.push(preparada);
        resultado.reprocesados.push(id);
      }
      await cola.encolar(entregas);
      informar('Fallidos reprocesados', { reprocesados: resultado.reprocesados.length, omitidos: resultado.omitidos.length });
      return resultado;
    });
  }

  private async preparar(id: string, actorId: string): Promise<EntregaEncolada | MotivoOmision> {
    const { fallidos, outbox, reloj } = this.dependencias;
    const fallido = await fallidos.buscar(id);
    if (!fallido) return 'NO_ENCONTRADO';
    if (fallido.estado !== 'FALLIDO') return 'NO_FALLIDO';
    const evento = await outbox.buscar(fallido.eventId);
    if (!evento) return 'NO_ENCONTRADO';

    // Distinto del trabajo original, que sigue en la lista de fallidos de BullMQ, y de cada reproceso anterior.
    const idTrabajo = `${fallido.eventId}-r${fallido.version}`;
    fallido.iniciarReproceso(actorId, reloj.now());
    await fallidos.guardar(fallido);
    return { consumidor: fallido.consumidor, evento, idTrabajo };
  }
}
