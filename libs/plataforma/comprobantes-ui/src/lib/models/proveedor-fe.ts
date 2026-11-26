export const CATALOGO_PROVEEDOR_FE = 'PROVEEDOR_FE';
export const PROVEEDOR_SUNAT = 'SUNAT';
export const PROVEEDOR_SIMULADO = 'SIMULADO';

const ATRIBUTO_REQUIERE_CERTIFICADO = 'requiere_certificado';
const ATRIBUTO_DOMINIOS_PERMITIDOS = 'dominios_permitidos';
const ATRIBUTO_URL_PRODUCCION = 'url_produccion';

export interface ProveedorFe {
  codigo: string;
  nombre: string;
  requiereCertificado: boolean;
  /** El tenant escribe la URL: el proveedor declara dominios y no tiene URL fija por ambiente (spec 51c). */
  pideUrl: boolean;
  esSunat: boolean;
}

/** Ítem de `GET /v1/cat/catalogos/{codigo}/items`. */
export interface ItemCatalogoRespuesta {
  codigo: string;
  nombre: string;
  atributos: Record<string, unknown>;
}

function tieneDominios(atributos: Record<string, unknown>): boolean {
  const dominios = atributos[ATRIBUTO_DOMINIOS_PERMITIDOS];
  return Array.isArray(dominios) && dominios.length > 0;
}

/** Como el back: sin el atributo se exige certificado. */
export function aProveedorFe(item: ItemCatalogoRespuesta): ProveedorFe {
  const atributos = item.atributos ?? {};
  return {
    codigo: item.codigo,
    nombre: item.nombre,
    requiereCertificado: atributos[ATRIBUTO_REQUIERE_CERTIFICADO] !== false,
    pideUrl: tieneDominios(atributos) && !atributos[ATRIBUTO_URL_PRODUCCION],
    esSunat: item.codigo === PROVEEDOR_SUNAT,
  };
}
