import { AjusteItem } from '../../domain/ajuste-item.js';
import type { AtributosItem } from '../../domain/atributos-item.js';
import { Catalogo } from '../../domain/catalogo.js';
import { ItemCatalogo } from '../../domain/item-catalogo.js';
import { Vigencia } from '../../domain/vigencia.js';
import type { AjusteGuardado } from '../../application/ports/repositorios.js';
import type { FilaAjuste, FilaCatalogo, FilaItem } from './entidades.js';

// Las entidades ORM no son los agregados: el paso de una a otro va aquí, campo por campo.

export function catalogoDesdeFila(fila: FilaCatalogo): Catalogo {
  return Catalogo.reconstituir(fila.id, Number(fila.version), {
    codigo: fila.codigo,
    nombre: fila.nombre,
    alcance: fila.alcance,
    fuente: fila.fuente,
    editablePorTenant: fila.editablePorTenant,
    creadoPor: fila.creadoPor,
    creadoEn: fila.creadoEn,
    modificadoPor: fila.modificadoPor,
    modificadoEn: fila.modificadoEn,
  });
}

export function itemDesdeFila(fila: FilaItem): ItemCatalogo {
  return ItemCatalogo.reconstituir(fila.id, Number(fila.version), {
    catalogoId: fila.catalogoId,
    tenantId: fila.tenantId,
    codigo: fila.codigo,
    codigoExterno: fila.codigoExterno,
    nombre: fila.nombre,
    abreviatura: fila.abreviatura,
    orden: fila.orden,
    atributos: fila.atributos as AtributosItem,
    vigencia: Vigencia.de(fila.vigenteDesde, fila.vigenteHasta),
    activo: fila.activo,
    creadoPor: fila.creadoPor,
    creadoEn: fila.creadoEn,
    modificadoPor: fila.modificadoPor,
    modificadoEn: fila.modificadoEn,
  });
}

/** `version` aparte: el agregado lleva la que leyó y la fila guarda la siguiente. */
export function filaDesdeItem(item: ItemCatalogo, version: number): FilaItem {
  return {
    id: item.id,
    catalogoId: item.catalogoId,
    tenantId: item.tenantId,
    codigo: item.codigo,
    codigoExterno: item.codigoExterno,
    nombre: item.nombre,
    abreviatura: item.abreviatura,
    orden: item.orden,
    atributos: item.atributos,
    vigenteDesde: item.vigencia.desde,
    vigenteHasta: item.vigencia.hasta,
    activo: item.activo,
    version: String(version),
    creadoPor: item.creadoPor,
    creadoEn: item.creadoEn,
    modificadoPor: item.modificadoPor,
    modificadoEn: item.modificadoEn,
  };
}

export function ajusteDesdeFila(fila: FilaAjuste): AjusteGuardado {
  return { ajuste: AjusteItem.de({ visible: fila.visible, orden: fila.orden, alias: fila.alias }), version: Number(fila.version) };
}
