import type { CatalogoPort } from '@vitrina/plataforma/catalogos';
import type { IdentidadPort } from '@vitrina/plataforma/identidad';
import type { Clock, EventPublisher, IdGenerator, TenantContext, UnitOfWork } from '@vitrina/plataforma/kernel';
import type { Persona } from '../domain/persona.js';
import type { RepositorioPersonas } from './ports/repositorio-personas.js';
import type { SuscripcionesDelTenant } from './ports/suscripciones-del-tenant.js';

export interface DependenciasPersonas {
  unidadDeTrabajo: UnitOfWork;
  contexto: TenantContext;
  reloj: Clock;
  ids: IdGenerator;
  publicador: EventPublisher;
  personas: RepositorioPersonas;
  suscripciones: SuscripcionesDelTenant;
  catalogo: Pick<CatalogoPort, 'validarItem'>;
  identidad: Pick<IdentidadPort, 'consultar'>;
}

/** Los eventos van al outbox en la misma transacción que guardó a la persona (regla 4). */
export async function publicarEventosDe(publicador: EventPublisher, persona: Persona): Promise<void> {
  for (const evento of persona.pullEvents()) await publicador.publish(evento);
}
