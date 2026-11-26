import type { CatalogoPort } from '@vitrina/plataforma/catalogos';
import type { CatalogosSunat } from '../../application/ports/reglas-emision.js';
import { esGrupoAfectacion, type GrupoAfectacion } from '../../domain/comprobante/linea-comprobante.js';

export const CATALOGOS_SUNAT = {
  unidad: 'UNIDAD_MEDIDA',
  moneda: 'MONEDA',
  tipoDocumento: 'TIPO_DOC_IDENTIDAD',
  afectacion: 'AFECTACION_IGV',
} as const;
/** Atributos que 01u_fe_comprobante suma a AFECTACION_IGV. */
const ATRIBUTO_GRUPO = 'grupo';
const ATRIBUTO_ONEROSO = 'oneroso';

/** Sobre `CATALOGO_PORT` (TR-RNF-119): vigencia y visibilidad las resuelve CAT para el tenant del contexto. */
export class CatalogosSunatCatalogo implements CatalogosSunat {
  constructor(private readonly catalogo: Pick<CatalogoPort, 'validarItem'>) {}

  existeUnidad(codigo: string): Promise<boolean> {
    return this.esValido(CATALOGOS_SUNAT.unidad, codigo);
  }

  existeMoneda(codigo: string): Promise<boolean> {
    return this.esValido(CATALOGOS_SUNAT.moneda, codigo);
  }

  existeTipoDocumento(codigo: string): Promise<boolean> {
    return this.esValido(CATALOGOS_SUNAT.tipoDocumento, codigo);
  }

  async codigoSunatTipoDocumento(codigo: string): Promise<string | null> {
    const { valido, codigoExterno } = await this.catalogo.validarItem(CATALOGOS_SUNAT.tipoDocumento, codigo);
    return valido ? codigoExterno : null;
  }

  /** Sin el atributo `oneroso` o con un grupo que FE no emite (IVAP, exportación, gratuitas), null. */
  async grupoAfectacion(codigo: string): Promise<GrupoAfectacion | null> {
    const { valido, atributos } = await this.catalogo.validarItem(CATALOGOS_SUNAT.afectacion, codigo);
    const grupo = atributos?.[ATRIBUTO_GRUPO];
    if (!valido || atributos?.[ATRIBUTO_ONEROSO] !== true || !esGrupoAfectacion(grupo)) return null;
    return grupo;
  }

  private async esValido(catalogo: string, codigo: string): Promise<boolean> {
    return (await this.catalogo.validarItem(catalogo, codigo)).valido;
  }
}
