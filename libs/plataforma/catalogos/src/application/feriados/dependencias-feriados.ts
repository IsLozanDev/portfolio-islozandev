import { ForbiddenError, type Clock, type EventPublisher, type IdGenerator, type TenantContext, type UnitOfWork } from '@vitrina/plataforma/kernel';
import { FeriadoDuplicadoError, FeriadoNoEncontradoError } from '../../domain/feriados/errores.js';
import { eventoFeriadoActualizado, type AccionFeriado } from '../../domain/feriados/eventos.js';
import type { Feriado } from '../../domain/feriados/feriado.js';
import type { RepositorioFeriados } from '../ports/feriados.js';
import type { VerificadorOperador } from '../ports/verificador-operador.js';

/** Lo que comparten los casos de uso de feriados. */
export interface DependenciasFeriados {
  unidadDeTrabajo: UnitOfWork;
  contexto: TenantContext;
  ids: IdGenerator;
  reloj: Clock;
  eventos: EventPublisher;
  feriados: RepositorioFeriados;
  verificadorOperador: VerificadorOperador;
}

type DependenciasOperador = Pick<DependenciasFeriados, 'verificadorOperador' | 'contexto'>;

/** Sin lanzar el 403: para decidir `editable` o esconder un global como 404. */
export async function esOperador(dependencias: DependenciasOperador): Promise<boolean> {
  try {
    await dependencias.verificadorOperador.exigir(dependencias.contexto.current().tenantId);
    return true;
  } catch (error) {
    if (error instanceof ForbiddenError) return false;
    throw error;
  }
}

/** Un id de otro tenant, o un global fuera del operador: 404, sin decir que existe. */
export async function buscarFeriadoEditable(dependencias: DependenciasFeriados, feriadoId: string): Promise<Feriado> {
  const feriado = await dependencias.feriados.buscar(feriadoId);
  if (!feriado) throw new FeriadoNoEncontradoError();
  if (feriado.esGlobal && !(await esOperador(dependencias))) throw new FeriadoNoEncontradoError();
  return feriado;
}

/** TR-CA-077, en la misma transacción que la escritura. */
export async function exigirSinDuplicado(feriados: RepositorioFeriados, feriado: Feriado, excluirId: string | null): Promise<void> {
  if (await feriados.choca(feriado, excluirId)) throw new FeriadoDuplicadoError();
}

export function guardarFeriado(feriados: RepositorioFeriados, feriado: Feriado, versionAnterior: number | null): Promise<boolean> {
  return feriado.esGlobal ? feriados.guardarGlobal(feriado, versionAnterior) : feriados.guardarDelTenant(feriado, versionAnterior);
}

/** El evento de un global va con el tenant del contexto: el del operador. */
export function publicarFeriado(
  dependencias: DependenciasFeriados,
  cambio: { feriado: Feriado; accion: AccionFeriado; version: number; actorId: string; ahora: Date },
): Promise<void> {
  return dependencias.eventos.publish(
    eventoFeriadoActualizado({ feriado: cambio.feriado, accion: cambio.accion, version: cambio.version, por: cambio.actorId, ahora: cambio.ahora }),
  );
}
