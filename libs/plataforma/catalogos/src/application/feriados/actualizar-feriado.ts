import { VersionObsoletaError } from '../../domain/errores.js';
import type { AlcanceFeriado } from '../../domain/feriados/tipos.js';
import type { Actualizado } from '../resultados.js';
import { buscarFeriadoEditable, exigirSinDuplicado, guardarFeriado, publicarFeriado, type DependenciasFeriados } from './dependencias-feriados.js';
import { feriadoGuardadoDe, type FeriadoGuardado } from './resultados.js';

export interface ActualizarFeriadoComando {
  feriadoId: string;
  fecha: string;
  nombre: string;
  recurrenteAnual: boolean;
  /** Solo si el cliente los manda: distintos de los guardados dan FERIADO_INVALIDO. */
  alcance?: AlcanceFeriado;
  sucursalId?: string | null;
  /** Versión con la que se leyó (bloqueo optimista). */
  version: number;
  actorId: string;
}

/** TR-RF-029: cambia fecha, nombre o recurrencia. El alcance y la sucursal no cambian. */
export class ActualizarFeriado {
  constructor(private readonly dependencias: DependenciasFeriados) {}

  ejecutar(comando: ActualizarFeriadoComando): Promise<Actualizado<FeriadoGuardado>> {
    const { unidadDeTrabajo, reloj, feriados } = this.dependencias;

    return unidadDeTrabajo.run(async () => {
      const feriado = await buscarFeriadoEditable(this.dependencias, comando.feriadoId);
      if (feriado.version !== comando.version) throw new VersionObsoletaError();

      const ahora = reloj.now();
      const cambiado = feriado.actualizar({
        fecha: comando.fecha,
        nombre: comando.nombre,
        recurrenteAnual: comando.recurrenteAnual,
        alcance: comando.alcance,
        sucursalId: comando.sucursalId,
        por: comando.actorId,
        ahora,
      });
      if (!cambiado) return { ...feriadoGuardadoDe(feriado, feriado.version), cambiado };

      await exigirSinDuplicado(feriados, feriado, feriado.id);
      if (!(await guardarFeriado(feriados, feriado, comando.version))) throw new VersionObsoletaError();
      const version = comando.version + 1;
      await publicarFeriado(this.dependencias, { feriado, accion: 'MODIFICADO', version, actorId: comando.actorId, ahora });
      return { ...feriadoGuardadoDe(feriado, version), cambiado };
    });
  }
}
