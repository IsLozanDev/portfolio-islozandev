import { NotFoundError } from '@vitrina/plataforma/kernel';
import type { ConsultarEmpresa } from '@vitrina/plataforma/org';
import type { EmpresaEmisora, EmpresaEmisoraPort } from '../../application/ports/empresa-emisora.port.js';
import { EmpresaNoEncontradaError } from '../../domain/errores.js';

/** Sobre `ConsultarEmpresa` de ORG, que se une a la transacción activa y ve solo el tenant del contexto. */
export class EmpresaEmisoraOrg implements EmpresaEmisoraPort {
  constructor(private readonly consultarEmpresa: Pick<ConsultarEmpresa, 'ejecutar'>) {}

  async obtener(empresaId: string): Promise<EmpresaEmisora> {
    try {
      const empresa = await this.consultarEmpresa.ejecutar(empresaId);
      return {
        id: empresa.id,
        ruc: empresa.ruc,
        activa: empresa.activo,
        razonSocial: empresa.razonSocial,
        nombreComercial: empresa.nombreComercial,
        domicilioFiscal: empresa.direccionFiscal,
        ubigeo: empresa.ubigeo,
      };
    } catch (error) {
      if (error instanceof NotFoundError) throw new EmpresaNoEncontradaError();
      throw error;
    }
  }
}
