import type { ProductoCodigo } from '@vitrina/plataforma/org';
import type { DependenciasPersonas } from './dependencias-personas.js';

/** Productos que el tenant puede usar para asignar roles (TR-RN-006): la UI no ofrece los que la API rechazaría. */
export class ListarProductosSuscritos {
  constructor(private readonly dependencias: Pick<DependenciasPersonas, 'unidadDeTrabajo' | 'suscripciones'>) {}

  ejecutar(): Promise<ProductoCodigo[]> {
    const { unidadDeTrabajo, suscripciones } = this.dependencias;
    return unidadDeTrabajo.run(() => suscripciones.listarVigentes());
  }
}
