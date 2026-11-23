import type { ProductoCodigo, RepositorioSuscripciones } from '@vitrina/plataforma/org';
import type { SuscripcionesDelTenant } from '../application/ports/suscripciones-del-tenant.js';

/** Lee la suscripción del tenant del contexto con el repositorio de ORG, dentro de la transacción activa. */
export class SuscripcionesDelTenantOrg implements SuscripcionesDelTenant {
  constructor(private readonly suscripciones: Pick<RepositorioSuscripciones, 'buscar' | 'listar'>) {}

  async estaVigente(productoCodigo: ProductoCodigo): Promise<boolean> {
    const suscripcion = await this.suscripciones.buscar(productoCodigo);
    return suscripcion?.vigente ?? false;
  }

  async listarVigentes(): Promise<ProductoCodigo[]> {
    const suscripciones = await this.suscripciones.listar();
    return suscripciones.filter((suscripcion) => suscripcion.vigente).map((suscripcion) => suscripcion.productoCodigo);
  }
}
