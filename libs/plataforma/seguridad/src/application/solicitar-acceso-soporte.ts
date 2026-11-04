import { NotFoundError, type Clock, type EventPublisher, type IdGenerator, type TenantContext, type UnitOfWork } from '@vitrina/plataforma/kernel';
import { AccesoSoporte, type ModoSoporte } from '../domain/acceso-soporte.js';
import { OperadorRequeridoError, SoporteAbiertoExistenteError, SoporteAgenteEsMiembroError } from '../domain/errores.js';
import type { RepositorioAccesosSoporte } from './ports/acceso-soporte.repositorio.js';
import type { AccesoDelAgente, LecturaSoporte } from './ports/lectura-soporte.js';
import type { BitacoraSeguridad, RepositorioMembresias } from './ports/repositorios.js';
import type { TenantsSoporte } from './ports/tenants-soporte.port.js';
import type { VerificadorTicket } from './ports/verificador-ticket.port.js';
import { publicarEventos } from './publicar-eventos.js';

export interface SolicitarAccesoSoporteComando {
  /** Tenant del cliente al que se pide entrar. */
  tenantId: string;
  ticket: string;
  motivo: string;
  modo: ModoSoporte;
  horas: number;
  agenteId: string;
  /** Tenant del token del agente: debe ser el operador. */
  tenantActual: string;
  ip?: string | null;
}

export interface DependenciasSolicitudSoporte {
  unidadDeTrabajo: UnitOfWork;
  contexto: TenantContext;
  ids: IdGenerator;
  reloj: Clock;
  eventos: EventPublisher;
  accesos: RepositorioAccesosSoporte;
  membresias: RepositorioMembresias;
  bitacora: BitacoraSeguridad;
  tenants: TenantsSoporte;
  verificador: VerificadorTicket;
  /** Código del tenant operador (ORG_TENANT_OPERADOR). */
  tenantOperador: string;
}

/** El agente, desde el tenant operador, pide entrar al de un cliente (TR-RF-020 paso 1). */
export class SolicitarAccesoSoporte {
  constructor(private readonly dependencias: DependenciasSolicitudSoporte) {}

  async ejecutar(comando: SolicitarAccesoSoporteComando): Promise<{ id: string }> {
    const { contexto, unidadDeTrabajo, ids, reloj, verificador } = this.dependencias;
    await this.exigirOperador(comando.tenantActual);
    const acceso = AccesoSoporte.solicitar(ids.next(), comando, reloj.now());
    await verificador.verificar({ ticket: acceso.ticket, tenantId: comando.tenantId, agenteId: comando.agenteId });

    // La solicitud vive en el tenant del cliente: allí la ve y la aprueba su administrador.
    return contexto.run({ tenantId: comando.tenantId }, () =>
      unidadDeTrabajo.run(async () => {
        await this.exigirTenantDestino(comando.tenantId);
        await this.exigirQueNoSeaMiembro(comando.agenteId);
        await this.guardar(acceso, comando.ip ?? null);
        return { id: acceso.id };
      }),
    );
  }

  private async exigirOperador(tenantActual: string): Promise<void> {
    const { contexto, unidadDeTrabajo, tenants, tenantOperador } = this.dependencias;
    const codigo = await contexto.run({ tenantId: tenantActual }, () => unidadDeTrabajo.run(() => tenants.codigoDel(tenantActual)));
    if (codigo !== tenantOperador) throw new OperadorRequeridoError();
  }

  private async exigirTenantDestino(tenantId: string): Promise<void> {
    if ((await this.dependencias.tenants.codigoDel(tenantId)) === null) throw new NotFoundError('El tenant no existe');
  }

  /** Un acceso abierto se rechaza primero; una membresía que no vino de un acceso de soporte es de un miembro. */
  private async exigirQueNoSeaMiembro(agenteId: string): Promise<void> {
    const { accesos, membresias } = this.dependencias;
    if (await accesos.abiertoDe(agenteId)) throw new SoporteAbiertoExistenteError();
    const membresia = await membresias.deUsuario(agenteId);
    if (membresia && !(await accesos.existeConMembresia(membresia.id))) throw new SoporteAgenteEsMiembroError();
  }

  private async guardar(acceso: AccesoSoporte, ip: string | null): Promise<void> {
    const { accesos, bitacora, eventos } = this.dependencias;
    await accesos.guardar(acceso);
    await bitacora.registrar(
      'ACCESO_SOPORTE',
      acceso.agenteId,
      { accion: 'SOLICITADO', acceso_id: acceso.id, ticket: acceso.ticket, modo: acceso.modo, horas: acceso.horasSolicitadas },
      ip,
    );
    await publicarEventos(eventos, acceso);
  }
}

/** Los accesos del agente en todos los tenants, sin transacción (función SECURITY DEFINER). */
export class ListarMisAccesosSoporte {
  constructor(private readonly lectura: Pick<LecturaSoporte, 'deAgente'>) {}

  ejecutar(agenteId: string): Promise<AccesoDelAgente[]> {
    return this.lectura.deAgente(agenteId);
  }
}
