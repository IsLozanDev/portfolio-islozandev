import type { Clock, UnitOfWork } from '@vitrina/plataforma/kernel';
import { SerieNoEncontradaError } from '../domain/errores.js';
import { NumeroCorrelativo } from '../domain/numero-correlativo.js';
import type { FiltroSeries, LecturaSeries, SerieDetalle, SerieListada } from './ports/lectura-series.js';

export interface DependenciasLectura {
  unidadDeTrabajo: UnitOfWork;
  reloj: Clock;
  lectura: LecturaSeries;
}

export type ConSiguiente<T extends SerieListada> = T & { siguienteFormateado: string };

/** Series del tenant con la vista previa del siguiente número (TR-RF-035). */
export class ListarSeries {
  constructor(private readonly dependencias: DependenciasLectura) {}

  ejecutar(filtro: FiltroSeries): Promise<ConSiguiente<SerieListada>[]> {
    const { unidadDeTrabajo, reloj, lectura } = this.dependencias;
    return unidadDeTrabajo.run(async () => (await lectura.listar(filtro, reloj.now())).map(conSiguiente));
  }
}

export class ConsultarSerie {
  constructor(private readonly dependencias: DependenciasLectura) {}

  ejecutar(id: string): Promise<ConSiguiente<SerieDetalle>> {
    const { unidadDeTrabajo, reloj, lectura } = this.dependencias;
    return unidadDeTrabajo.run(async () => {
      const serie = await lectura.consultar(id, reloj.now());
      if (!serie) throw new SerieNoEncontradaError();
      return conSiguiente(serie);
    });
  }
}

function conSiguiente<T extends SerieListada>(serie: T): ConSiguiente<T> {
  const siguienteFormateado = NumeroCorrelativo.de(serie.serie, BigInt(serie.siguienteNumero), serie.digitos).formateado;
  return { ...serie, siguienteFormateado };
}
