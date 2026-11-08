import type { TypeOrmUnitOfWork } from '@vitrina/plataforma/kernel-infra';
import type {
  FilaAdministracion,
  FiltroItemsAdministracion,
  LecturaItemsAdministracion,
} from '../../application/ports/items-administracion.js';
import type { AtributosItem } from '../../domain/atributos-item.js';
import type { EstadoItem } from '../../domain/tipos.js';

// SQL crudo (regla 11): cat.items_administracion reutiliza los estados de cat.items y cuenta el total con
// count(*) OVER (). ::text en las fechas: node-pg convierte date en Date con la zona del proceso.
const ITEMS_ADMINISTRACION = `
  SELECT item_id, codigo, codigo_externo, nombre, abreviatura, orden, atributos,
         vigente_desde::text AS vigente_desde, vigente_hasta::text AS vigente_hasta, activo, propio, estado,
         ajuste_visible, ajuste_orden, ajuste_alias, version, ajuste_version, total
    FROM cat.items_administracion($1, $2, $3, $4, $5, $6, $7, $8)`;

interface FilaSql {
  item_id: string;
  codigo: string;
  codigo_externo: string | null;
  nombre: string;
  abreviatura: string | null;
  orden: number;
  atributos: AtributosItem;
  vigente_desde: string;
  vigente_hasta: string | null;
  activo: boolean;
  propio: boolean;
  estado: EstadoItem;
  ajuste_visible: boolean | null;
  ajuste_orden: number | null;
  ajuste_alias: string | null;
  /** bigint: node-pg lo devuelve como string. */
  version: string;
  ajuste_version: string | null;
  total: string;
}

export class LecturaItemsAdministracionTypeOrm implements LecturaItemsAdministracion {
  constructor(private readonly unidadDeTrabajo: TypeOrmUnitOfWork) {}

  async listar(filtro: FiltroItemsAdministracion): Promise<{ filas: FilaAdministracion[]; total: number }> {
    const filas: FilaSql[] = await this.unidadDeTrabajo.manager.query(ITEMS_ADMINISTRACION, [
      filtro.codigo,
      filtro.tenantId,
      filtro.fecha,
      filtro.texto,
      filtro.estado,
      filtro.origen,
      filtro.limite,
      filtro.desplazamiento,
    ]);
    return { filas: filas.map(filaAdministracionDe), total: filas.length > 0 ? Number(filas[0].total) : 0 };
  }
}

function filaAdministracionDe(fila: FilaSql): FilaAdministracion {
  return {
    itemId: fila.item_id,
    codigo: fila.codigo,
    codigoExterno: fila.codigo_externo,
    nombre: fila.nombre,
    abreviatura: fila.abreviatura,
    orden: fila.orden,
    atributos: fila.atributos,
    vigenteDesde: fila.vigente_desde,
    vigenteHasta: fila.vigente_hasta,
    activo: fila.activo,
    propio: fila.propio,
    estado: fila.estado,
    // ajuste_visible es NOT NULL en la tabla: NULL aquí significa que no hay ajuste.
    ajuste:
      fila.ajuste_visible === null
        ? null
        : { visible: fila.ajuste_visible, orden: fila.ajuste_orden, alias: fila.ajuste_alias, version: Number(fila.ajuste_version) },
    version: Number(fila.version),
  };
}
