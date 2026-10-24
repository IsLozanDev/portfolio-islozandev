import { NotFoundError, type Clock, type EventPublisher, type UnitOfWork } from '@vitrina/plataforma/kernel';
import type { Asignacion } from '../domain/asignacion.js';
import { ActorSinAlcanceError, ConfirmacionRequeridaError, PropietarioUnicoError } from '../domain/errores.js';
import type { EstadoMembresia, Membresia } from '../domain/membresia.js';
import { motivo as validarMotivo } from '../domain/texto.js';
import { actorCubre } from './alcance-actor.js';
import { fechaLocal } from './otorgar-asignacion.js';
import type {
  BitacoraSeguridad,
  MembresiasLectura,
  RepositorioAsignaciones,
  RepositorioInvitaciones,
  RepositorioMembresias,
  UbicacionesOrg,
} from './ports/repositorios.js';
import { publicarEventos } from './publicar-eventos.js';

export interface CicloRepos {
  ciclo: RepositorioMembresias;
  membresias: MembresiasLectura;
  asignaciones: RepositorioAsignaciones;
  invitaciones: RepositorioInvitaciones;
  ubicaciones: UbicacionesOrg;
  bitacora: BitacoraSeguridad;
}

/** TR-RNF-021: acción destructiva con confirmación explícita y motivo. */
export interface AccionConMotivo {
  motivo: string;
  confirmar: boolean;
  /** Usuario que ejecuta (sub del token). */
  actorId: string;
}

export interface AccionMembresiaComando extends AccionConMotivo {
  membresiaId: string;
}

export interface RevocarAsignacionComando extends AccionConMotivo {
  asignacionId: string;
}

type Accion = 'SUSPENDER' | 'REACTIVAR' | 'FINALIZAR';

/** Base de suspender, reactivar y finalizar (TR-RF-014). */
abstract class CambioMembresia {
  constructor(
    protected readonly uow: UnitOfWork,
    protected readonly reloj: Clock,
    protected readonly eventos: EventPublisher,
    protected readonly repos: CicloRepos,
  ) {}

  protected abstract readonly accion: Accion;

  /** Aplica la transición y devuelve las asignaciones que cambió (solo finalizar). */
  protected abstract aplicar(m: Membresia, motivo: string, actorId: string, ahora: Date): Promise<Asignacion[]>;

  protected async cambiar(c: AccionMembresiaComando): Promise<{ estado: EstadoMembresia; asignacionesRevocadas: string[] }> {
    if (c.confirmar !== true) throw new ConfirmacionRequeridaError();
    const motivo = validarMotivo(c.motivo);

    return this.uow.run(async () => {
      const ahora = this.reloj.now();
      const membresia = await this.repos.ciclo.buscar(c.membresiaId);
      if (!membresia) throw new NotFoundError('La membresía no existe');

      // No revocadas y no solo vigentes: una asignación futura en otra sucursal también acota al actor.
      const destinos = await Promise.all(
        (await this.repos.asignaciones.noRevocadasDe(membresia.id)).map((a) => this.repos.ubicaciones.resolver(a.ubicacion)),
      );
      if (!(await actorCubre(this.repos, c.actorId, destinos, fechaLocal(ahora)))) throw new ActorSinAlcanceError();

      // TR-RN-010. FOR UPDATE: dos propietarios que se sacan a la vez no dejan el tenant sin ninguno.
      if (this.accion !== 'REACTIVAR' && membresia.esPropietario && membresia.estado === 'ACTIVO') {
        const otros = (await this.repos.ciclo.propietariosActivosParaActualizar()).filter((id) => id !== membresia.id);
        if (otros.length === 0) throw new PropietarioUnicoError();
      }

      const revocadas = await this.aplicar(membresia, motivo, c.actorId, ahora);
      await this.repos.ciclo.guardar(membresia);
      for (const a of revocadas) await this.repos.asignaciones.guardar(a);

      await this.repos.bitacora.registrar(this.accion === 'REACTIVAR' ? 'ASIGNACION_OTORGADA' : 'ASIGNACION_REVOCADA', c.actorId, {
        accion: this.accion,
        motivo,
        membresia_id: membresia.id,
        usuario_destino: membresia.usuarioId,
        ...(revocadas.length > 0 ? { asignaciones_revocadas: revocadas.map((a) => a.id) } : {}),
      });
      await publicarEventos(this.eventos, membresia, ...revocadas);
      return { estado: membresia.estado, asignacionesRevocadas: revocadas.map((a) => a.id) };
    });
  }
}

