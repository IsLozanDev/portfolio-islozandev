import type { ListarSucursales } from '@vitrina/plataforma/org';
import type { EstablecimientoPrincipalPort } from '../../application/ports/empresa-emisora.port.js';

/** ORG lista las sucursales con la principal primero: basta la primera de la primera página. */
const SOLO_LA_PRIMERA = { pagina: 1, tamano: 1, activo: true } as const;

/** Sobre `ListarSucursales` de ORG, que se une a la transacción activa y ve solo el tenant del contexto. */
export class EstablecimientoPrincipalOrg implements EstablecimientoPrincipalPort {
  constructor(private readonly listarSucursales: Pick<ListarSucursales, 'ejecutar'>) {}

  async codigo(empresaId: string): Promise<string | null> {
    const {
      items: [primera],
    } = await this.listarSucursales.ejecutar(empresaId, SOLO_LA_PRIMERA);
    return primera?.esPrincipal ? primera.codigoEstablecimientoSunat : null;
  }
}
