import type { AtributosItem, CatalogoPort } from '@vitrina/plataforma/catalogos';
import type { ProveedorFe, ProveedoresFe } from '../../application/ports/proveedores-fe.js';
import { ProveedorFeInvalidoError } from '../../domain/errores.js';

export const CATALOGO_PROVEEDOR_FE = 'PROVEEDOR_FE';
const ATRIBUTO_REQUIERE_CERTIFICADO = 'requiere_certificado';
const ATRIBUTO_SERIE_PRUEBA = 'serie_prueba';
const ATRIBUTO_DOMINIOS_PERMITIDOS = 'dominios_permitidos';

function seriePruebaDe(atributos: AtributosItem | null): string | null {
  const serie = atributos?.[ATRIBUTO_SERIE_PRUEBA];
  return typeof serie === 'string' ? serie : null;
}

/** Sin el atributo o con algo que no es una lista de textos, ningún dominio: el worker no llama a nadie. */
function dominiosDe(atributos: AtributosItem | null): string[] {
  const dominios = atributos?.[ATRIBUTO_DOMINIOS_PERMITIDOS];
  if (!Array.isArray(dominios)) return [];
  return dominios.filter((dominio): dominio is string => typeof dominio === 'string');
}

/** Sobre `CATALOGO_PORT` (TR-RNF-119). Sin el atributo, se exige certificado: es lo seguro. */
export class ProveedoresFeCatalogo implements ProveedoresFe {
  constructor(private readonly catalogo: Pick<CatalogoPort, 'validarItem'>) {}

  async obtener(codigo: string): Promise<ProveedorFe> {
    const resultado = await this.catalogo.validarItem(CATALOGO_PROVEEDOR_FE, codigo);
    if (!resultado.valido) throw new ProveedorFeInvalidoError();
    const { atributos } = resultado;
    return {
      codigo,
      requiereCertificado: atributos?.[ATRIBUTO_REQUIERE_CERTIFICADO] !== false,
      seriePrueba: seriePruebaDe(atributos),
      dominiosPermitidos: dominiosDe(atributos),
    };
  }
}
