import type { EmisorPendienteDeAviso } from '../../application/ports/repositorio-avisos-certificado.js';

// SQL crudo (regla 11): función SECURITY DEFINER que lee los emisores de todos los tenants sin depender de
// app.tenant_id. El ORM no llama funciones que devuelven filas.
const CERTIFICADOS_CON_AVISO_PENDIENTE =
  'SELECT tenant_id, emisor_id FROM fe.certificados_con_aviso_pendiente($1::timestamptz, $2::uuid, $3::integer)';

/** Lo único que usa del DataSource. */
export interface EjecutorSql {
  query(consulta: string, parametros: unknown[]): Promise<unknown>;
}

interface FilaPendiente {
  tenant_id: string;
  emisor_id: string;
}

/** Fuera de toda transacción: el aviso abre después la suya por tenant, con su contexto. */
export class CertificadosConAvisoPendienteSql {
  constructor(private readonly dataSource: EjecutorSql) {}

  async listar(hasta: Date, despuesDe: string, limite: number): Promise<EmisorPendienteDeAviso[]> {
    const filas = (await this.dataSource.query(CERTIFICADOS_CON_AVISO_PENDIENTE, [hasta, despuesDe, limite])) as FilaPendiente[];
    return filas.map((fila) => ({ tenantId: fila.tenant_id, emisorId: fila.emisor_id }));
  }
}