export class SuspenderMembresia extends CambioMembresia {
  protected readonly accion = 'SUSPENDER';

  async ejecutar(c: AccionMembresiaComando): Promise<{ estado: EstadoMembresia }> {
    const { estado } = await this.cambiar(c);
    return { estado };
  }

  protected async aplicar(m: Membresia, motivo: string, actorId: string, ahora: Date): Promise<Asignacion[]> {
    m.suspender(motivo, actorId, ahora);
    return [];
  }
}

export class ReactivarMembresia extends CambioMembresia {
  protected readonly accion = 'REACTIVAR';

  async ejecutar(c: AccionMembresiaComando): Promise<{ estado: EstadoMembresia }> {
    const { estado } = await this.cambiar(c);
    return { estado };
  }

  protected async aplicar(m: Membresia, motivo: string, actorId: string, ahora: Date): Promise<Asignacion[]> {
    m.reactivar(motivo, actorId, ahora);
    return [];
  }
}

/** Revoca todas las asignaciones y anula la invitación pendiente: un reingreso no revive accesos viejos. */
export class FinalizarMembresia extends CambioMembresia {
  protected readonly accion = 'FINALIZAR';

  async ejecutar(c: AccionMembresiaComando): Promise<{ estado: EstadoMembresia; asignacionesRevocadas: string[] }> {
    return this.cambiar(c);
  }

  protected async aplicar(m: Membresia, motivo: string, actorId: string, ahora: Date): Promise<Asignacion[]> {
    const revocadas = await this.repos.asignaciones.noRevocadasDe(m.id);
    m.finalizar(
      motivo,
      actorId,
      ahora,
      revocadas.map((a) => a.id),
    );
    for (const a of revocadas) a.revocar(motivo, actorId, ahora);

    const pendiente = await this.repos.invitaciones.pendienteDe(m.id);
    if (pendiente) {
      pendiente.anular(ahora);
      await this.repos.invitaciones.guardar(pendiente);
    }
    return revocadas;
  }
}

/** Quita una asignación sin tocar la membresía ni las demás asignaciones. */
export class RevocarAsignacion {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly reloj: Clock,
    private readonly eventos: EventPublisher,
    private readonly repos: CicloRepos,
  ) {}

  async ejecutar(c: RevocarAsignacionComando): Promise<{ revocadaEn: Date }> {
    if (c.confirmar !== true) throw new ConfirmacionRequeridaError();
    const motivo = validarMotivo(c.motivo);

    return this.uow.run(async () => {
      const ahora = this.reloj.now();
      const asignacion = await this.repos.asignaciones.buscar(c.asignacionId);
      if (!asignacion) throw new NotFoundError('La asignación no existe');
      const destino = await this.repos.ubicaciones.resolver(asignacion.ubicacion);
      if (!(await actorCubre(this.repos, c.actorId, [destino], fechaLocal(ahora)))) throw new ActorSinAlcanceError();

      asignacion.revocar(motivo, c.actorId, ahora);
      await this.repos.asignaciones.guardar(asignacion);
      await this.repos.bitacora.registrar('ASIGNACION_REVOCADA', c.actorId, {
        accion: 'REVOCAR',
        motivo,
        asignacion_id: asignacion.id,
        membresia_id: asignacion.membresiaId,
      });
      await publicarEventos(this.eventos, asignacion);
      return { revocadaEn: ahora };
    });
  }
}
