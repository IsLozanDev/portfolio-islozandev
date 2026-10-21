import { ConflictError, NotFoundError, type Clock, type EventPublisher, type IdGenerator, type TenantContext, type UnitOfWork } from '@vitrina/plataforma/kernel';
import { cubre, type Ambito } from '../domain/alcance.js';
import { Asignacion, type DatosAsignacion, type Fecha } from '../domain/asignacion.js';
import { MembresiaNoAsignableError, MfaRequeridaError, OtorganteSinAlcanceError } from '../domain/errores.js';
import type {
  BitacoraSeguridad,
  CatalogoPermisos,
  MembresiasLectura,
  RepositorioAsignaciones,
  RepositorioPerfiles,
  RepositorioRoles,
  UbicacionesOrg,
} from './ports/repositorios.js';
import { publicarEventos } from './publicar-eventos.js';

// Las vigencias son fechas calendario de Perú: "hoy" se toma en esa zona, no en UTC.
const ZONA = 'America/Lima';
const FORMATO_FECHA = new Intl.DateTimeFormat('en-CA', { timeZone: ZONA, year: 'numeric', month: '2-digit', day: '2-digit' });

export const fechaLocal = (instante: Date): Fecha => FORMATO_FECHA.format(instante);

export interface Otorgante {
  usuarioId: string;
  /** `mfaVigente` del principal (spec 05): aal2 y factor de `mfaMaxEdadSeg` como máximo. */
  mfaVigente: boolean;
}

export interface OtorgarAsignacionComando extends DatosAsignacion {
  otorgante: Otorgante;
}

export interface AsignacionRepos {
  asignaciones: RepositorioAsignaciones;
  membresias: MembresiasLectura;
  roles: RepositorioRoles;
  perfiles: RepositorioPerfiles;
  catalogo: CatalogoPermisos;
  ubicaciones: UbicacionesOrg;
  bitacora: BitacoraSeguridad;
}

/** TR-RF-013: asigna un rol o un perfil a una membresía con alcance y vigencia. */
export class OtorgarAsignacion {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly contexto: TenantContext,
    private readonly ids: IdGenerator,
    private readonly reloj: Clock,
    private readonly eventos: EventPublisher,
    private readonly repos: AsignacionRepos,
    private readonly mfaMaxEdadSeg: number,
  ) {}

  ejecutar({ otorgante, ...datos }: OtorgarAsignacionComando): Promise<{ asignacionId: string }> {
    return this.uow.run(async () => {
      const hoy = fechaLocal(this.reloj.now());

      const destino = await this.repos.membresias.buscar(datos.membresiaId);
      if (!destino) throw new NotFoundError('La membresía no existe');
      if (destino.estado !== 'ACTIVO' && destino.estado !== 'INVITADO') throw new MembresiaNoAsignableError(destino.estado);

      const permisos = await this.repos.catalogo.permisos(await this.permisosDe(datos));
      const asignacion = Asignacion.otorgar(this.ids.next(), this.contexto.current().tenantId, datos, {
        hoy,
        otorgadoPor: otorgante.usuarioId,
        permisos,
      });
      const ambito = await this.repos.ubicaciones.resolver(asignacion.ubicacion);

      // TR-RN-009: otorgar un rol con permisos sensibles exige MFA reciente al otorgante.
      if (permisos.some((p) => p.sensible) && !otorgante.mfaVigente) throw new MfaRequeridaError(this.mfaMaxEdadSeg);
      await this.exigirAlcance(otorgante.usuarioId, ambito, hoy);

      await this.repos.asignaciones.guardar(asignacion);
      await this.repos.bitacora.registrar('ASIGNACION_OTORGADA', otorgante.usuarioId, {
        asignacion_id: asignacion.id,
        membresia_id: asignacion.membresiaId,
        usuario_destino: destino.usuarioId,
        rol_id: asignacion.rolId,
        perfil_id: asignacion.perfilId,
        alcance: asignacion.alcance,
      });
      await publicarEventos(this.eventos, asignacion);
      return { asignacionId: asignacion.id };
    });
  }

  /** Permisos del rol, o de los roles activos del perfil. */
  private async permisosDe({ rolId, perfilId }: DatosAsignacion): Promise<string[]> {
    if (rolId !== null) {
      const rol = await this.repos.roles.buscar(rolId);
      if (!rol) throw new NotFoundError('El rol no existe');
      if (!rol.activo) throw new ConflictError('El rol está inactivo u obsoleto');
      return [...rol.permisos];
    }
    if (perfilId === null) return [];
    const perfil = await this.repos.perfiles.buscar(perfilId);
    if (!perfil) throw new NotFoundError('El perfil no existe');
    const roles = await this.repos.roles.buscarVarios(perfil.roles);
    return roles.filter((r) => r.activo).flatMap((r) => r.permisos);
  }

  /** El propietario del tenant pasa; los demás necesitan una asignación vigente que cubra el destino. */
  private async exigirAlcance(usuarioId: string, destino: Ambito, hoy: Fecha): Promise<void> {
    const membresia = await this.repos.membresias.deUsuario(usuarioId);
    if (!membresia || membresia.estado !== 'ACTIVO') throw new OtorganteSinAlcanceError();
    if (membresia.esPropietario) return;

    for (const propia of await this.repos.asignaciones.vigentesDe(membresia.id, hoy)) {
      if (cubre(await this.repos.ubicaciones.resolver(propia.ubicacion), destino)) return;
    }
    throw new OtorganteSinAlcanceError();
  }
}
