import type { Feriado } from '../../domain/feriados/feriado.js';
import type { AlcanceFeriado } from '../../domain/feriados/tipos.js';
import { esOperador, type DependenciasFeriados } from './dependencias-feriados.js';
import { feriadoGuardadoDe, type FeriadoDelAnio } from './resultados.js';

export interface ListarFeriadosConsulta {
  anio: number;
  /** Sin sucursal: los de todas las sucursales del tenant. */
  sucursalId: string | null;
  /** Sin alcance: todos. */
  alcance: AlcanceFeriado | null;
  /** Desde 1. */
  pagina: number;
  tamano: number;
}

export interface PaginaFeriados {
  items: FeriadoDelAnio[];
  /** Feriados del año que cumplen los filtros, antes de cortar la página. */
  total: number;
  pagina: number;
  tamano: number;
}

type DependenciasListarFeriados = Pick<DependenciasFeriados, 'unidadDeTrabajo' | 'contexto' | 'feriados' | 'verificadorOperador'>;

/**
 * Feriados que aplican en un año, con los recurrentes proyectados y ordenados por su fecha en ese año.
 * Son decenas por año: la página se corta en memoria, después de proyectar (spec 19e).
 */
export class ListarFeriados {
  constructor(private readonly dependencias: DependenciasListarFeriados) {}

  ejecutar(consulta: ListarFeriadosConsulta): Promise<PaginaFeriados> {
    const { unidadDeTrabajo, feriados } = this.dependencias;

    return unidadDeTrabajo.run(async () => {
      const operador = await esOperador(this.dependencias);
      const candidatos = await feriados.delAnio(consulta.anio, consulta.sucursalId);
      const delAnioFiltrados = candidatos
        .filter((feriado) => consulta.alcance === null || feriado.alcance === consulta.alcance)
        .flatMap((feriado) => delAnio(feriado, consulta.anio, operador))
        .sort((uno, otro) => uno.fechaEnAnio.localeCompare(otro.fechaEnAnio) || uno.nombre.localeCompare(otro.nombre));
      const desde = (consulta.pagina - 1) * consulta.tamano;
      return {
        items: delAnioFiltrados.slice(desde, desde + consulta.tamano),
        total: delAnioFiltrados.length,
        pagina: consulta.pagina,
        tamano: consulta.tamano,
      };
    });
  }
}

function delAnio(feriado: Feriado, anio: number, operador: boolean): FeriadoDelAnio[] {
  const fechaEnAnio = feriado.fechaEnAnio(anio);
  if (fechaEnAnio === null) return [];
  return [{ ...feriadoGuardadoDe(feriado, feriado.version), fechaEnAnio, editable: operador || !feriado.esGlobal }];
}
