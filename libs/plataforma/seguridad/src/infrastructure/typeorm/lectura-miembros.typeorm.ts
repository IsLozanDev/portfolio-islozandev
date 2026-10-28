import type { TenantContext } from '@vitrina/plataforma/kernel';
import type { TypeOrmUnitOfWork } from '@vitrina/plataforma/kernel-infra';
import type { EntitySchema, ObjectLiteral, SelectQueryBuilder } from 'typeorm';
import type {
  AsignacionDelMiembro,
  Asignables,
  DireccionOrden,
  FiltroMiembros,
  LecturaMiembros,
  Listado,
  MiembroDetalle,
  MiembroListado,
  OrdenMiembros,
  Referencia,
} from '../../application/ports/lectura-miembros.js';
import { ESTADOS_ASIGNACION, estadoAsignacion, type Fecha } from '../../domain/asignacion.js';
import type { EstadoMembresia } from '../../domain/membresia.js';
import {
  AsignacionLecturaEntidad,
  InvitacionLecturaEntidad,
  MembresiaLecturaEntidad,
  PerfilLecturaEntidad,
  PerfilRolLecturaEntidad,
  PermisoLecturaEntidad,
  RolLecturaEntidad,
  RolPermisoLecturaEntidad,
  UsuarioLecturaEntidad,
  type FilaAsignacion,
  type FilaRol,
} from './entidades-lectura.js';
import { EmpresaUbicacionEntidad, SucursalUbicacionEntidad, UnidadUbicacionEntidad } from './entidades-org.js';

const COLUMNA_DE_ORDEN: Readonly<Record<OrdenMiembros, string>> = {
  nombre: 'usuario.nombre',
  correo: 'usuario.correo',
  estado: 'membresia.estado',
};

const SENTIDO_DE_ORDEN: Readonly<Record<DireccionOrden, 'ASC' | 'DESC'>> = { asc: 'ASC', desc: 'DESC' };

// `\` es el escape por defecto de LIKE en PostgreSQL: lo que escribe el usuario se busca literal.
const COMODINES_DE_LIKE = /[\\%_]/g;

interface FilaMiembroResumen {
  membresia_id: string;
  usuario_id: string;
  nombre: string;
  correo: string;
  estado: EstadoMembresia;
  es_propietario: boolean;
  asignaciones_vigentes: string;
  invitacion_expira_en: Date | null;
}

interface FilaMiembroDetalle extends FilaMiembroResumen {
  desde: Date;
  hasta: Date | null;
}

interface NombresDeAsignaciones {
  roles: Map<string, string>;
  perfiles: Map<string, string>;
  empresas: Map<string, string>;
  sucursales: Map<string, string>;
  unidades: Map<string, string>;
}

/** Miembros del tenant del contexto. Filtra por tenant además de la RLS (regla 3). */
export class LecturaMiembrosTypeOrm implements LecturaMiembros {
  constructor(
    private readonly unidadDeTrabajo: TypeOrmUnitOfWork,
    private readonly contexto: TenantContext,
  ) {}

  async listar(filtro: FiltroMiembros, hoy: Fecha): Promise<Listado<MiembroListado>> {
    const consulta = this.miembros();
    if (filtro.estado) consulta.andWhere('membresia.estado = :estado', { estado: filtro.estado });
    if (filtro.busqueda) {
      consulta.andWhere('(usuario.nombre ILIKE :patron OR usuario.correo ILIKE :patron)', { patron: patronDeBusqueda(filtro.busqueda) });
    }
    const total = await consulta.getCount();
    const filas = await this.conResumen(consulta, hoy)
      .orderBy(COLUMNA_DE_ORDEN[filtro.orden], SENTIDO_DE_ORDEN[filtro.direccion])
      .addOrderBy('membresia.id')
      .offset((filtro.pagina - 1) * filtro.tamano)
      .limit(filtro.tamano)
      .getRawMany<FilaMiembroResumen>();
    return { items: filas.map(miembroListado), total };
  }

  async detalle(membresiaId: string, hoy: Fecha): Promise<MiembroDetalle | null> {
    const fila = await this.conResumen(this.miembros().andWhere('membresia.id = :membresiaId', { membresiaId }), hoy)
      .addSelect('membresia.desde', 'desde')
      .addSelect('membresia.hasta', 'hasta')
      .getRawOne<FilaMiembroDetalle>();
    if (!fila) return null;
    return { ...miembroListado(fila), desde: fila.desde, hasta: fila.hasta, asignaciones: await this.asignacionesDe(membresiaId, hoy) };
  }

