/** Los tenants de todos con su clave envuelta por una maestra distinta de la activa. Fuera de toda transacción. */
export interface TenantsPorReenvolver {
  listar(versionActiva: number, limite: number): Promise<string[]>;
}
