import type { TypeOrmUnitOfWork } from '@vitrina/plataforma/kernel-infra';
import { Brackets, type Repository } from 'typeorm';
import type { RepositorioItems } from '../../application/ports/repositorios.js';
import { CodigoItemDuplicadoError } from '../../domain/errores.js';
import type { ItemCatalogo } from '../../domain/item-catalogo.js';
import { ItemEntidad, type FilaItem } from './entidades.js';
import { esUuid, esViolacionDeUnicidad } from './errores-sql.js';
import { itemDesdeFila } from './mapeo.js';

// SQL crudo (regla 11): la app no escribe ítems globales; lo hacen funciones SECURITY DEFINER de cat_editor.
const GUARDAR_GLOBAL = 'SELECT cat.guardar_item_global($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) AS version';
const ELIMINAR_GLOBAL = 'SELECT cat.eliminar_item_global($1, $2) AS eliminado';

/** Ítems globales y propios del tenant del contexto. La RLS no deja ver propios de otros tenants. */
export class ItemsRepositorioTypeOrm implements RepositorioItems {
  constructor(private readonly unidadDeTrabajo: TypeOrmUnitOfWork) {}

  async buscar(id: string): Promise<ItemCatalogo | null> {
    if (!esUuid(id)) return null;
    const fila = await this.items().findOneBy({ id });
    return fila ? itemDesdeFila(fila) : null;
  }

  async existeCodigo(catalogoId: string, tenantId: string | null, codigo: string): Promise<boolean> {
    const consulta = this.items()
      .createQueryBuilder('item')
      .where('item.catalogoId = :catalogoId', { catalogoId })
      .andWhere('item.codigo = :codigo', { codigo });
    if (tenantId === null) {
      consulta.andWhere('item.tenantId IS NULL');
    } else {
      consulta.andWhere(new Brackets((dueno) => dueno.where('item.tenantId IS NULL').orWhere('item.tenantId = :tenantId', { tenantId })));
    }
    return consulta.getExists();
  }

  async guardarGlobal(item: ItemCatalogo, versionAnterior: number | null): Promise<boolean> {
    try {
      const [{ version }] = await this.unidadDeTrabajo.manager.query(GUARDAR_GLOBAL, [
        item.id,
        versionAnterior,
        item.catalogoId,
        item.codigo,
        item.codigoExterno,
        item.nombre,
        item.abreviatura,
        item.orden,
        JSON.stringify(item.atributos),
        item.vigencia.desde,
        item.vigencia.hasta,
        item.activo,
        item.modificadoPor,
      ]);
      return version !== null;
    } catch (error) {
      if (esViolacionDeUnicidad(error)) throw new CodigoItemDuplicadoError();
      throw error;
    }
  }

  async eliminarGlobal(id: string, version: number): Promise<boolean> {
    const [{ eliminado }] = await this.unidadDeTrabajo.manager.query(ELIMINAR_GLOBAL, [id, version]);
    return eliminado === true;
  }

  private items(): Repository<FilaItem> {
    return this.unidadDeTrabajo.manager.getRepository(ItemEntidad);
  }
}
