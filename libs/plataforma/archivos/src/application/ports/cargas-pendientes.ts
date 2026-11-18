export interface CargaPendiente {
  tenantId: string;
  archivoId: string;
}

/** Cargas `PENDIENTE_CARGA` de todos los tenants, para la limpieza diaria. Solo ids: el borrado va con el contexto de cada tenant. */
export interface CargasPendientes {
  /** Las creadas antes de `antes`, de la más antigua a la más reciente, hasta `limite`. */
  listarVencidas(antes: Date, limite: number): Promise<CargaPendiente[]>;
}
