import type { TenantsActivos } from '@vitrina/plataforma/identidad';

// Función SECURITY DEFINER de la consola (spec 17a): lee todos los tenants sin depender de app.tenant_id.
const LISTAR_TENANTS = 'SELECT id FROM org.tenants_listar($1, $2, $3, $4, $5)';
const ESTADO_ACTIVO = 'ACTIVO';
const TAMANO_PAGINA = 200;

/** Lo único que usa del DataSource. */
export interface EjecutorSql {
  query(consulta: string, parametros: unknown[]): Promise<unknown>;
}

/** Tenants ACTIVO, por páginas: la tarea mensual de cuotas no carga todos a la vez. Fuera de toda transacción. */
export class TenantsActivosOrg implements TenantsActivos {
  constructor(private readonly dataSource: EjecutorSql) {}

  async *listar(): AsyncIterable<string> {
    for (let desplazamiento = 0; ; desplazamiento += TAMANO_PAGINA) {
      const pagina = (await this.dataSource.query(LISTAR_TENANTS, [null, ESTADO_ACTIVO, null, TAMANO_PAGINA, desplazamiento])) as { id: string }[];
      for (const { id } of pagina) yield id;
      if (pagina.length < TAMANO_PAGINA) return;
    }
  }
}
