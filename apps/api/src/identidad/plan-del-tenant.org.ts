import { esPlanCuota, planMasAlto, type PlanCuota, type PlanDelTenant } from '@vitrina/plataforma/identidad';
import type { RepositorioSuscripciones } from '@vitrina/plataforma/org';

/**
 * Spec 29: la cuota de idn sigue el plan más alto entre las suscripciones PRUEBA o ACTIVA del tenant del
 * contexto. Vive aquí porque idn no importa org (PL-10).
 */
export class PlanDelTenantOrg implements PlanDelTenant {
  constructor(private readonly suscripciones: Pick<RepositorioSuscripciones, 'listar'>) {}

  async planVigente(): Promise<PlanCuota> {
    const vigentes = (await this.suscripciones.listar()).filter((suscripcion) => suscripcion.vigente);
    return planMasAlto(vigentes.map((suscripcion) => suscripcion.datos.plan).filter(esPlanCuota));
  }
}
