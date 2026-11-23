import type { LocalizadorMensajes } from '../../application/ports/repositorios.js';

// SQL crudo (regla 11): función SECURITY DEFINER que ubica el mensaje en cualquier tenant sin depender de
// app.tenant_id. El ORM no llama funciones que devuelven filas.
const MENSAJE_POR_ID_EXTERNO = 'SELECT id, tenant_id FROM ntf.mensaje_por_id_externo($1::varchar)';

/** Lo único que usa del DataSource. */
export interface EjecutorSql {
  query(consulta: string, parametros: unknown[]): Promise<unknown>;
}

interface FilaUbicada {
  id: string;
  tenant_id: string;
}

/** Fuera de toda transacción: el webhook llega sin tenant y después abre una con el contexto del mensaje. */
export class MensajePorIdExternoSql implements LocalizadorMensajes {
  constructor(private readonly dataSource: EjecutorSql) {}

  async porIdExterno(idExterno: string): Promise<{ mensajeId: string; tenantId: string } | null> {
    const [fila] = (await this.dataSource.query(MENSAJE_POR_ID_EXTERNO, [idExterno])) as FilaUbicada[];
    return fila ? { mensajeId: fila.id, tenantId: fila.tenant_id } : null;
  }
}
