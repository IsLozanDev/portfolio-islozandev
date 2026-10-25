import type { TypeOrmUnitOfWork } from '@vitrina/plataforma/kernel-infra';
import type { RegistroProcesados } from '../../application/ports/repositorios.js';
import type { EventoEntregado } from '../../domain/evento-entregado.js';
import { EventoProcesadoEntidad } from './entidades.js';

export class RegistroProcesadosTypeOrm implements RegistroProcesados {
  constructor(private readonly unidadDeTrabajo: TypeOrmUnitOfWork) {}

  /** ON CONFLICT DO NOTHING: sin fila devuelta, el consumidor ya lo había procesado. */
  async registrar(consumidor: string, evento: EventoEntregado): Promise<boolean> {
    const resultado = await this.unidadDeTrabajo.manager
      .createQueryBuilder()
      .insert()
      .into(EventoProcesadoEntidad)
      .values({ consumidor, eventId: evento.eventId, tenantId: evento.tenantId })
      .orIgnore()
      .returning('event_id')
      .execute();
    return (resultado.raw as unknown[]).length > 0;
  }
}
