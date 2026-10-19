import type { PermisosRepositorio } from '../application/ports/permisos.port.js';

/** Mínimo que se necesita de la conexión (TypeORM DataSource, pg Pool, etc.). */
export interface EjecutorSql {
  query<T = Record<string, unknown>>(sql: string, parametros: unknown[]): Promise<T[]>;
}

/** Lee permisos con las funciones SQL de seg (01b_seg.sql). */
export class PermisosSqlRepositorio implements PermisosRepositorio {
  constructor(private readonly db: EjecutorSql) {}
  async permisosEfectivos(usuarioId: string, tenantId: string, sucursalId: string) {
    const filas = await this.db.query<{ permiso_codigo: string }>(
      'SELECT permiso_codigo FROM seg.permisos_efectivos($1, $2, $3)', [usuarioId, tenantId, sucursalId]);
    return filas.map((f) => f.permiso_codigo);
  }
  async sucursalesAccesibles(usuarioId: string, tenantId: string) {
    const filas = await this.db.query<{ sucursal_id: string }>(
      'SELECT sucursal_id FROM seg.sucursales_accesibles($1, $2)', [usuarioId, tenantId]);
    return filas.map((f) => f.sucursal_id);
  }
}
