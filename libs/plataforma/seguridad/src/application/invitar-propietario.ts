import { createHash, randomBytes } from 'node:crypto';
import { ConflictError, ValidationError, type Clock, type EventPublisher, type IdGenerator, type TenantContext, type UnitOfWork } from '@vitrina/plataforma/kernel';
import { Asignacion } from '../domain/asignacion.js';
import { IdentidadNoDisponibleError } from '../domain/errores.js';
import { Invitacion } from '../domain/invitacion.js';
import { Membresia } from '../domain/membresia.js';
import { textoRequerido } from '../domain/texto.js';
import { fechaLocal } from './otorgar-asignacion.js';
import type { ProveedorIdentidad } from './ports/proveedor-identidad.port.js';
import type {
  CatalogoPermisos,
  RepositorioAsignaciones,
  RepositorioInvitaciones,
  RepositorioMembresias,
  RepositorioRoles,
  UsuariosIdentidad,
} from './ports/repositorios.js';
import { publicarEventos } from './publicar-eventos.js';

/** Rol predefinido del manifiesto PLAT que recibe el propietario de un tenant nuevo. */
export const ROL_PROPIETARIO = 'PLAT_PROPIETARIO';

const CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const LARGO_MAXIMO_CORREO = 255;
const BYTES_TOKEN = 32;
const MILISEGUNDOS_POR_HORA = 3_600_000;

export interface PropietarioRepos {
  ciclo: RepositorioMembresias;
  invitaciones: RepositorioInvitaciones;
  usuarios: UsuariosIdentidad;
  asignaciones: RepositorioAsignaciones;
  roles: RepositorioRoles;
  catalogo: CatalogoPermisos;
}

export interface OpcionesPropietario {
  /** Página de aceptación (spec 14); el token va en `?token=`. */
  urlInvitacion: string;
  horas: number;
}

/** Resultado de preparar la identidad, antes de la transacción del alta. Lleva el token: no va a logs. */
export interface IdentidadPropietario {
  correo: string;
  usuarioId: string;
  usuarioNuevo: boolean;
  token: string;
  redirectTo: string;
}

export interface PropietarioRegistrado {
  membresiaId: string;
  invitacionId: string;
  expiraEn: Date;
}

/**
 * Primer miembro de un tenant nuevo (spec 12): membresía propietaria, asignación de PLAT_PROPIETARIO
 * con alcance TENANT e invitación de 72 h. Sin regla del otorgante ni límite de usuarios: quien da
 * de alta no es miembro del tenant y PLAT no tiene límite. Lo usa solo el orquestador del alta.
 */
export class InvitarPropietario {
  constructor(
    private readonly unidadDeTrabajo: UnitOfWork,
    private readonly contexto: TenantContext,
    private readonly ids: IdGenerator,
    private readonly reloj: Clock,
    private readonly eventos: EventPublisher,
    private readonly repos: PropietarioRepos,
    private readonly proveedor: ProveedorIdentidad,
    private readonly opciones: OpcionesPropietario,
  ) {}

  /** Antes de la transacción del alta, con el tenant nuevo en el contexto. Crea el usuario en Supabase si no existe. */
  async prepararIdentidad(correoIngresado: string, nombreIngresado: string): Promise<IdentidadPropietario> {
    const correo = normalizarCorreo(correoIngresado);
    const nombre = textoRequerido(nombreIngresado, 3, 150, 'El nombre del propietario');
    const token = randomBytes(BYTES_TOKEN).toString('base64url');
    const redirectTo = this.enlaceDeInvitacion(token);

    const existente = await this.unidadDeTrabajo.run(() => this.repos.usuarios.porCorreo(correo));
    if (existente) return { correo, usuarioId: existente.id, usuarioNuevo: false, token, redirectTo };
    const { usuarioId } = await this.proveedor.invitar(correo, nombre, redirectTo);
    return { correo, usuarioId, usuarioNuevo: true, token, redirectTo };
  }

  /** Dentro de la transacción del alta. */
  registrar(identidad: IdentidadPropietario, invitadoPor: string): Promise<PropietarioRegistrado> {
    return this.unidadDeTrabajo.run(async () => {
      const { tenantId } = this.contexto.current();
      const ahora = this.reloj.now();
      const expiraEn = new Date(ahora.getTime() + this.opciones.horas * MILISEGUNDOS_POR_HORA);
      if (identidad.usuarioNuevo) await this.repos.usuarios.marcarInterno(identidad.usuarioId);

      const membresia = Membresia.invitar(this.ids.next(), { usuarioId: identidad.usuarioId, tenantId, invitadoPor, esPropietario: true }, ahora, expiraEn);
      await this.repos.ciclo.guardar(membresia);

      const asignacion = await this.asignarRolPropietario(tenantId, membresia.id, invitadoPor, ahora);
      const invitacion = Invitacion.emitir(this.ids.next(), {
        tenantId,
        membresiaId: membresia.id,
        tokenHash: createHash('sha256').update(identidad.token).digest('hex'),
        creadaPor: invitadoPor,
        ahora,
        horas: this.opciones.horas,
      });
      await this.repos.invitaciones.guardar(invitacion);

      await publicarEventos(this.eventos, membresia, asignacion);
      return { membresiaId: membresia.id, invitacionId: invitacion.id, expiraEn: invitacion.expiraEn };
    });
  }

  /** Después del commit. Un usuario nuevo ya recibió la invitación de Supabase; uno existente recibe el enlace. */
  async notificar(identidad: IdentidadPropietario): Promise<{ correoEnviado: boolean }> {
    if (identidad.usuarioNuevo) return { correoEnviado: true };
    try {
      await this.proveedor.enviarEnlace(identidad.correo, identidad.redirectTo);
      return { correoEnviado: true };
    } catch (error) {
      if (!(error instanceof IdentidadNoDisponibleError)) throw error;
      return { correoEnviado: false };
    }
  }

  private async asignarRolPropietario(tenantId: string, membresiaId: string, otorgadoPor: string, ahora: Date): Promise<Asignacion> {
    const rol = await this.repos.roles.buscarPorCodigo(ROL_PROPIETARIO);
    if (!rol?.activo) throw new ConflictError(`El rol ${ROL_PROPIETARIO} no existe; aplique el manifiesto PLAT`);
    const asignacion = Asignacion.otorgar(
      this.ids.next(),
      tenantId,
      { membresiaId, rolId: rol.id, perfilId: null, alcance: 'TENANT', empresaId: null, sucursalId: null, unidadId: null, vigenteHasta: null },
      { hoy: fechaLocal(ahora), otorgadoPor, permisos: await this.repos.catalogo.permisos(rol.permisos) },
    );
    await this.repos.asignaciones.guardar(asignacion);
    return asignacion;
  }

  private enlaceDeInvitacion(token: string): string {
    const url = new URL(this.opciones.urlInvitacion);
    url.searchParams.set('token', token);
    return url.toString();
  }
}

function normalizarCorreo(correoIngresado: string): string {
  const correo = correoIngresado.trim().toLowerCase();
  if (correo.length > LARGO_MAXIMO_CORREO || !CORREO.test(correo)) throw new ValidationError('El correo no es válido');
  return correo;
}
