import type { AggregateRoot, EventPublisher } from '@vitrina/plataforma/kernel';

/** Va dentro de UnitOfWork.run, después de guardar: los eventos entran al outbox en la misma transacción. */
export async function publicarEventos(publicador: EventPublisher, agregado: AggregateRoot): Promise<void> {
  for (const evento of agregado.pullEvents()) await publicador.publish(evento);
}
