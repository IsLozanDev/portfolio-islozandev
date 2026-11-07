import { Catalogo } from '../../domain/catalogo.js';
import { ItemCatalogo } from '../../domain/item-catalogo.js';
import { Vigencia } from '../../domain/vigencia.js';
import type { FilaCatalogo, FilaItem } from './entidades.js';

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
    atributos: fila.atributos,
    vigencia: Vigencia.de(fila.vigenteDesde, fila.vigenteHasta),
    activo: fila.activo,
    creadoPor: fila.creadoPor,
    creadoEn: fila.creadoEn,
    modificadoPor: fila.modificadoPor,
    modificadoEn: fila.modificadoEn,
  });
}
