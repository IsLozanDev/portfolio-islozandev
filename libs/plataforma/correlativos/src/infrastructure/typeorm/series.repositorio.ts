import { ConflictError, type TenantContext } from '@vitrina/plataforma/kernel';
import type { TypeOrmUnitOfWork } from '@vitrina/plataforma/kernel-infra';
import { QueryFailedError, type Repository } from 'typeorm';
import type { RepositorioSeries } from '../../application/ports/repositorios.js';
import { SerieDuplicadaError } from '../../domain/errores.js';
import type { Serie } from '../../domain/serie.js';
import { SerieEntidad, type FilaSerie } from './entidades.js';
import { filaDesdeSerie, serieDesdeFila } from './mapeo.js';

const VIOLACION_UNICIDAD = '23505';
const RESTRICCION_SERIE_UNICA = 'ux_serie';
const MENSAJE_CONCURRENCIA = 'La serie fue modificada por otra operación; vuelva a cargarla';

/** Series del tenant del contexto, dentro de la transacción activa. Filtra por tenant además de la RLS (regla 3). */
export class SeriesRepositorioTypeOrm implements RepositorioSeries {
  /** Versión con la que se leyó cada agregado: el UPDATE la exige (bloqueo optimista). */
  private readonly versionesLeidas = new WeakMap<Serie, number>();

  constructor(
    private readonly unidadDeTrabajo: TypeOrmUnitOfWork,
    private readonly contexto: TenantContext,
  ) {}

  async buscar(id: string): Promise<Serie | null> {
    const fila = await this.series().findOneBy({ id, tenantId: this.tenantId() });
    if (!fila) return null;
    const serie = serieDesdeFila(fila);
    this.versionesLeidas.set(serie, serie.version);
    return serie;
  }

  async insertar(serie: Serie): Promise<void> {
    try {
      await this.series().insert(filaDesdeSerie(serie));
    } catch (error) {
      if (esSerieRepetida(error)) throw new SerieDuplicadaError(serie.tipo, serie.codigo);
      throw error;
    }
    this.versionesLeidas.set(serie, serie.version);
  }

  async guardarEstado(serie: Serie): Promise<void> {
    const versionLeida = this.versionesLeidas.get(serie);
    if (versionLeida === undefined) throw new ConflictError('Solo se guarda una serie leída en esta operación');
    if (versionLeida === serie.version) return;
    const { activa, version, modificadoPor, modificadoEn } = filaDesdeSerie(serie);
    const resultado = await this.series().update(
      { id: serie.id, tenantId: this.tenantId(), version: String(versionLeida) },
      { activa, version, modificadoPor, modificadoEn },
    );
    if (resultado.affected === 0) throw new ConflictError(MENSAJE_CONCURRENCIA);
    this.versionesLeidas.set(serie, serie.version);
  }

  private series(): Repository<FilaSerie> {
    return this.unidadDeTrabajo.manager.getRepository(SerieEntidad);
  }

  private tenantId(): string {
    return this.contexto.current().tenantId;
  }
}

function esSerieRepetida(error: unknown): boolean {
  if (!(error instanceof QueryFailedError)) return false;
  const { code, constraint } = error.driverError as { code?: string; constraint?: string };
  return code === VIOLACION_UNICIDAD && constraint === RESTRICCION_SERIE_UNICA;
}
