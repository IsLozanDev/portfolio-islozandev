import { ConflictError, type TenantContext } from '@vitrina/plataforma/kernel';
import type { TypeOrmUnitOfWork } from '@vitrina/plataforma/kernel-infra';
import { In, QueryFailedError, type Repository } from 'typeorm';
import type { RepositorioAccesosSoporte } from '../../application/ports/acceso-soporte.repositorio.js';
import { AccesoSoporte, type EstadoSoporte } from '../../domain/acceso-soporte.js';
import { SoporteAbiertoExistenteError } from '../../domain/errores.js';
import { AccesoSoporteEntidad, type FilaAccesoSoporte } from './entidades-soporte.js';

const VIOLACION_UNICIDAD = '23505';
const RESTRICCION_SOPORTE_ABIERTO = 'ux_soporte_abierto';
const ESTADOS_ABIERTOS: EstadoSoporte[] = ['PENDIENTE', 'APROBADO'];
const MENSAJE_CONCURRENCIA = 'El acceso de soporte fue modificado por otra operación; vuelva a cargarlo';

/** Accesos de soporte del tenant del contexto, en la transacción activa. Filtra por tenant además de la RLS (regla 3). */
export class AccesoSoporteRepositorioTypeOrm implements RepositorioAccesosSoporte {
  /** Versión con la que se leyó o insertó cada agregado: el UPDATE la exige (bloqueo optimista). */
  private readonly versionesLeidas = new WeakMap<AccesoSoporte, number>();

  constructor(
    private readonly unidadDeTrabajo: TypeOrmUnitOfWork,
    private readonly contexto: TenantContext,
  ) {}

  async buscar(id: string): Promise<AccesoSoporte | null> {
    const fila = await this.accesos().findOneBy({ id, tenantId: this.tenantId() });
    return fila ? this.recordar(accesoDesdeFila(fila)) : null;
  }

  async abiertoDe(agenteId: string): Promise<AccesoSoporte | null> {
    const fila = await this.accesos().findOneBy({ tenantId: this.tenantId(), agenteId, estado: In(ESTADOS_ABIERTOS) });
    return fila ? this.recordar(accesoDesdeFila(fila)) : null;
  }

  async abiertosPorTicket(ticket: string): Promise<AccesoSoporte[]> {
    const filas = await this.accesos().find({
      where: { tenantId: this.tenantId(), ticket, estado: In(ESTADOS_ABIERTOS) },
      order: { solicitadoEn: 'ASC', id: 'ASC' },
    });
    return filas.map((fila) => this.recordar(accesoDesdeFila(fila)));
  }

  async guardar(acceso: AccesoSoporte): Promise<void> {
    const versionLeida = this.versionesLeidas.get(acceso);
    if (versionLeida === undefined) {
      await this.insertar(acceso);
      return;
    }
    if (versionLeida === acceso.version) return;
    const { id, tenantId, agenteId, ticket, motivo, modo, horasSolicitadas, solicitadoEn, caducaEn, ...cambios } = filaDesdeAcceso(acceso);
    const resultado = await this.accesos().update({ id, tenantId: this.tenantId(), version: String(versionLeida) }, cambios);
    if (resultado.affected === 0) throw new ConflictError(MENSAJE_CONCURRENCIA);
    this.versionesLeidas.set(acceso, acceso.version);
  }

  private async insertar(acceso: AccesoSoporte): Promise<void> {
    try {
      await this.accesos().insert(filaDesdeAcceso(acceso));
    } catch (error) {
      if (esSoporteAbiertoRepetido(error)) throw new SoporteAbiertoExistenteError();
      throw error;
    }
    this.versionesLeidas.set(acceso, acceso.version);
  }

  private recordar(acceso: AccesoSoporte): AccesoSoporte {
    this.versionesLeidas.set(acceso, acceso.version);
    return acceso;
  }

  private accesos(): Repository<FilaAccesoSoporte> {
    return this.unidadDeTrabajo.manager.getRepository(AccesoSoporteEntidad);
  }

  private tenantId(): string {
    return this.contexto.current().tenantId;
  }
}

function accesoDesdeFila(fila: FilaAccesoSoporte): AccesoSoporte {
  const { id, version, ...props } = fila;
  return AccesoSoporte.reconstituir(id, Number(version), props);
}

function filaDesdeAcceso(acceso: AccesoSoporte): FilaAccesoSoporte {
  return {
    id: acceso.id,
    tenantId: acceso.tenantId,
    agenteId: acceso.agenteId,
    ticket: acceso.ticket,
    motivo: acceso.motivo,
    modo: acceso.modo,
    horasSolicitadas: acceso.horasSolicitadas,
    estado: acceso.estado,
    solicitadoEn: acceso.solicitadoEn,
    caducaEn: acceso.caducaEn,
    aprobadoPor: acceso.aprobadoPor,
    horasAprobadas: acceso.horasAprobadas,
    desde: acceso.desde,
    hasta: acceso.hasta,
    membresiaId: acceso.membresiaId,
    asignacionId: acceso.asignacionId,
    cerradoPor: acceso.cerradoPor,
    cerradoEn: acceso.cerradoEn,
    motivoCierre: acceso.motivoCierre,
    causaCierre: acceso.causaCierre,
    version: String(acceso.version),
  };
}

function esSoporteAbiertoRepetido(error: unknown): boolean {
  if (!(error instanceof QueryFailedError)) return false;
  const { code, constraint } = error.driverError as { code?: string; constraint?: string };
  return code === VIOLACION_UNICIDAD && constraint === RESTRICCION_SOPORTE_ABIERTO;
}
