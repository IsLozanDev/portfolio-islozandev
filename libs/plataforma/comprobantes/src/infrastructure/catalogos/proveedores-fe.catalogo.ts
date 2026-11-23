import type { CatalogoPort } from '@vitrina/plataforma/catalogos';
import type { ProveedorFe, ProveedoresFe } from '../../application/ports/proveedores-fe.js';
import { ProveedorFeInvalidoError } from '../../domain/errores.js';

export const CATALOGO_PROVEEDOR_FE = 'PROVEEDOR_FE';
const ATRIBUTO_REQUIERE_CERTIFICADO = 'requiere_certificado';

/** Sobre `CATALOGO_PORT` (TR-RNF-119). Sin el atributo, se exige certificado: es lo seguro. */
export class ProveedoresFeCatalogo implements ProveedoresFe {
  constructor(private readonly catalogo: Pick<CatalogoPort, 'validarItem'>) {}

  async obtener(codigo: string): Promise<ProveedorFe> {
    const resultado = await this.catalogo.validarItem(CATALOGO_PROVEEDOR_FE, codigo);
    if (!resultado.valido) throw new ProveedorFeInvalidoError();
    return { codigo, requiereCertificado: resultado.atributos?.[ATRIBUTO_REQUIERE_CERTIFICADO] !== false };
  }
}
