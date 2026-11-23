import { ETIQUETAS_ROL, ETIQUETAS_TIPO_DOCUMENTO } from '../models/etiquetas-personas';
import type { ProductoCodigo, RolPersona, TipoDocumento } from '../models/persona';

/** «DNI 45781236». */
export function formatoDocumento(tipo: TipoDocumento, numero: string): string {
  return `${ETIQUETAS_TIPO_DOCUMENTO[tipo]} ${numero}`;
}

/** «REST · Cliente». */
export function formatoRol(productoCodigo: ProductoCodigo, rol: RolPersona): string {
  return `${productoCodigo} · ${ETIQUETAS_ROL[rol]}`;
}
