import { SerieNoEncontradaError } from '../domain/errores.js';
import type { Serie } from '../domain/serie.js';
import { exigirAlcance, type DependenciasSeries } from './dependencias-series.js';
import { publicarEventos } from './publicar-eventos.js';

export interface CambiarEstadoSerieComando {
  serieId: string;
  activa: boolean;
  /** Usuario que ejecuta (sub del token). */
  actorId: string;
}

export interface EstadoSerieCambiado {
  id: string;
  activa: boolean;
  modificadoEn: Date;
  /** false si ya estaba en ese estado: no se escribió ni se publicó (TR-RNF-008). */
  cambiado: boolean;
}

/** Activa o desactiva una serie. Una serie inactiva no numera. */
export class CambiarEstadoSerie {
  constructor(private readonly dependencias: DependenciasSeries) {}

  ejecutar(comando: CambiarEstadoSerieComando): Promise<EstadoSerieCambiado> {
    const { unidadDeTrabajo, reloj, series, eventos, alcanceActor } = this.dependencias;

    return unidadDeTrabajo.run(async () => {
      const serie = await series.buscar(comando.serieId);
      if (!serie) throw new SerieNoEncontradaError();
      const ahora = reloj.now();
      await exigirAlcance(alcanceActor, comando.actorId, serie.ambito, ahora);

      if (!serie.cambiarEstado(comando.activa, comando.actorId, ahora)) return estadoDe(serie, false);
      await series.guardarEstado(serie);
      await publicarEventos(eventos, serie);
      return estadoDe(serie, true);
    });
  }
}

function estadoDe(serie: Serie, cambiado: boolean): EstadoSerieCambiado {
  return { id: serie.id, activa: serie.activa, modificadoEn: serie.modificadoEn, cambiado };
}
