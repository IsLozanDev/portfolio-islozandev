import type { CategoriaArchivo } from '../domain/categoria.js';
import type { DependenciasArchivos } from './dependencias-archivos.js';

/** Las categorías con sus MIME y su tamaño máximo, para validar en el front antes de pedir la carga. La API sigue decidiendo. */
export class ListarCategorias {
  constructor(private readonly dependencias: Pick<DependenciasArchivos, 'unidadDeTrabajo' | 'archivos'>) {}

  ejecutar(): Promise<CategoriaArchivo[]> {
    const { unidadDeTrabajo, archivos } = this.dependencias;
    return unidadDeTrabajo.run(() => archivos.listarCategorias());
  }
}
