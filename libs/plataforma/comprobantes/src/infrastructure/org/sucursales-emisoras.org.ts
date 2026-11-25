import { NotFoundError } from '@vitrina/plataforma/kernel';
import type { ConsultarSucursal, SucursalListada } from '@vitrina/plataforma/org';
import type { SucursalesEmisoras } from '../../application/ports/reglas-emision.js';
import { SucursalNoEncontradaError } from '../../domain/errores.js';

/** Sobre `ConsultarSucursal` de ORG, que se une a la transacción activa y ve solo el tenant del contexto. */
export class SucursalesEmisorasOrg implements SucursalesEmisoras {
  constructor(private readonly consultarSucursal: Pick<ConsultarSucursal, 'ejecutar'>) {}

  async exigirDeLaEmpresa(sucursalId: string, empresaId: string): Promise<void> {
    const sucursal = await this.consultar(sucursalId);
    if (sucursal.empresaId !== empresaId) throw new SucursalNoEncontradaError();
  }

  async codigoEstablecimiento(sucursalId: string): Promise<string | null> {
    const sucursal = await this.consultar(sucursalId);
    return sucursal.codigoEstablecimientoSunat;
  }

  private async consultar(sucursalId: string): Promise<SucursalListada> {
    try {
      return await this.consultarSucursal.ejecutar(sucursalId);
    } catch (error) {
      if (error instanceof NotFoundError) throw new SucursalNoEncontradaError();
      throw error;
    }
  }
}
