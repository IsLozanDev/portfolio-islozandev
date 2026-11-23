import { clasificarConsulta } from '../domain/consulta-personas.js';
import type { DependenciasPersonas } from './dependencias-personas.js';
import type { FiltrosPersonas, PaginaPersonas } from './ports/consulta-personas.js';

export const TAMANO_PAGINA_PERSONAS = { porDefecto: 20, maximo: 50 } as const;

export interface BuscarPersonasConsulta extends FiltrosPersonas {
  q?: string;
  pagina: number;
  tamano: number;
}

export interface ListadoPersonas extends PaginaPersonas {
  pagina: number;
  tamano: number;
}

/**
 * Listado del tenant por nombre (sin tildes, tolerante a errores y fonético), documento, celular o correo,
 * con filtros por tipo de persona, producto y rol. Sin texto, por denominación.
 */
export class BuscarPersonas {
  constructor(private readonly dependencias: Pick<DependenciasPersonas, 'unidadDeTrabajo' | 'consultaPersonas'>) {}

  async ejecutar({ q, pagina, tamano, ...filtros }: BuscarPersonasConsulta): Promise<ListadoPersonas> {
    const { unidadDeTrabajo, consultaPersonas } = this.dependencias;
    const consulta = clasificarConsulta(q);
    const resultado = await unidadDeTrabajo.run(() => consultaPersonas.buscar({ ...filtros, consulta, pagina, tamano }));
    return { ...resultado, pagina, tamano };
  }
}
