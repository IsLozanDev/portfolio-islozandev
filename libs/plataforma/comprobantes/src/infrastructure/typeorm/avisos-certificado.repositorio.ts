import type { TypeOrmUnitOfWork } from '@vitrina/plataforma/kernel-infra';
import type { EmisorPendienteDeAviso, RepositorioAvisosCertificado } from '../../application/ports/repositorio-avisos-certificado.js';
import type { AvisoCertificado } from '../../domain/aviso-certificado.js';
import type { CertificadosConAvisoPendienteSql } from './certificados-con-aviso-pendiente.sql.js';
import { AvisoCertificadoEntidad } from './entidades.js';
import { filaDesdeAviso } from './mapeo.js';

/** El registro va con la RLS del tenant de la transacción; la lectura de pendientes cruza tenants. */
export class RepositorioAvisosCertificadoTypeOrm implements RepositorioAvisosCertificado {
  constructor(
    private readonly unidadDeTrabajo: TypeOrmUnitOfWork,
    private readonly pendientesSql: Pick<CertificadosConAvisoPendienteSql, 'listar'>,
  ) {}

  /** ON CONFLICT DO NOTHING sobre uq_aviso_certificado: una corrida concurrente deja una sola fila. */
  async registrar(aviso: AvisoCertificado): Promise<boolean> {
    const resultado = await this.unidadDeTrabajo.manager
      .createQueryBuilder()
      .insert()
      .into(AvisoCertificadoEntidad)
      .values(filaDesdeAviso(aviso))
      .orIgnore()
      .returning(['id'])
      .execute();
    return (resultado.raw as unknown[]).length === 1;
  }

  pendientes(hasta: Date, despuesDe: string, limite: number): Promise<EmisorPendienteDeAviso[]> {
    return this.pendientesSql.listar(hasta, despuesDe, limite);
  }
}
