import { exigirCanalHabilitado } from '../../domain/canal.js';
import type { DependenciasPlantillas } from '../dependencias.js';
import type { Pagina, ResumenPlantilla } from '../ports/repositorios.js';

export interface ListarPlantillasConsulta {
  canal?: string;
  /** Busca en código y asunto, sin distinguir mayúsculas. */
  q?: string;
  /** Desde 1. */
  pagina: number;
  tamano: number;
}

/** Una fila por código: la personalizada vigente del tenant o la base. */
export class ListarPlantillas {
  constructor(private readonly dependencias: Pick<DependenciasPlantillas, 'unidadDeTrabajo' | 'plantillas'>) {}

  async ejecutar(consulta: ListarPlantillasConsulta): Promise<Pagina<ResumenPlantilla>> {
    const canal = consulta.canal === undefined ? undefined : exigirCanalHabilitado(consulta.canal);
    const { unidadDeTrabajo, plantillas } = this.dependencias;
    return unidadDeTrabajo.run(() => plantillas.listar({ canal, texto: consulta.q, pagina: consulta.pagina, tamano: consulta.tamano }));
  }
}
