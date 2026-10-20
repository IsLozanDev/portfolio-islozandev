import { ConflictError, type AggregateRoot, type TenantContext } from '@vitrina/plataforma/kernel';
import type { TypeOrmUnitOfWork } from '@vitrina/plataforma/kernel-infra';

const UNIQUE_VIOLATION = '23505';

/**
 * SQL sobre el EntityManager de la transacción activa. Filtra por el tenant del contexto además
 * de la RLS (doble barrera, regla 3) y lleva la versión leída de cada agregado para el bloqueo
 * optimista: un agregado que no salió de este repositorio se considera nuevo.
 */
export abstract class RepositorioBase<A extends AggregateRoot> {
  private readonly leidas = new WeakMap<A, number>();

  protected constructor(
    private readonly uow: TypeOrmUnitOfWork,
    private readonly tenants: TenantContext,
    private readonly duplicados: Readonly<Record<string, string>> = {},
  ) {}

  protected get tenantId(): string {
    return this.tenants.current().tenantId;
  }

  protected async consultar<F>(sql: string, params: unknown[]): Promise<F[]> {
    try {
      return await this.uow.manager.query(sql, params);
    } catch (error) {
      throw this.traducir(error);
    }
  }

  protected leido(agregado: A): A {
    this.leidas.set(agregado, agregado.version);
    return agregado;
  }

  protected async persistir(agregado: A, insertar: () => Promise<void>, actualizar: (previa: number) => Promise<number>): Promise<void> {
    const previa = this.leidas.get(agregado);
    if (previa === undefined) {
      await insertar();
    } else if (previa !== agregado.version && (await actualizar(previa)) === 0) {
      throw new ConflictError('El registro fue modificado por otra operación; vuelva a cargarlo');
    }
    this.leidas.set(agregado, agregado.version);
  }

  /** UPDATE con `WHERE version = $previa`, envuelto para leer cuántas filas cambió. */
  protected async actualizarFilas(update: string, params: unknown[]): Promise<number> {
    const [{ n }] = await this.consultar<{ n: number }>(`WITH u AS (${update} RETURNING 1) SELECT count(*)::int AS n FROM u`, params);
    return n;
  }

  private traducir(error: unknown): unknown {
    const pg = (error as { driverError?: { code?: string; constraint?: string } }).driverError;
    const mensaje = pg?.code === UNIQUE_VIOLATION && pg.constraint ? this.duplicados[pg.constraint] : undefined;
    return mensaje ? new ConflictError(mensaje) : error;
  }
}