  async asignables(productos: readonly string[]): Promise<Asignables> {
    if (productos.length === 0) return { roles: [], perfiles: [] };
    const rolesActivos = await this.rolesActivos();
    if (rolesActivos.length === 0) return { roles: [], perfiles: [] };

    const idsRolesActivos = rolesActivos.map((rol) => rol.id);
    const rolesSensibles = await this.rolesConPermisoSensible(idsRolesActivos);
    const rolesContratados = rolesActivos.filter((rol) => productos.includes(rol.productoCodigo));
    const idsRolesContratados = new Set(rolesContratados.map((rol) => rol.id));
    const rolesDePerfiles = await this.rolesDePerfiles(idsRolesActivos);

    const perfilesConRolContratado = new Set(rolesDePerfiles.filter((fila) => idsRolesContratados.has(fila.rolId)).map((fila) => fila.perfilId));
    const perfilesSensibles = new Set(rolesDePerfiles.filter((fila) => rolesSensibles.has(fila.rolId)).map((fila) => fila.perfilId));
    const perfiles = await this.perfilesVisibles([...perfilesConRolContratado]);

    return {
      roles: rolesContratados.map((rol) => ({
        id: rol.id,
        codigo: rol.codigo,
        nombre: rol.nombre,
        productoCodigo: rol.productoCodigo,
        sensible: rolesSensibles.has(rol.id),
      })),
      perfiles: perfiles.map((perfil) => ({ id: perfil.id, codigo: perfil.codigo, nombre: perfil.nombre, sensible: perfilesSensibles.has(perfil.id) })),
    };
  }

  private get tenantId(): string {
    return this.contexto.current().tenantId;
  }

  private repositorio<F extends ObjectLiteral>(entidad: EntitySchema<F>, alias: string): SelectQueryBuilder<F> {
    return this.unidadDeTrabajo.manager.getRepository(entidad).createQueryBuilder(alias);
  }

  private miembros(): SelectQueryBuilder<ObjectLiteral> {
    return this.repositorio(MembresiaLecturaEntidad, 'membresia')
      .innerJoin(UsuarioLecturaEntidad.options.name, 'usuario', 'usuario.id = membresia.usuarioId')
      .where('membresia.tenantId = :tenantId', { tenantId: this.tenantId });
  }

  /** Columnas de la fila de la lista: datos del usuario, asignaciones vigentes e invitación pendiente. */
  private conResumen(consulta: SelectQueryBuilder<ObjectLiteral>, hoy: Fecha): SelectQueryBuilder<ObjectLiteral> {
    return consulta
      .select('membresia.id', 'membresia_id')
      .addSelect('membresia.usuarioId', 'usuario_id')
      .addSelect('usuario.nombre', 'nombre')
      .addSelect('usuario.correo', 'correo')
      .addSelect('membresia.estado', 'estado')
      .addSelect('membresia.esPropietario', 'es_propietario')
      .addSelect(
        (subconsulta) =>
          subconsulta
            .select('count(*)')
            .from(AsignacionLecturaEntidad, 'asignacion')
            .where('asignacion.membresiaId = membresia.id')
            .andWhere('asignacion.revocadaEn IS NULL')
            .andWhere('asignacion.vigenteDesde <= :hoy')
            .andWhere('(asignacion.vigenteHasta IS NULL OR asignacion.vigenteHasta >= :hoy)'),
        'asignaciones_vigentes',
      )
      .addSelect(
        (subconsulta) =>
          subconsulta
            .select('invitacion.expiraEn')
            .from(InvitacionLecturaEntidad, 'invitacion')
            .where('invitacion.membresiaId = membresia.id')
            .andWhere('invitacion.usadaEn IS NULL')
            .andWhere('invitacion.anuladaEn IS NULL'),
        'invitacion_expira_en',
      )
      .setParameter('hoy', hoy);
  }

  private async asignacionesDe(membresiaId: string, hoy: Fecha): Promise<AsignacionDelMiembro[]> {
    const filas = await this.repositorio(AsignacionLecturaEntidad, 'asignacion')
      .where('asignacion.tenantId = :tenantId', { tenantId: this.tenantId })
      .andWhere('asignacion.membresiaId = :membresiaId', { membresiaId })
      .getMany();
    const nombres = await this.nombresDe(filas);
    return filas.map((fila) => asignacionDelMiembro(fila, nombres, hoy)).sort(porEstadoYDesde);
  }

  /** En serie: comparten la conexión de la transacción y `pg` no admite consultas simultáneas en ella. */
  private async nombresDe(filas: readonly FilaAsignacion[]): Promise<NombresDeAsignaciones> {
    return {
      roles: await this.nombresPorId(RolLecturaEntidad, filas.map((fila) => fila.rolId)),
      perfiles: await this.nombresPorId(PerfilLecturaEntidad, filas.map((fila) => fila.perfilId)),
      empresas: await this.nombresPorId(EmpresaUbicacionEntidad, filas.map((fila) => fila.empresaId)),
      sucursales: await this.nombresPorId(SucursalUbicacionEntidad, filas.map((fila) => fila.sucursalId)),
      unidades: await this.nombresPorId(UnidadUbicacionEntidad, filas.map((fila) => fila.unidadId)),
    };
  }

