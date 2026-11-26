import type { TenantContext } from '@vitrina/plataforma/kernel';
import type { TypeOrmUnitOfWork } from '@vitrina/plataforma/kernel-infra';
import type { EntityManager } from 'typeorm';
import type { RepositorioEnvios } from '../../application/ports/repositorio-envios.js';
import type { IntentoEnvio } from '../../domain/envio/intento-envio.js';
import { EnvioEntidad } from './entidades-comprobante.js';

const PRIMER_INTENTO = 1;

/** fe.envio sobre el EntityManager de la transacción activa; filtra por tenant además de la RLS. */
export class RepositorioEnviosTypeOrm implements RepositorioEnvios {
  constructor(
    private readonly unidadDeTrabajo: TypeOrmUnitOfWork,
    private readonly contexto: TenantContext,
  ) {}

  /** Dos envíos del mismo comprobante a la vez chocan en uq_envio_intento: el que pierde revierte y se reintenta. */
  async siguienteIntento(comprobanteId: string): Promise<number> {
    const fila = await this.manager
      .getRepository(EnvioEntidad)
      .createQueryBuilder('envio')
      .select('MAX(envio.intento)', 'ultimo')
      .where('envio.comprobante_id = :comprobanteId AND envio.tenant_id = :tenantId', { comprobanteId, tenantId: this.contexto.current().tenantId })
      .getRawOne<{ ultimo: number | null }>();
    return (fila?.ultimo ?? 0) + PRIMER_INTENTO;
  }

  async registrar(intento: IntentoEnvio): Promise<void> {
    await this.manager.getRepository(EnvioEntidad).insert(intento);
  }

  private get manager(): EntityManager {
    return this.unidadDeTrabajo.manager;
  }
}
