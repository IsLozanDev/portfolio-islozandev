import { NotFoundError } from '@vitrina/plataforma/kernel';
import type { ConsultarEmpresa, EmpresaListada, ListarEmpresas } from '@vitrina/plataforma/org';
import type { EmpresaEmisora, EmpresaEmisoraPort } from '../../application/ports/empresa-emisora.port.js';
import { EmpresaNoEncontradaError } from '../../domain/errores.js';

/** Un tenant tiene pocas empresas: la lista de emisores no pagina. */
export const LIMITE_EMPRESAS_EMISORAS = 100;
const PRIMERA_PAGINA = 1;

/** Sobre `ConsultarEmpresa` y `ListarEmpresas` de ORG, que se unen a la transacción activa y ven solo el tenant del contexto. */
export class EmpresaEmisoraOrg implements EmpresaEmisoraPort {
  constructor(
    private readonly consultarEmpresa: Pick<ConsultarEmpresa, 'ejecutar'>,
    private readonly listarEmpresas: Pick<ListarEmpresas, 'ejecutar'>,
  ) {}

  async obtener(empresaId: string): Promise<EmpresaEmisora> {
    try {
      return empresaEmisoraDe(await this.consultarEmpresa.ejecutar(empresaId));
    } catch (error) {
      if (error instanceof NotFoundError) throw new EmpresaNoEncontradaError();
      throw error;
    }
  }

  async listarActivas(): Promise<EmpresaEmisora[]> {
    const listado = await this.listarEmpresas.ejecutar({ activo: true, pagina: PRIMERA_PAGINA, tamano: LIMITE_EMPRESAS_EMISORAS });
    return listado.items.map(empresaEmisoraDe);
  }
}

function empresaEmisoraDe(empresa: EmpresaListada): EmpresaEmisora {
  return {
    id: empresa.id,
    ruc: empresa.ruc,
    activa: empresa.activo,
    razonSocial: empresa.razonSocial,
    nombreComercial: empresa.nombreComercial,
    domicilioFiscal: empresa.direccionFiscal,
    ubigeo: empresa.ubigeo,
  };
}
