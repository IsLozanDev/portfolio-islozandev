import type { Feriado } from '../../domain/feriados/feriado.js';
import { esOperador, type DependenciasFeriados } from './dependencias-feriados.js';
import { feriadoGuardadoDe, type FeriadoDelAnio } from './resultados.js';

export interface ListarFeriadosConsulta {
  anio: number;
  /** Sin sucursal: los de todas las sucursales del tenant. */
  sucursalId: string | null;
}

type DependenciasListarFeriados = Pick<DependenciasFeriados, 'unidadDeTrabajo' | 'contexto' | 'feriados' | 'verificadorOperador'>;

/** Feriados que aplican en un año, con los recurrentes proyectados y ordenados por su fecha en ese año. */
export class ListarFeriados {
  constructor(private readonly dependencias: DependenciasListarFeriados) {}

  ejecutar(consulta: ListarFeriadosConsulta): Promise<FeriadoDelAnio[]> {
    const { unidadDeTrabajo, feriados } = this.dependencias;

    return unidadDeTrabajo.run(async () => {
      const operador = await esOperador(this.dependencias);
      const candidatos = await feriados.delAnio(consulta.anio, consulta.sucursalId);
      return candidatos
        .flatMap((feriado) => delAnio(feriado, consulta.anio, operador))
        .sort((uno, otro) => uno.fechaEnAnio.localeCompare(otro.fechaEnAnio) || uno.nombre.localeCompare(otro.nombre));
    });
  }
}

function delAnio(feriado: Feriado, anio: number, operador: boolean): FeriadoDelAnio[] {
  const fechaEnAnio = feriado.fechaEnAnio(anio);
  if (fechaEnAnio === null) return [];
  return [{ ...feriadoGuardadoDe(feriado, feriado.version), fechaEnAnio, editable: operador || !feriado.esGlobal }];
}
