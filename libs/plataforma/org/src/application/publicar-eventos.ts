import type { AggregateRoot, EventPublisher } from '@vitrina/plataforma/kernel';

/** Va dentro de UnitOfWork.run, después de guardar: los eventos entran al outbox en la misma transacción. */
export async function publicarEventos(publisher: EventPublisher, ...agregados: AggregateRoot[]): Promise<void> {
  for (const agregado of agregados) {
    for (const evento of agregado.pullEvents()) await publisher.publish(evento);
  }
}
