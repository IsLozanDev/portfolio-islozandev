import type { TenantContext } from '@vitrina/plataforma/kernel';
import type { TypeOrmUnitOfWork } from '@vitrina/plataforma/kernel-infra';
import { Brackets, type Repository } from 'typeorm';
import type { RepositorioItems } from '../../application/ports/repositorios.js';
import { CodigoItemDuplicadoError } from '../../domain/errores.js';
import type { ItemCatalogo } from '../../domain/item-catalogo.js';
import { ItemEntidad, type FilaItem } from './entidades.js';
import { esUuid, esViolacionDeUnicidad } from './errores-sql.js';
import { filaDesdeItem, itemDesdeFila } from './mapeo.js';

// SQL crudo (regla 11): la app no escribe ítems globales; lo hacen funciones SECURITY DEFINER de cat_editor.
const GUARDAR_GLOBAL = 'SELECT cat.guardar_item_global($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) AS version';
const ELIMINAR_GLOBAL = 'SELECT cat.eliminar_item_global($1, $2) AS eliminado';

/**
 * Ítems globales y propios del tenant del contexto. La RLS no deja ver propios de otros tenants; las
 * escrituras de propios filtran además por tenant (regla 3).
 */
export class ItemsRepositorioTypeOrm implements RepositorioItems {
  constructor(
    private readonly unidadDeTrabajo: TypeOrmUnitOfWork,
    private readonly contexto: TenantContext,
  ) {}

  async buscar(id: string): Promise<ItemCatalogo | null> {
    if (!esUuid(id)) return null;
    const fila = await this.items()
      .createQueryBuilder('item')
      .where('item.id = :id', { id })
      .andWhere(new Brackets((dueno) => dueno.where('item.tenantId IS NULL').orWhere('item.tenantId = :tenantId', { tenantId: this.tenantId() })))
      .getOne();
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

  async guardarPropio(item: ItemCatalogo, versionAnterior: number | null): Promise<boolean> {
    if (versionAnterior === null) return this.insertarPropio(item);
    const { codigoExterno, nombre, abreviatura, orden, atributos, vigenteDesde, vigenteHasta, activo, version, modificadoPor, modificadoEn } =
      filaDesdeItem(item, versionAnterior + 1);
    const resultado = await this.items().update(
      { id: item.id, tenantId: this.tenantId(), version: String(versionAnterior) },
      { codigoExterno, nombre, abreviatura, orden, atributos, vigenteDesde, vigenteHasta, activo, version, modificadoPor, modificadoEn },
    );
    return resultado.affected === 1;
  }

  async eliminarPropio(id: string, version: number): Promise<boolean> {
    const resultado = await this.items().delete({ id, tenantId: this.tenantId(), version: String(version) });
    return resultado.affected === 1;
  }

  /** La violación de ux_cat_item en una carrera da el mismo error que la comprobación previa (TR-CA-069). */
  private async insertarPropio(item: ItemCatalogo): Promise<boolean> {
    try {
      await this.items().insert(filaDesdeItem(item, item.version));
      return true;
    } catch (error) {
      if (esViolacionDeUnicidad(error)) throw new CodigoItemDuplicadoError();
      throw error;
    }
  }

  private tenantId(): string {
    return this.contexto.current().tenantId;
  }

  private items(): Repository<FilaItem> {
    return this.unidadDeTrabajo.manager.getRepository(ItemEntidad);
  }
}