  /** Los ids salen de asignaciones del tenant; roles y perfiles pueden ser predefinidos (sin tenant). */
  private async nombresPorId<F extends { id: string; nombre: string }>(entidad: EntitySchema<F>, ids: readonly (string | null)[]): Promise<Map<string, string>> {
    const unicos = [...new Set(ids.filter((id): id is string => id !== null))];
    if (unicos.length === 0) return new Map();
    const filas = await this.repositorio(entidad, 'fila').where('fila.id IN (:...ids)', { ids: unicos }).getMany();
    return new Map(filas.map((fila) => [fila.id, fila.nombre]));
  }

  private rolesActivos(): Promise<FilaRol[]> {
    return this.repositorio(RolLecturaEntidad, 'rol')
      .where('(rol.tenantId = :tenantId OR rol.tenantId IS NULL)', { tenantId: this.tenantId })
      .andWhere('rol.activo = true')
      .andWhere('rol.obsoleto = false')
      .orderBy('rol.nombre')
      .addOrderBy('rol.id')
      .getMany();
  }

  private async rolesConPermisoSensible(idsRoles: readonly string[]): Promise<Set<string>> {
    const filas = await this.repositorio(RolPermisoLecturaEntidad, 'rolPermiso')
      .innerJoin(PermisoLecturaEntidad.options.name, 'permiso', 'permiso.codigo = rolPermiso.permisoCodigo')
      .select('rolPermiso.rolId', 'rol_id')
      .distinct(true)
      .where('rolPermiso.rolId IN (:...idsRoles)', { idsRoles })
      .andWhere('permiso.sensible = true')
      .getRawMany<{ rol_id: string }>();
    return new Set(filas.map((fila) => fila.rol_id));
  }

  private rolesDePerfiles(idsRoles: readonly string[]) {
    return this.repositorio(PerfilRolLecturaEntidad, 'perfilRol').where('perfilRol.rolId IN (:...idsRoles)', { idsRoles }).getMany();
  }

  private async perfilesVisibles(ids: readonly string[]) {
    if (ids.length === 0) return [];
    return this.repositorio(PerfilLecturaEntidad, 'perfil')
      .where('(perfil.tenantId = :tenantId OR perfil.tenantId IS NULL)', { tenantId: this.tenantId })
      .andWhere('perfil.id IN (:...ids)', { ids })
      .orderBy('perfil.nombre')
      .addOrderBy('perfil.id')
      .getMany();
  }
}

function patronDeBusqueda(busqueda: string): string {
  return `%${busqueda.replace(COMODINES_DE_LIKE, (comodin) => `\\${comodin}`)}%`;
}

function miembroListado(fila: FilaMiembroResumen): MiembroListado {
  return {
    membresiaId: fila.membresia_id,
    usuarioId: fila.usuario_id,
    nombre: fila.nombre,
    correo: fila.correo,
    estado: fila.estado,
    esPropietario: fila.es_propietario,
    asignacionesVigentes: Number(fila.asignaciones_vigentes),
    invitacionExpiraEn: fila.invitacion_expira_en,
  };
}

function referencia(id: string | null, nombres: Map<string, string>): Referencia | null {
  return id === null ? null : { id, nombre: nombres.get(id) ?? '' };
}

function asignacionDelMiembro(fila: FilaAsignacion, nombres: NombresDeAsignaciones, hoy: Fecha): AsignacionDelMiembro {
  return {
    id: fila.id,
    rol: referencia(fila.rolId, nombres.roles),
    perfil: referencia(fila.perfilId, nombres.perfiles),
    alcance: fila.alcance,
    empresa: referencia(fila.empresaId, nombres.empresas),
    sucursal: referencia(fila.sucursalId, nombres.sucursales),
    unidad: referencia(fila.unidadId, nombres.unidades),
    vigenteDesde: fila.vigenteDesde,
    vigenteHasta: fila.vigenteHasta,
    estado: estadoAsignacion(fila, hoy),
    revocadaEn: fila.revocadaEn,
    motivoRevocacion: fila.motivoRevocacion,
  };
}

function porEstadoYDesde(una: AsignacionDelMiembro, otra: AsignacionDelMiembro): number {
  const porEstado = ESTADOS_ASIGNACION.indexOf(una.estado) - ESTADOS_ASIGNACION.indexOf(otra.estado);
  if (porEstado !== 0) return porEstado;
  return otra.vigenteDesde.localeCompare(una.vigenteDesde) || una.id.localeCompare(otra.id);
}
