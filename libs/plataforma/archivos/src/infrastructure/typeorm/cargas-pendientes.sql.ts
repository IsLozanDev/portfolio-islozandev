import type { CargaPendiente, CargasPendientes } from '../../application/ports/cargas-pendientes.js';

// SQL crudo (regla 11): función SECURITY DEFINER que lee los pendientes de todos los tenants sin depender
// de app.tenant_id. El ORM no llama funciones que devuelven filas.
const CARGAS_VENCIDAS = 'SELECT tenant_id, archivo_id FROM arc.cargas_pendientes_vencidas($1::timestamptz, $2::integer)';

/** Lo único que usa del DataSource. */
export interface EjecutorSql {
  query(consulta: string, parametros: unknown[]): Promise<unknown>;
}

interface FilaCargaVencida {
  tenant_id: string;
  archivo_id: string;
}

/** Fuera de toda transacción: la limpieza abre después una por tenant. */
export class CargasPendientesSql implements CargasPendientes {
  constructor(private readonly dataSource: EjecutorSql) {}

  async listarVencidas(antes: Date, limite: number): Promise<CargaPendiente[]> {
    const filas = (await this.dataSource.query(CARGAS_VENCIDAS, [antes, limite])) as FilaCargaVencida[];
    return filas.map((fila) => ({ tenantId: fila.tenant_id, archivoId: fila.archivo_id }));
  }
}
