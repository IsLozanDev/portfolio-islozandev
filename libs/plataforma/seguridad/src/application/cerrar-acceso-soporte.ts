import type { Clock, EventPublisher, TenantContext, UnitOfWork } from '@vitrina/plataforma/kernel';
import { ticketSoporte, type AccesoSoporte } from '../domain/acceso-soporte.js';
import { ConfirmacionRequeridaError, SoporteNoEncontradoError } from '../domain/errores.js';
import type { RepositorioAccesosSoporte } from './ports/acceso-soporte.repositorio.js';
import type { BitacoraSeguridad, RepositorioAsignaciones, RepositorioMembresias } from './ports/repositorios.js';
import { publicarEventos } from './publicar-eventos.js';

/** Motivo con el que el sistema cierra los accesos de un ticket cerrado en TR-SOP (TR-CA-055). */
export const MOTIVO_TICKET_CERRADO = 'Ticket de soporte cerrado';

export interface DependenciasCierreSoporte {
  unidadDeTrabajo: UnitOfWork;
  contexto: TenantContext;
  reloj: Clock;
  eventos: EventPublisher;
  accesos: RepositorioAccesosSoporte;
  membresias: RepositorioMembresias;
  asignaciones: RepositorioAsignaciones;
  bitacora: BitacoraSeguridad;
}

export interface CierreDeAcceso {
  accesoId: string;
  motivo: string;
  /** Quien rechaza o revoca. */
  actorId: string;
  ip?: string | null;
}

export interface RevocacionDeAcceso extends CierreDeAcceso {
  confirmar: boolean;
}

export async function cargarAcceso(accesos: RepositorioAccesosSoporte, accesoId: string): Promise<AccesoSoporte> {
  const acceso = await accesos.buscar(accesoId);
  if (!acceso) throw new SoporteNoEncontradoError();
  return acceso;
}

/**
 * Quita al agente del tenant: revoca su asignación y finaliza su membresía, en la transacción activa.
 * Lo usan revocar, cerrar por ticket y vencer. `por` es NULL cuando actúa el sistema.
 */
export async function liberarAgente(
  dependencias: Pick<DependenciasCierreSoporte, 'membresias' | 'asignaciones' | 'eventos'>,
  acceso: AccesoSoporte,
  motivo: string,
  por: string | null,
  ahora: Date,
): Promise<void> {
  const { membresias, asignaciones, eventos } = dependencias;
  const asignacion = acceso.asignacionId ? await asignaciones.buscar(acceso.asignacionId) : null;
  const revocadas: string[] = [];
  if (asignacion && asignacion.revocadaEn === null) {
    asignacion.revocar(motivo, por, ahora);
    await asignaciones.guardar(asignacion);
    revocadas.push(asignacion.id);
  }
  const membresia = acceso.membresiaId ? await membresias.buscar(acceso.membresiaId) : null;
  if (membresia && membresia.estado === 'ACTIVO') {
    membresia.finalizar(motivo, por, ahora, revocadas);
    await membresias.guardar(membresia);
  }
  await publicarEventos(eventos, ...(asignacion ? [asignacion] : []), ...(membresia ? [membresia] : []));
}

/** Fila ACCESO_SOPORTE de un cierre en la bitácora del tenant del cliente. */
export async function registrarCierre(bitacora: BitacoraSeguridad, acceso: AccesoSoporte, por: string | null, ip: string | null): Promise<void> {
  const accion = acceso.estado === 'RECHAZADO' ? 'RECHAZADO' : 'REVOCADO';
  await bitacora.registrar('ACCESO_SOPORTE', por, { accion, acceso_id: acceso.id, ticket: acceso.ticket, causa: acceso.causaCierre }, ip);
}

/** El administrador del cliente rechaza una solicitud pendiente con motivo. */
export class RechazarAccesoSoporte {
  constructor(private readonly dependencias: DependenciasCierreSoporte) {}

  ejecutar(cierre: CierreDeAcceso): Promise<void> {
    const { unidadDeTrabajo, accesos, reloj, bitacora, eventos } = this.dependencias;
    return unidadDeTrabajo.run(async () => {
      const acceso = await cargarAcceso(accesos, cierre.accesoId);
      acceso.rechazar(cierre.motivo, cierre.actorId, reloj.now());
      await accesos.guardar(acceso);
      await registrarCierre(bitacora, acceso, cierre.actorId, cierre.ip ?? null);
      await publicarEventos(eventos, acceso);
    });
  }
}

/** El administrador del cliente corta un acceso vigente (TR-RNF-021: confirmación y motivo). */
export class RevocarAccesoSoporte {
  constructor(private readonly dependencias: DependenciasCierreSoporte) {}

  async ejecutar(revocacion: RevocacionDeAcceso): Promise<void> {
    if (revocacion.confirmar !== true) throw new ConfirmacionRequeridaError();
    const { unidadDeTrabajo, accesos, reloj, bitacora, eventos } = this.dependencias;
    return unidadDeTrabajo.run(async () => {
      const ahora = reloj.now();
      const acceso = await cargarAcceso(accesos, revocacion.accesoId);
      acceso.revocar('ADMINISTRADOR', revocacion.motivo, revocacion.actorId, ahora);
      await accesos.guardar(acceso);
      await liberarAgente(this.dependencias, acceso, revocacion.motivo, revocacion.actorId, ahora);
      await registrarCierre(bitacora, acceso, revocacion.actorId, revocacion.ip ?? null);
      await publicarEventos(eventos, acceso);
    });
  }
}

/**
 * TR-SOP lo llama al cerrar un ticket (TR-CA-055): revoca los aprobados y rechaza los pendientes del
 * ticket, sin actor. Idempotente: sin accesos abiertos no hace nada. Sin HTTP en este spec.
 */
export class RevocarAccesosPorTicket {
  constructor(private readonly dependencias: DependenciasCierreSoporte) {}

  ejecutar(tenantId: string, ticket: string): Promise<{ cerrados: number }> {
    const { contexto, unidadDeTrabajo, accesos, reloj, bitacora, eventos } = this.dependencias;
    const codigo = ticketSoporte(ticket);
    return contexto.run({ tenantId }, () =>
      unidadDeTrabajo.run(async () => {
        const ahora = reloj.now();
        const abiertos = await accesos.abiertosPorTicket(codigo);
        for (const acceso of abiertos) {
          const estabaAprobado = acceso.estado === 'APROBADO';
          acceso.revocar('TICKET_CERRADO', MOTIVO_TICKET_CERRADO, null, ahora);
          await accesos.guardar(acceso);
          if (estabaAprobado) await liberarAgente(this.dependencias, acceso, MOTIVO_TICKET_CERRADO, null, ahora);
          await registrarCierre(bitacora, acceso, null, null);
          await publicarEventos(eventos, acceso);
        }
        return { cerrados: abiertos.length };
      }),
    );
  }
}
