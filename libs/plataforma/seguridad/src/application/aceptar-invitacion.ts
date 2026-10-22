import { createHash } from 'node:crypto';
import { NotFoundError, type Clock, type EventPublisher, type TenantContext, type UnitOfWork } from '@vitrina/plataforma/kernel';
import { InvitacionExpiradaError, InvitacionNoDisponibleError, InvitacionNoEncontradaError, InvitacionOtroCorreoError } from '../domain/errores.js';
import type { EstadoInvitacion } from '../domain/invitacion.js';
import type {
  BitacoraSeguridad,
  InvitacionResuelta,
  RepositorioInvitaciones,
  RepositorioMembresias,
  UsuariosIdentidad,
} from './ports/repositorios.js';
import { publicarEventos } from './publicar-eventos.js';

// El token solo viaja en el enlace; la base guarda su sha256.
const hashDe = (token: string): string => createHash('sha256').update(token).digest('hex');

function estadoDe(r: InvitacionResuelta, ahora: Date): EstadoInvitacion {
  if (r.anuladaEn !== null) return 'ANULADA';
  if (r.usadaEn !== null) return 'USADA';
  return ahora.getTime() >= r.expiraEn.getTime() ? 'EXPIRADA' : 'VIGENTE';
}

/** 410 si venció (TR-CA-029); 409 si ya se usó o se anuló. */
function exigirVigente(estado: EstadoInvitacion): void {
  if (estado === 'EXPIRADA') throw new InvitacionExpiradaError();
  if (estado !== 'VIGENTE') throw new InvitacionNoDisponibleError(estado);
}

export interface InvitacionConsultada {
  estado: 'VIGENTE';
  tenantNombre: string;
  expiraEn: Date;
}

/** Lo que ve la página pública antes de iniciar sesión. Sin el correo invitado. */
export class ConsultarInvitacion {
  constructor(
    private readonly invitaciones: Pick<RepositorioInvitaciones, 'porToken'>,
    private readonly reloj: Clock,
  ) {}

  async ejecutar(token: string): Promise<InvitacionConsultada> {
    const r = await this.invitaciones.porToken(hashDe(token));
    if (!r) throw new InvitacionNoEncontradaError();
    exigirVigente(estadoDe(r, this.reloj.now()));
    return { estado: 'VIGENTE', tenantNombre: r.tenantNombre, expiraEn: r.expiraEn };
  }
}

export interface AceptarInvitacionComando {
  token: string;
  /** `sub` del token: el usuario que inició sesión con el enlace o por su cuenta. */
  usuarioId: string;
}

export interface InvitacionAceptada {
  tenantId: string;
  membresiaId: string;
  /** El cliente hace `refreshSession()` y el hook pone `tenant_id` (PL-06). */
  refrescarSesion: true;
}

export interface AceptacionRepos {
  invitaciones: RepositorioInvitaciones;
  ciclo: RepositorioMembresias;
  usuarios: UsuariosIdentidad;
  bitacora: BitacoraSeguridad;
}

/** TR-RF-010. El invitado aún no tiene tenant en el token: el tenant sale de la invitación. */
export class AceptarInvitacion {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly contexto: TenantContext,
    private readonly reloj: Clock,
    private readonly eventos: EventPublisher,
    private readonly repos: AceptacionRepos,
  ) {}

  async ejecutar({ token, usuarioId }: AceptarInvitacionComando): Promise<InvitacionAceptada> {
    const r = await this.repos.invitaciones.porToken(hashDe(token));
    if (!r) throw new InvitacionNoEncontradaError();

    return this.contexto.run({ tenantId: r.tenantId }, () =>
      this.uow.run(async () => {
        const ahora = this.reloj.now();
        const invitacion = await this.repos.invitaciones.buscar(r.invitacionId);
        const membresia = await this.repos.ciclo.buscar(r.membresiaId);
        if (!invitacion || !membresia) throw new NotFoundError('La invitación no existe');

        exigirVigente(invitacion.estado(ahora));
        // La invitación nació ligada al usuario de ese correo: otro correo es otro sub (TR-CA-030).
        if (membresia.usuarioId !== usuarioId) throw new InvitacionOtroCorreoError();

        invitacion.usar(ahora);
        membresia.aceptar(ahora);
        await this.repos.invitaciones.guardar(invitacion);
        await this.repos.ciclo.guardar(membresia);
        await this.repos.usuarios.fijarTenantPreferido(usuarioId, r.tenantId);
        // El acceso empieza aquí (SRS, TR-RF-010 paso 5).
        await this.repos.bitacora.registrar('ASIGNACION_OTORGADA', usuarioId, {
          origen: 'INVITACION',
          membresia_id: membresia.id,
          invitacion_id: invitacion.id,
        });
        await publicarEventos(this.eventos, membresia);
        return { tenantId: r.tenantId, membresiaId: membresia.id, refrescarSesion: true as const };
      }),
    );
  }
}
