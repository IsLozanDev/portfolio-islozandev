import type { TenantContext } from '@vitrina/plataforma/kernel';
import type { TypeOrmUnitOfWork } from '@vitrina/plataforma/kernel-infra';
import type { LecturaOutbox } from '../../application/ports/repositorios.js';
import type { EventoEntregado } from '../../domain/evento-entregado.js';
import { OutboxEntidad } from './entidades.js';
import { eventoDesdeOutbox } from './mapeo.js';

/** Con la RLS del tenant, en la transacción activa. Filtra por tenant además de la RLS (regla 3). */
export class LecturaOutboxTypeOrm implements LecturaOutbox {
  constructor(
    private readonly unidadDeTrabajo: TypeOrmUnitOfWork,
    private readonly contexto: TenantContext,
  ) {}

  async buscar(eventId: string): Promise<EventoEntregado | null> {
    const fila = await this.unidadDeTrabajo.manager.getRepository(OutboxEntidad).findOneBy({ eventId, tenantId: this.contexto.current().tenantId });
    return fila && eventoDesdeOutbox(fila);
  }
}
