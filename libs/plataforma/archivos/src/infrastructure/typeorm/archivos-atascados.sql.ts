import type { ArchivosAtascados } from '../../application/ports/archivos-atascados.js';
import type { TrabajoAnalisis } from '../../application/ports/cola-analisis.js';
import type { EjecutorSql } from './cargas-pendientes.sql.js';

// SQL crudo (regla 11): función SECURITY DEFINER que lee los archivos y las versiones en análisis de todos
// los tenants sin depender de app.tenant_id. El ORM no llama funciones que devuelven filas.
const ARCHIVOS_ATASCADOS = 'SELECT tenant_id, archivo_id, numero FROM arc.archivos_en_analisis_atascados($1::timestamptz, $2::integer)';

interface FilaArchivoAtascado {
  tenant_id: string;
  archivo_id: string;
  numero: number;
}

/** Fuera de toda transacción: el barrido solo encola; el análisis abre después la suya por tenant. */
export class ArchivosAtascadosSql implements ArchivosAtascados {
  constructor(private readonly dataSource: EjecutorSql) {}

  async listarEnAnalisisAntesDe(antes: Date, limite: number): Promise<TrabajoAnalisis[]> {
    const filas = (await this.dataSource.query(ARCHIVOS_ATASCADOS, [antes, limite])) as FilaArchivoAtascado[];
    return filas.map((fila) => ({ tenantId: fila.tenant_id, archivoId: fila.archivo_id, numero: fila.numero }));
  }
}
