import type { UnitOfWork } from '@vitrina/plataforma/kernel';
import type { RepositorioCatalogos } from './ports/repositorios.js';
import { definicionDe, type DefinicionCatalogo } from './resultados.js';

export interface DependenciasListarCatalogos {
  unidadDeTrabajo: UnitOfWork;
  catalogos: Pick<RepositorioCatalogos, 'listar'>;
}

/** Definiciones de todos los catálogos, sin ítems. Las ve cualquier tenant con `plat.catalogo.leer`. */
export class ListarCatalogos {
  constructor(private readonly dependencias: DependenciasListarCatalogos) {}

  ejecutar(): Promise<DefinicionCatalogo[]> {
    const { unidadDeTrabajo, catalogos } = this.dependencias;
    return unidadDeTrabajo.run(async () => (await catalogos.listar()).map((catalogo) => definicionDe(catalogo, catalogo.version)));
  }
}
