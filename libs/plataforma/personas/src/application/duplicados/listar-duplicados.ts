import { PUNTAJE_MINIMO } from '../../domain/duplicados.js';
import type { DependenciasPersonas } from '../dependencias-personas.js';
import type { PaginaDuplicados } from '../ports/consulta-duplicados.js';

export const TAMANO_PAGINA_DUPLICADOS = { porDefecto: 20, maximo: 50 } as const;

export interface PedidoDuplicados {
  pagina: number;
  tamano: number;
}

/** TR-RF-042, paso 1: pares candidatos del tenant desde el puntaje mínimo, del mayor al menor. */
export class ListarDuplicados {
  constructor(private readonly dependencias: Pick<DependenciasPersonas, 'unidadDeTrabajo' | 'consultaDuplicados'>) {}

  ejecutar({ pagina, tamano }: PedidoDuplicados): Promise<PaginaDuplicados> {
    const { unidadDeTrabajo, consultaDuplicados } = this.dependencias;
    return unidadDeTrabajo.run(() => consultaDuplicados.buscar({ pagina, tamano, puntajeMinimo: PUNTAJE_MINIMO }));
  }
}
