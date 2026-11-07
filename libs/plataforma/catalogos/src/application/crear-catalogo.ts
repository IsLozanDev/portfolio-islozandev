import { Catalogo } from '../domain/catalogo.js';
import type { AlcanceCatalogo } from '../domain/tipos.js';
import { exigirOperador, publicarCambioGlobal, type DependenciasCatalogos } from './dependencias-catalogos.js';
import { definicionDe, type DefinicionCatalogo } from './resultados.js';

export interface CrearCatalogoComando {
  codigo: string;
  nombre: string;
  alcance: AlcanceCatalogo;
  fuente: string | null;
  editablePorTenant: boolean;
  /** Usuario que ejecuta (sub del token). */
  actorId: string;
}

/** TR-RF-022: registra un catálogo. Solo el tenant operador (TR-RN-009). */
export class CrearCatalogo {
  constructor(private readonly dependencias: DependenciasCatalogos) {}

  ejecutar(comando: CrearCatalogoComando): Promise<DefinicionCatalogo> {
    const { unidadDeTrabajo, ids, reloj, catalogos } = this.dependencias;

    return unidadDeTrabajo.run(async () => {
      await exigirOperador(this.dependencias);
      const ahora = reloj.now();
      const catalogo = Catalogo.crear({
        id: ids.next(),
        codigo: comando.codigo,
        nombre: comando.nombre,
        alcance: comando.alcance,
        fuente: comando.fuente,
        editablePorTenant: comando.editablePorTenant,
        por: comando.actorId,
        ahora,
      });
      await catalogos.crear(catalogo);
      await publicarCambioGlobal(this.dependencias, {
        catalogo,
        versionGlobal: catalogo.version,
        cambio: 'CATALOGO',
        itemId: null,
        actorId: comando.actorId,
        ahora,
      });
      return definicionDe(catalogo, catalogo.version);
    });
  }
}
