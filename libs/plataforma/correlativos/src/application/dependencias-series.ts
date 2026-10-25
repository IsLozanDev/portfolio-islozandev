import type { Clock, EventPublisher, IdGenerator, TenantContext, UnitOfWork } from '@vitrina/plataforma/kernel';
import { ActorSinAlcanceError, type AlcanceActor, type DestinoAlcance } from '@vitrina/plataforma/seguridad';
import type { AmbitoSerie } from '../domain/ambito-serie.js';
import type { RepositorioSeries, UbicacionesSerie } from './ports/repositorios.js';

/** Lo que comparten CrearSerie y CambiarEstadoSerie. */
export interface DependenciasSeries {
  unidadDeTrabajo: UnitOfWork;
  contexto: TenantContext;
  ids: IdGenerator;
  reloj: Clock;
  eventos: EventPublisher;
  series: RepositorioSeries;
  ubicaciones: UbicacionesSerie;
  alcanceActor: AlcanceActor;
}

/** Con sucursal, el actor debe cubrir esa sucursal; sin ella, la empresa. La unidad no acota más. */
export function destinoDe(ambito: AmbitoSerie): DestinoAlcance {
  if (ambito.sucursalId === null) return { alcance: 'EMPRESA', empresaId: ambito.empresaId, sucursalId: null };
  return { alcance: 'SUCURSAL', empresaId: null, sucursalId: ambito.sucursalId };
}

export async function exigirAlcance(alcanceActor: AlcanceActor, actorId: string, ambito: AmbitoSerie, ahora: Date): Promise<void> {
  if (!(await alcanceActor.cubre(actorId, destinoDe(ambito), ahora))) throw new ActorSinAlcanceError();
}
