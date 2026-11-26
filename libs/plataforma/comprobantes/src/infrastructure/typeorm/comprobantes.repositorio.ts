import type { TypeOrmUnitOfWork } from '@vitrina/plataforma/kernel-infra';
import { ConflictError, type TenantContext } from '@vitrina/plataforma/kernel';
import { QueryFailedError, type EntityManager, type FindOptionsWhere } from 'typeorm';
import type { RepositorioComprobantes } from '../../application/ports/repositorio-comprobantes.js';
import type { Comprobante } from '../../domain/comprobante/comprobante.js';
import { EmisionConcurrenteError } from '../../domain/errores.js';
import { ComprobanteEntidad, CuotaComprobanteEntidad, LineaComprobanteEntidad, type FilaComprobante } from './entidades-comprobante.js';
import { cambiosDeRespuesta, comprobanteDesdeFilas, filaDesdeComprobante, filasDeCuotas, filasDeLineas } from './mapeo-comprobante.js';

const VIOLACION_UNICA = '23505';
const RESTRICCION_IDEMPOTENCIA = 'uq_comprobante_idempotencia';

interface ErrorDelDriver {
  code?: string;
  constraint?: string;
}

function esClaveRepetida(error: unknown): boolean {
  if (!(error instanceof QueryFailedError)) return false;
  const { code, constraint } = (error.driverError ?? {}) as ErrorDelDriver;
  return code === VIOLACION_UNICA && constraint === RESTRICCION_IDEMPOTENCIA;
}

/** fe.comprobante, sus líneas y cuotas sobre el EntityManager de la transacción activa; filtra por tenant además de la RLS. */
export class RepositorioComprobantesTypeOrm implements RepositorioComprobantes {
  constructor(
    private readonly unidadDeTrabajo: TypeOrmUnitOfWork,
    private readonly contexto: TenantContext,
  ) {}

  porClave(claveIdempotencia: string): Promise<Comprobante | null> {
    return this.buscarDelTenant({ claveIdempotencia });
  }

  porId(comprobanteId: string): Promise<Comprobante | null> {
    return this.buscarDelTenant({ id: comprobanteId });
  }

  async guardar(comprobante: Comprobante): Promise<void> {
    try {
      await this.manager.getRepository(ComprobanteEntidad).insert(filaDesdeComprobante(comprobante));
    } catch (error) {
      if (esClaveRepetida(error)) throw new EmisionConcurrenteError();
      throw error;
    }
    await this.manager.getRepository(LineaComprobanteEntidad).insert(filasDeLineas(comprobante));
    const cuotas = filasDeCuotas(comprobante);
    if (cuotas.length > 0) await this.manager.getRepository(CuotaComprobanteEntidad).insert(cuotas);
  }

  /** Bloqueo optimista: el UPDATE filtra por la versión leída. */
  async actualizarRespuesta(comprobante: Comprobante, versionEsperada: number): Promise<void> {
    const tenantId = this.contexto.current().tenantId;
    const resultado = await this.manager
      .getRepository(ComprobanteEntidad)
      .update({ id: comprobante.id, tenantId, version: versionEsperada }, cambiosDeRespuesta(comprobante));
    if (resultado.affected !== 1) throw new ConflictError('Otro envío cambió el comprobante; se reintenta');
  }

  private async buscarDelTenant(criterio: FindOptionsWhere<FilaComprobante>): Promise<Comprobante | null> {
    const tenantId = this.contexto.current().tenantId;
    const fila = await this.manager.getRepository(ComprobanteEntidad).findOneBy({ ...criterio, tenantId });
    if (!fila) return null;
    const delComprobante = { comprobanteId: fila.id, tenantId };
    const lineas = await this.manager.getRepository(LineaComprobanteEntidad).findBy(delComprobante);
    const cuotas = await this.manager.getRepository(CuotaComprobanteEntidad).findBy(delComprobante);
    return comprobanteDesdeFilas(fila, lineas, cuotas);
  }

  private get manager(): EntityManager {
    return this.unidadDeTrabajo.manager;
  }
}
