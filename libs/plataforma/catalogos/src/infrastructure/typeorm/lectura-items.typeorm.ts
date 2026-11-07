import type { TypeOrmUnitOfWork } from '@vitrina/plataforma/kernel-infra';
import type { FilaItemLeido, LecturaItems, Versiones } from '../../application/ports/repositorios.js';
import type { AtributosItem } from '../../domain/atributos-item.js';
import type { EstadoItem } from '../../domain/tipos.js';

// SQL crudo (regla 11): funciones de base de datos con la RLS del tenant. cat.items combina tres tablas
// con la prioridad de los ajustes, que el ORM no expresa bien.
const VERSIONES = 'SELECT catalogo_id, version_global, version_tenant FROM cat.versiones($1, $2)';
const ITEMS = 'SELECT item_id, codigo, codigo_externo, nombre, atributos, orden, propio, estado FROM cat.items($1, $2, $3)';

interface FilaVersiones {
  catalogo_id: string;
  /** bigint: node-pg lo devuelve como string. */
  version_global: string;
  version_tenant: string;
}

interface FilaItems {
  item_id: string;
  codigo: string;
  codigo_externo: string | null;
  nombre: string;
  atributos: AtributosItem;
  orden: number;
  propio: boolean;
  estado: EstadoItem;
}

export class LecturaItemsTypeOrm implements LecturaItems {
  constructor(private readonly unidadDeTrabajo: TypeOrmUnitOfWork) {}

  async versiones(codigo: string, tenantId: string): Promise<Versiones | null> {
    const [fila]: FilaVersiones[] = await this.unidadDeTrabajo.manager.query(VERSIONES, [codigo, tenantId]);
    if (!fila) return null;
    return { catalogoId: fila.catalogo_id, versionGlobal: Number(fila.version_global), versionTenant: Number(fila.version_tenant) };
  }

  async items(codigo: string, tenantId: string, fecha: string): Promise<FilaItemLeido[]> {
    const filas: FilaItems[] = await this.unidadDeTrabajo.manager.query(ITEMS, [codigo, tenantId, fecha]);
    return filas.map((fila) => ({
      itemId: fila.item_id,
      codigo: fila.codigo,
      codigoExterno: fila.codigo_externo,
      nombre: fila.nombre,
      atributos: fila.atributos,
      orden: fila.orden,
      propio: fila.propio,
      estado: fila.estado,
    }));
  }
}
