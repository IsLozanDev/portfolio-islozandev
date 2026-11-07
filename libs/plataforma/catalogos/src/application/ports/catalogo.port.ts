import type { AtributosItem } from '../../domain/atributos-item.js';
import type { MotivoInvalido } from '../../domain/tipos.js';

export const CATALOGO_PORT = Symbol('CatalogoPort');

export interface ResultadoValidacion {
  valido: boolean;
  /** null si es válido. */
  motivo: MotivoInvalido | null;
  /** null si el código no existe en el catálogo para el tenant. */
  atributos: AtributosItem | null;
}

/**
 * TR-RF-027. Única vía de los productos para validar un código contra un catálogo (TR-RNF-119). El tenant
 * sale del TenantContext y no se evalúa permiso. Lee de la caché; si Redis falla, de la base.
 * CatalogoNoExisteError si el catálogo no existe.
 *
 * No valida el valor contra `regex` o `longitud`: los atributos vuelven para que el producto lo haga. El
 * patrón compila y tiene a lo sumo 200 caracteres, pero puede tener retroceso costoso; el producto decide
 * cómo evaluarlo.
 */
export interface CatalogoPort {
  validarItem(catalogo: string, codigo: string): Promise<ResultadoValidacion>;
}
