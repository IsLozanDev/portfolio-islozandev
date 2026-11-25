import type { CatalogoPort } from '@vitrina/plataforma/catalogos';
import type { TasaIgv } from '../../application/ports/reglas-emision.js';
import { Decimal, ESCALA_TASA } from '../../domain/comprobante/dinero.js';
import { TasaIgvNoVigenteError } from '../../domain/errores.js';
import type { RegimenIgv } from '../../domain/regimen-igv.js';

export const CATALOGO_TASA_IGV = 'TASA_IGV';
/** Texto decimal («0.18», «0.105»): sin coma flotante desde el catálogo. */
const ATRIBUTO_TASA = 'tasa';

/** Ítem del régimen vigente hoy (Lima) según CAT, que es la fecha de emisión. */
export class TasaIgvCatalogo implements TasaIgv {
  constructor(private readonly catalogo: Pick<CatalogoPort, 'validarItem'>) {}

  async vigente(regimen: RegimenIgv): Promise<Decimal> {
    const { valido, atributos } = await this.catalogo.validarItem(CATALOGO_TASA_IGV, regimen);
    const tasa = atributos?.[ATRIBUTO_TASA];
    if (!valido || typeof tasa !== 'string') throw new TasaIgvNoVigenteError(regimen);
    return Decimal.desdeTexto(tasa, ESCALA_TASA, ATRIBUTO_TASA);
  }
}
