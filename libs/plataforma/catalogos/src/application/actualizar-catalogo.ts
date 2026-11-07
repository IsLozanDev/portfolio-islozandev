import { VersionObsoletaError } from '../domain/errores.js';
import { eventoCatalogoActualizado } from '../domain/eventos.js';
import { buscarCatalogo, exigirOperador, type DependenciasCatalogos } from './dependencias-catalogos.js';
import { definicionDe, type Actualizado, type DefinicionCatalogo } from './resultados.js';

export interface ActualizarCatalogoComando {
  codigo: string;
  nombre: string;
  fuente: string | null;
  editablePorTenant: boolean;
  /** Versión con la que se leyó (bloqueo optimista). */
  version: number;
  actorId: string;
}

/** TR-RF-022: cambia nombre, fuente y editable. El alcance y el código no cambian. Solo el operador. */
export class ActualizarCatalogo {
  constructor(private readonly dependencias: DependenciasCatalogos) {}

  ejecutar(comando: ActualizarCatalogoComando): Promise<Actualizado<DefinicionCatalogo>> {
    const { unidadDeTrabajo, reloj, catalogos, eventos } = this.dependencias;

    return unidadDeTrabajo.run(async () => {
      await exigirOperador(this.dependencias);
      const catalogo = await buscarCatalogo(catalogos, comando.codigo);
      if (catalogo.version !== comando.version) throw new VersionObsoletaError();

      const ahora = reloj.now();
      const cambiado = catalogo.actualizar({
        nombre: comando.nombre,
        fuente: comando.fuente,
        editablePorTenant: comando.editablePorTenant,
        por: comando.actorId,
        ahora,
      });
      if (!cambiado) return { ...definicionDe(catalogo, catalogo.version), cambiado };

      if (!(await catalogos.actualizar(catalogo, comando.version))) throw new VersionObsoletaError();
      const versionNueva = comando.version + 1;
      await eventos.publish(
        eventoCatalogoActualizado({
          catalogoId: catalogo.id,
          codigo: catalogo.codigo,
          versionGlobal: versionNueva,
          versionTenant: 0,
          tenantId: null,
          cambio: 'CATALOGO',
          itemId: null,
          por: comando.actorId,
          ahora,
        }),
      );
      return { ...definicionDe(catalogo, versionNueva), cambiado };
    });
  }
}
