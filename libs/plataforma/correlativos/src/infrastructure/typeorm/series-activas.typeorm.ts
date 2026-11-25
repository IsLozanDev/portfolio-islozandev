import type { TenantContext } from '@vitrina/plataforma/kernel';
import type { TypeOrmUnitOfWork } from '@vitrina/plataforma/kernel-infra';
import type { SeriesActivasPort } from '../../application/ports/series-activas.port.js';
import type { TipoDocumento } from '../../domain/tipos.js';
import { SerieEntidad } from './entidades.js';

/** seq.serie en la transacción activa. Filtra por el tenant del contexto además de la RLS (regla 3). */
export class SeriesActivasTypeOrm implements SeriesActivasPort {
  constructor(
    private readonly unidadDeTrabajo: TypeOrmUnitOfWork,
    private readonly contexto: TenantContext,
  ) {}

  deSucursal(sucursalId: string, tipo: TipoDocumento): Promise<string[]> {
    return this.unidadDeTrabajo.run(async () => {
      const series = await this.unidadDeTrabajo.manager.getRepository(SerieEntidad).find({
        select: { serie: true },
        where: { tenantId: this.contexto.current().tenantId, sucursalId, tipo, activa: true },
        order: { serie: 'ASC' },
      });
      return series.map((fila) => fila.serie);
    });
  }
}
