import { ConflictError, type TenantContext } from '@vitrina/plataforma/kernel';
import type { TypeOrmUnitOfWork } from '@vitrina/plataforma/kernel-infra';
import type { FindOptionsWhere, Repository } from 'typeorm';
import type { RepositorioFallidos } from '../../application/ports/repositorios.js';
import type { EventoFallido } from '../../domain/evento-fallido.js';
import { EventoFallidoEntidad, type FilaEventoFallido } from './entidades.js';
import { fallidoDesdeFila, filaDesdeFallido } from './mapeo.js';

const VERSION_INICIAL = 0;
const MENSAJE_CONCURRENCIA = 'El evento fallido fue modificado por otra operación; vuelva a cargarlo';

/** Fallidos del tenant del contexto, dentro de la transacción activa. Filtra por tenant además de la RLS (regla 3). */
export class FallidosRepositorioTypeOrm implements RepositorioFallidos {
  /** Versión con la que se leyó cada agregado: el UPDATE la exige (bloqueo optimista). */
  private readonly versionesLeidas = new WeakMap<EventoFallido, number>();

  constructor(
    private readonly unidadDeTrabajo: TypeOrmUnitOfWork,
    private readonly contexto: TenantContext,
  ) {}

  buscar(id: string): Promise<EventoFallido | null> {
    return this.leer({ id, tenantId: this.tenantId() });
  }

  buscarPorEvento(consumidor: string, eventId: string): Promise<EventoFallido | null> {
    return this.leer({ consumidor, eventId, tenantId: this.tenantId() });
  }

  async guardar(fallido: EventoFallido): Promise<void> {
    const versionLeida = this.versionesLeidas.get(fallido);
    if (versionLeida === undefined) {
      await this.fallidos().insert(filaDesdeFallido(fallido, VERSION_INICIAL));
      this.versionesLeidas.set(fallido, VERSION_INICIAL);
      return;
    }
    const versionNueva = versionLeida + 1;
    const { id, tenantId, ...cambios } = filaDesdeFallido(fallido, versionNueva);
    const resultado = await this.fallidos().update({ id, tenantId, version: String(versionLeida) }, cambios);
    if (resultado.affected === 0) throw new ConflictError(MENSAJE_CONCURRENCIA);
    this.versionesLeidas.set(fallido, versionNueva);
  }

  private async leer(criterio: FindOptionsWhere<FilaEventoFallido>): Promise<EventoFallido | null> {
    const fila = await this.fallidos().findOneBy(criterio);
    if (!fila) return null;
    const fallido = fallidoDesdeFila(fila);
    this.versionesLeidas.set(fallido, fallido.version);
    return fallido;
  }

  private fallidos(): Repository<FilaEventoFallido> {
    return this.unidadDeTrabajo.manager.getRepository(EventoFallidoEntidad);
  }

  private tenantId(): string {
    return this.contexto.current().tenantId;
  }
}
