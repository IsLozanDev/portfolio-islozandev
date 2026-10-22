import { createHash, randomBytes } from 'node:crypto';
import {
  ConflictError,
  NotFoundError,
  ValidationError,
  type Clock,
  type EventPublisher,
  type IdGenerator,
  type TenantContext,
  type UnitOfWork,
} from '@vitrina/plataforma/kernel';
import type { Ambito } from '../domain/alcance.js';
import { Asignacion, type DatosAsignacion } from '../domain/asignacion.js';
import { AlcanceSuperiorError, IdentidadNoDisponibleError, LimiteUsuariosError, MembresiaExistenteError, MfaRequeridaError } from '../domain/errores.js';
import { Invitacion } from '../domain/invitacion.js';
import { Membresia } from '../domain/membresia.js';
import type { PermisoCatalogo, Rol } from '../domain/rol.js';
import { textoRequerido } from '../domain/texto.js';
import { actorCubre } from './alcance-actor.js';
import { fechaLocal, type Otorgante } from './otorgar-asignacion.js';
import type { ProveedorIdentidad } from './ports/proveedor-identidad.port.js';
import type {
  BitacoraSeguridad,
  CatalogoPermisos,
  LimitesPlan,
  MembresiasLectura,
  RepositorioAsignaciones,
  RepositorioInvitaciones,
  RepositorioMembresias,
  RepositorioPerfiles,
  RepositorioRoles,
  UbicacionesOrg,
  UsuariosIdentidad,
} from './ports/repositorios.js';
import { publicarEventos } from './publicar-eventos.js';

export interface InvitarUsuarioComando extends Omit<DatosAsignacion, 'membresiaId' | 'vigenteDesde'> {
  correo: string;
  nombre: string;
  otorgante: Otorgante;
}

export interface InvitacionEmitida {
  membresiaId: string;
  invitacionId: string;
  expiraEn: Date;
  usuarioNuevo: boolean;
  /** false si el enlace a un usuario existente no salió; se reenvía invitando otra vez. */
  correoEnviado: boolean;
}

export interface InvitacionRepos {
  membresias: MembresiasLectura;
  ciclo: RepositorioMembresias;
  invitaciones: RepositorioInvitaciones;
  usuarios: UsuariosIdentidad;
  limites: LimitesPlan;
  asignaciones: RepositorioAsignaciones;
  roles: RepositorioRoles;
  perfiles: RepositorioPerfiles;
  catalogo: CatalogoPermisos;
  ubicaciones: UbicacionesOrg;
  bitacora: BitacoraSeguridad;
}

export interface OpcionesInvitacion {
  /** Página de aceptación (spec 14); el token va en `?token=`. */
  urlInvitacion: string;
  horas: number;
  mfaMaxEdadSeg: number;
}

const CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MOTIVO_REINVITACION = 'Reinvitación';

/**
 * TR-RF-009. Supabase se llama fuera de la transacción: antes, para crear un usuario nuevo (si
 * falla no se escribe nada); después del commit, para el enlace de un usuario existente.
 */
