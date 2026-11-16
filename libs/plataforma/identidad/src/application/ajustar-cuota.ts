import type { Clock, EventPublisher, TenantContext, UnitOfWork } from '@vitrina/plataforma/kernel';
import { validarAjuste } from '../domain/ajuste-cuota.js';
import type { EstadoCuota } from '../domain/estado-cuota.js';
import { eventoCuotaAjustada } from '../domain/eventos-idn.js';
import { periodoDe, type Periodo } from '../domain/periodo.js';
import type { ControlCuota } from './control-cuota.js';
import type { RepositorioCuotas, VerificadorOperador } from './ports/cuotas.js';

export interface DependenciasAjusteCuota {
  unidadDeTrabajo: UnitOfWork;
  contexto: TenantContext;
  reloj: Clock;
  verificador: VerificadorOperador;
  repositorio: Pick<RepositorioCuotas, 'buscar' | 'guardarIncluidas'>;
  control: Pick<ControlCuota, 'abrirPeriodo'>;
  publicador: EventPublisher;
}

export interface ComandoAjustarCuota {
  tenantId: string;
  periodo: Periodo;
  incluidas: number;
  /** La que leyó el operador; se ignora si la cuota no existía y se abre ahora. */
  version: number;
  actorId: string;
}

/**
 * Operador: cambia las incluidas de un periodo (solo ese mes). Corre en el contexto del tenant de la cuota, como
 * ProcesarVencimientosTenant: la RLS y el outbox quedan en ese tenant y el actor sigue siendo el operador.
 */
export class AjustarCuota {
  constructor(private readonly dependencias: DependenciasAjusteCuota) {}

  async ejecutar(comando: ComandoAjustarCuota): Promise<EstadoCuota> {
    const { verificador, contexto, unidadDeTrabajo } = this.dependencias;
    await verificador.exigir();
    return contexto.run({ tenantId: comando.tenantId, actorId: comando.actorId }, () => unidadDeTrabajo.run(() => this.ajustar(comando)));
  }

  private async ajustar({ tenantId, periodo, incluidas, version, actorId }: ComandoAjustarCuota): Promise<EstadoCuota> {
    const { repositorio, reloj, publicador } = this.dependencias;
    const existente = await repositorio.buscar(tenantId, periodo);
    validarAjuste({ incluidasNuevas: incluidas, consumidas: existente?.consumidas ?? 0, periodo, periodoActual: periodoDe(reloj.now()) });

    const cuota = existente ?? (await this.abrir(tenantId, periodo));
    const versionEsperada = existente ? version : cuota.version;
    await repositorio.guardarIncluidas(tenantId, periodo, incluidas, versionEsperada);

    const ajustada = { ...cuota, incluidas, version: versionEsperada + 1 };
    await publicador.publish(eventoCuotaAjustada(ajustada, cuota.incluidas, actorId, reloj.now()));
    return ajustada;
  }

  /** Mes actual o futuro sin fila: se abre con las incluidas de su plan y el ajuste la deja en las pedidas. */
  private async abrir(tenantId: string, periodo: Periodo): Promise<EstadoCuota> {
    const { control, repositorio } = this.dependencias;
    await control.abrirPeriodo(tenantId, periodo);
    const abierta = await repositorio.buscar(tenantId, periodo);
    if (!abierta) throw new Error(`La cuota ${periodo} no quedó abierta`);
    return abierta;
  }
}
