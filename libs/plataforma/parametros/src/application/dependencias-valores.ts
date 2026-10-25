import type { Clock, EventPublisher, IdGenerator, TenantContext, UnitOfWork } from '@vitrina/plataforma/kernel';
import { ActorSinAlcanceError, type AlcanceActor } from '@vitrina/plataforma/seguridad';
import type { DefinicionParametro } from '../domain/definicion-parametro.js';
import { ParametroNoDefinidoError } from '../domain/errores.js';
import type { AmbitoValor } from '../domain/tipos.js';
import type { ValidadorEsquema } from '../domain/validador-esquema.js';
import type { LecturaDefiniciones, RepositorioValores, ResolucionSql } from './ports/repositorios.js';

/** Lo que comparten FijarValor y RestablecerValor. */
export interface DependenciasValores {
  unidadDeTrabajo: UnitOfWork;
  contexto: TenantContext;
  ids: IdGenerator;
  reloj: Clock;
  eventos: EventPublisher;
  definiciones: LecturaDefiniciones;
  valores: RepositorioValores;
  resolucion: ResolucionSql;
  alcanceActor: AlcanceActor;
  esquemas: ValidadorEsquema;
}

export async function exigirDefinicion(definiciones: LecturaDefiniciones, codigo: string): Promise<DefinicionParametro> {
  const definicion = await definiciones.buscar(codigo);
  if (!definicion) throw new ParametroNoDefinidoError(codigo);
  return definicion;
}

/** El actor debe cubrir el nivel que toca (TR-RF-031): propietario, o asignación que lo contenga. */
export async function exigirAlcance(alcanceActor: AlcanceActor, actorId: string, ambito: AmbitoValor, ahora: Date): Promise<void> {
  if (!(await alcanceActor.cubre(actorId, ambito, ahora))) throw new ActorSinAlcanceError();
}