export class InvitarUsuario {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly contexto: TenantContext,
    private readonly ids: IdGenerator,
    private readonly reloj: Clock,
    private readonly eventos: EventPublisher,
    private readonly repos: InvitacionRepos,
    private readonly proveedor: ProveedorIdentidad,
    private readonly op: OpcionesInvitacion,
  ) {}

  async ejecutar(c: InvitarUsuarioComando): Promise<InvitacionEmitida> {
    const correo = c.correo.trim().toLowerCase();
    if (correo.length > 255 || !CORREO.test(correo)) throw new ValidationError('El correo no es válido');
    const nombre = textoRequerido(c.nombre, 3, 150, 'El nombre');

    const token = randomBytes(32).toString('base64url');
    const redirectTo = new URL(this.op.urlInvitacion);
    redirectTo.searchParams.set('token', token);

    const existente = await this.uow.run(async () => (await this.validar(c, correo)).usuario);
    const usuarioId = existente?.id ?? (await this.proveedor.invitar(correo, nombre, redirectTo.toString())).usuarioId;

    const emitida = await this.uow.run(() => this.emitir(c, usuarioId, !existente, createHash('sha256').update(token).digest('hex')));

    if (existente) {
      try {
        await this.proveedor.enviarEnlace(correo, redirectTo.toString());
      } catch (error) {
        if (!(error instanceof IdentidadNoDisponibleError)) throw error;
        return { ...emitida, correoEnviado: false };
      }
    }
    return emitida;
  }

  private async emitir(c: InvitarUsuarioComando, usuarioId: string, usuarioNuevo: boolean, tokenHash: string): Promise<InvitacionEmitida> {
    // Se valida otra vez: entre la primera lectura y Supabase pudo cambiar la membresía o el cupo.
    const { permisos } = await this.validar(c, c.correo.trim().toLowerCase(), usuarioId);
    const { tenantId } = this.contexto.current();
    const ahora = this.reloj.now();
    const expiraEn = new Date(ahora.getTime() + this.op.horas * 3_600_000);
    if (usuarioNuevo) await this.repos.usuarios.marcarInterno(usuarioId);

    let membresia = await this.repos.ciclo.deUsuario(usuarioId);
    const revocadas: Asignacion[] = [];
    if (!membresia) {
      membresia = Membresia.invitar(this.ids.next(), { usuarioId, tenantId, invitadoPor: c.otorgante.usuarioId }, ahora, expiraEn);
      await this.repos.ciclo.guardar(membresia);
    } else {
      const reenvio = membresia.estado === 'INVITADO';
      membresia.reinvitar(c.otorgante.usuarioId, ahora, expiraEn);
      await this.repos.ciclo.guardar(membresia);
      const pendiente = await this.repos.invitaciones.pendienteDe(membresia.id);
      if (pendiente) {
        pendiente.anular(ahora);
        await this.repos.invitaciones.guardar(pendiente);
      }
      // La última invitación define el acceso propuesto: la anterior deja de valer (decisión del spec).
      if (reenvio) {
        for (const a of await this.repos.asignaciones.noRevocadasDe(membresia.id)) {
          a.revocar(MOTIVO_REINVITACION, c.otorgante.usuarioId, ahora);
          await this.repos.asignaciones.guardar(a);
          await this.repos.bitacora.registrar('ASIGNACION_REVOCADA', c.otorgante.usuarioId, {
            accion: 'REINVITAR',
            motivo: MOTIVO_REINVITACION,
            asignacion_id: a.id,
            membresia_id: membresia.id,
          });
          revocadas.push(a);
        }
      }
    }

    const asignacion = Asignacion.otorgar(this.ids.next(), tenantId, { ...datosAsignacion(c), membresiaId: membresia.id }, {
      hoy: fechaLocal(ahora),
      otorgadoPor: c.otorgante.usuarioId,
      permisos,
    });
    await this.repos.asignaciones.guardar(asignacion);

    const invitacion = Invitacion.emitir(this.ids.next(), {
      tenantId,
      membresiaId: membresia.id,
      tokenHash,
      creadaPor: c.otorgante.usuarioId,
      ahora,
      horas: this.op.horas,
    });
    await this.repos.invitaciones.guardar(invitacion);

    await publicarEventos(this.eventos, membresia, ...revocadas, asignacion);
    return { membresiaId: membresia.id, invitacionId: invitacion.id, expiraEn: invitacion.expiraEn, usuarioNuevo, correoEnviado: true };
  }

  /**
   * TR-RN-008, alcance del otorgante (TR-CA-026), MFA (TR-RN-009), membresía existente y límite del
   * plan (TR-RN-006). `usuarioId` llega en la segunda pasada, cuando el usuario ya existe.
   */
  private async validar(
    c: InvitarUsuarioComando,
    correo: string,
    usuarioId?: string,
  ): Promise<{ usuario: { id: string } | null; permisos: PermisoCatalogo[] }> {
    const hoy = fechaLocal(this.reloj.now());
    const roles = await this.rolesDe(c);
    const permisos = await this.repos.catalogo.permisos(roles.flatMap((r) => r.permisos));
    // Solo valida; la asignación real se crea en emitir.
    const propuesta = Asignacion.otorgar(this.ids.next(), this.contexto.current().tenantId, { ...datosAsignacion(c), membresiaId: '' }, {
      hoy,
      otorgadoPor: c.otorgante.usuarioId,
      permisos,
    });
    const destino: Ambito = await this.repos.ubicaciones.resolver(propuesta.ubicacion);

    if (permisos.some((p) => p.sensible) && !c.otorgante.mfaVigente) throw new MfaRequeridaError(this.op.mfaMaxEdadSeg);
    if (!(await actorCubre(this.repos, c.otorgante.usuarioId, [destino], hoy))) throw new AlcanceSuperiorError();

    const usuario = usuarioId ? { id: usuarioId } : await this.repos.usuarios.porCorreo(correo);
    if (usuario) {
      const membresia = await this.repos.ciclo.deUsuario(usuario.id);
      if (membresia && (membresia.estado === 'ACTIVO' || membresia.estado === 'SUSPENDIDO')) throw new MembresiaExistenteError(membresia.estado);
    }

    const ahora = this.reloj.now();
    for (const producto of new Set(roles.map((r) => r.productoCodigo).filter((p) => p !== 'PLAT'))) {
      const limite = await this.repos.limites.limite(producto);
      if (limite === null) continue;
      if ((await this.repos.limites.usados(producto, ahora, usuario?.id)) + 1 > limite) throw new LimiteUsuariosError(producto, limite);
    }
    return { usuario, permisos };
  }

  /** El rol, o los roles activos del perfil. */
  private async rolesDe({ rolId, perfilId }: InvitarUsuarioComando): Promise<Rol[]> {
    if (rolId !== null) {
      const rol = await this.repos.roles.buscar(rolId);
      if (!rol) throw new NotFoundError('El rol no existe');
      if (!rol.activo) throw new ConflictError('El rol está inactivo u obsoleto');
      return [rol];
    }
    if (perfilId === null) return [];
    const perfil = await this.repos.perfiles.buscar(perfilId);
    if (!perfil) throw new NotFoundError('El perfil no existe');
    return (await this.repos.roles.buscarVarios(perfil.roles)).filter((r) => r.activo);
  }
}

function datosAsignacion(c: InvitarUsuarioComando): Omit<DatosAsignacion, 'membresiaId'> {
  return {
    rolId: c.rolId,
    perfilId: c.perfilId,
    alcance: c.alcance,
    empresaId: c.empresaId,
    sucursalId: c.sucursalId,
    unidadId: c.unidadId,
    vigenteDesde: null,
    vigenteHasta: c.vigenteHasta,
  };
}
