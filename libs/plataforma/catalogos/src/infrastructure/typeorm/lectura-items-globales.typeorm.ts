import type { TypeOrmUnitOfWork } from '@vitrina/plataforma/kernel-infra';
import type { LecturaItemsGlobales } from '../../application/ports/importacion.js';
import type { ItemGlobalActual } from '../../domain/importacion/calcular-diferencias.js';
import { ItemEntidad } from './entidades.js';

/** La RLS deja leer los globales a todos los tenants. */
export class LecturaItemsGlobalesTypeOrm implements LecturaItemsGlobales {
  constructor(private readonly unidadDeTrabajo: TypeOrmUnitOfWork) {}

  async de(catalogoId: string): Promise<ItemGlobalActual[]> {
    const filas = await this.unidadDeTrabajo.manager
      .getRepository(ItemEntidad)
      .createQueryBuilder('item')
      .select([
        'item.id',
        'item.codigo',
        'item.codigoExterno',
        'item.nombre',
        'item.abreviatura',
        'item.orden',
        'item.atributos',
        'item.vigenteDesde',
        'item.vigenteHasta',
        'item.activo',
      ])
      .where('item.catalogoId = :catalogoId', { catalogoId })
      .andWhere('item.tenantId IS NULL')
      .getMany();
    return filas.map((fila) => ({
      id: fila.id,
      codigo: fila.codigo,
      codigoExterno: fila.codigoExterno,
      nombre: fila.nombre,
      abreviatura: fila.abreviatura,
      orden: fila.orden,
      atributos: fila.atributos as Record<string, unknown>,
      vigenteDesde: fila.vigenteDesde,
      vigenteHasta: fila.vigenteHasta,
      activo: fila.activo,
    }));
  }
}
