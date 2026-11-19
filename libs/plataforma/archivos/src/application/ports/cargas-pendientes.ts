export interface CargaPendiente {
  tenantId: string;
  archivoId: string;
}

/** Una versión nueva (número mayor que 1) que nadie confirmó. */
export interface VersionPendiente extends CargaPendiente {
  numero: number;
}

/** Pendientes de todos los tenants, para la limpieza diaria. Solo ids: el borrado va con el contexto de cada tenant. */
export interface CargasPendientes {
  /** Archivos `PENDIENTE_CARGA` creados antes de `antes`, del más antiguo al más reciente, hasta `limite`. */
  listarVencidas(antes: Date, limite: number): Promise<CargaPendiente[]>;
  /** Versiones nuevas `PENDIENTE_CARGA` pedidas antes de `antes`, de la más antigua a la más reciente, hasta `limite`. */
  listarVersionesVencidas(antes: Date, limite: number): Promise<VersionPendiente[]>;
}
