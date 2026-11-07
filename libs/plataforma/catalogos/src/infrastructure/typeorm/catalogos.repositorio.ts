import type { TypeOrmUnitOfWork } from '@vitrina/plataforma/kernel-infra';
import type { Repository } from 'typeorm';
import type { RepositorioCatalogos } from '../../application/ports/repositorios.js';
import type { Catalogo } from '../../domain/catalogo.js';
import { CatalogoDuplicadoError } from '../../domain/errores.js';
import { CatalogoEntidad, type FilaCatalogo } from './entidades.js';
import { esViolacionDeUnicidad } from './errores-sql.js';
import { catalogoDesdeFila } from './mapeo.js';

// SQL crudo (regla 11): la app no escribe cat.catalogo; lo hacen funciones SECURITY DEFINER de cat_editor.
const CREAR = 'SELECT cat.crear_catalogo($1, $2, $3, $4, $5, $6, $7) AS version';
const ACTUALIZAR = 'SELECT cat.actualizar_catalogo($1, $2, $3, $4, $5, $6) AS version';

/** Los catálogos son globales: la RLS deja leerlos a todos los tenants. */
export class CatalogosRepositorioTypeOrm implements RepositorioCatalogos {
  constructor(private readonly unidadDeTrabajo: TypeOrmUnitOfWork) {}

  async buscarPorCodigo(codigo: string): Promise<Catalogo | null> {
    const fila = await this.catalogos().findOneBy({ codigo });
    return fila ? catalogoDesdeFila(fila) : null;
  }

  async listar(): Promise<Catalogo[]> {
    return (await this.catalogos().find({ order: { codigo: 'ASC' } })).map(catalogoDesdeFila);
  }

  async crear(catalogo: Catalogo): Promise<void> {
    try {
      await this.unidadDeTrabajo.manager.query(CREAR, [
        catalogo.id,
        catalogo.codigo,
        catalogo.nombre,
        catalogo.alcance,
        catalogo.fuente,
        catalogo.editablePorTenant,
        catalogo.creadoPor,
      ]);
    } catch (error) {
      if (esViolacionDeUnicidad(error)) throw new CatalogoDuplicadoError();
      throw error;
    }
  }

  async actualizar(catalogo: Catalogo, versionAnterior: number): Promise<boolean> {
    const [{ version }] = await this.unidadDeTrabajo.manager.query(ACTUALIZAR, [
      catalogo.id,
      versionAnterior,
      catalogo.nombre,
      catalogo.fuente,
      catalogo.editablePorTenant,
      catalogo.modificadoPor,
    ]);
    return version !== null;
  }

  private catalogos(): Repository<FilaCatalogo> {
    return this.unidadDeTrabajo.manager.getRepository(CatalogoEntidad);
  }
}
