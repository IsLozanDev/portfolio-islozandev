import { VersionObsoletaError } from '../../domain/errores.js';
import { buscarFeriadoEditable, publicarFeriado, type DependenciasFeriados } from './dependencias-feriados.js';

export interface EliminarFeriadoComando {
  feriadoId: string;
  version: number;
  actorId: string;
}

/** Borrado físico: nada referencia un feriado y el evento deja la traza para el spec 20. */
export class EliminarFeriado {
  constructor(private readonly dependencias: DependenciasFeriados) {}

  ejecutar(comando: EliminarFeriadoComando): Promise<void> {
    const { unidadDeTrabajo, reloj, feriados } = this.dependencias;

    return unidadDeTrabajo.run(async () => {
      const feriado = await buscarFeriadoEditable(this.dependencias, comando.feriadoId);
      if (feriado.version !== comando.version) throw new VersionObsoletaError();

      const eliminado = feriado.esGlobal
        ? await feriados.eliminarGlobal(feriado.id, comando.version)
        : await feriados.eliminarDelTenant(feriado.id, comando.version);
      if (!eliminado) throw new VersionObsoletaError();
      await publicarFeriado(this.dependencias, {
        feriado,
        accion: 'ELIMINADO',
        version: comando.version,
        actorId: comando.actorId,
        ahora: reloj.now(),
      });
    });
  }
}
