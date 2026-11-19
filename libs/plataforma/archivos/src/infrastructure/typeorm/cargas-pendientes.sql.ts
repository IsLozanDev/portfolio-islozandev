import type { CargaPendiente, CargasPendientes, VersionPendiente } from '../../application/ports/cargas-pendientes.js';

// SQL crudo (regla 11): funciones SECURITY DEFINER que leen los pendientes de todos los tenants sin depender
// de app.tenant_id. El ORM no llama funciones que devuelven filas.
const CARGAS_VENCIDAS = 'SELECT tenant_id, archivo_id FROM arc.cargas_pendientes_vencidas($1::timestamptz, $2::integer)';
const VERSIONES_VENCIDAS = 'SELECT tenant_id, archivo_id, numero FROM arc.versiones_pendientes_vencidas($1::timestamptz, $2::integer)';

/** Lo único que usa del DataSource. */
export interface EjecutorSql {
  query(consulta: string, parametros: unknown[]): Promise<unknown>;
}

interface FilaCargaVencida {
  tenant_id: string;
  archivo_id: string;
}

interface FilaVersionVencida extends FilaCargaVencida {
  numero: number;
}

/** Fuera de toda transacción: la limpieza abre después una por tenant. */
export class CargasPendientesSql implements CargasPendientes {
  constructor(private readonly dataSource: EjecutorSql) {}

  async listarVencidas(antes: Date, limite: number): Promise<CargaPendiente[]> {
    const filas = (await this.dataSource.query(CARGAS_VENCIDAS, [antes, limite])) as FilaCargaVencida[];
    return filas.map((fila) => ({ tenantId: fila.tenant_id, archivoId: fila.archivo_id }));
  }

  async listarVersionesVencidas(antes: Date, limite: number): Promise<VersionPendiente[]> {
    const filas = (await this.dataSource.query(VERSIONES_VENCIDAS, [antes, limite])) as FilaVersionVencida[];
    return filas.map((fila) => ({ tenantId: fila.tenant_id, archivoId: fila.archivo_id, numero: fila.numero }));
  }
}
