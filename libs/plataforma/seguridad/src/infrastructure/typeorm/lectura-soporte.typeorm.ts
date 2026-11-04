import type { TenantContext } from '@vitrina/plataforma/kernel';
import type { TypeOrmUnitOfWork } from '@vitrina/plataforma/kernel-infra';
import { MoreThan, type DataSource, type Repository, type SelectQueryBuilder } from 'typeorm';
import type { UsuarioDelEvento } from '../../application/ports/lectura-bitacora.js';
import type { Listado } from '../../application/ports/lectura-miembros.js';
import type {
  AccesoDelAgente,
  AccesoPorVencer,
  FiltroSolicitudesSoporte,
  LecturaSoporte,
  SesionSoporte,
  SolicitudSoporte,
} from '../../application/ports/lectura-soporte.js';
import type { CausaCierreSoporte, EstadoSoporte, ModoSoporte } from '../../domain/acceso-soporte.js';
import { OpcionLecturaEntidad, OpcionPermisoLecturaEntidad, UsuarioLecturaEntidad } from './entidades-lectura.js';
import { AccesoSoporteEntidad, type FilaAccesoSoporte } from './entidades-soporte.js';

// SQL crudo justificado (regla 11): llamadas a las funciones SECURITY DEFINER de 01b_seg_soporte, que el
// ORM no expresa. Van fuera de la transacción del tenant: son las únicas lecturas entre tenants.
const ACCESOS_DE_AGENTE = 'SELECT * FROM seg.accesos_soporte_de_agente($1::uuid)';
const ACCESOS_POR_VENCER = 'SELECT id, tenant_id FROM seg.accesos_soporte_por_vencer($1::timestamptz)';

interface FilaAccesoDeAgente {
  id: string;
  tenant_id: string;
  tenant_nombre: string;
  ticket: string;
  modo: ModoSoporte;
  estado: EstadoSoporte;
  horas_solicitadas: number;
  solicitado_en: Date;
  desde: Date | null;
  hasta: Date | null;
  motivo_cierre: string | null;
  causa_cierre: CausaCierreSoporte | null;
}

interface FilaSolicitud {
  id: string;
  ticket: string;
  motivo: string;
  modo: ModoSoporte;
  horas_solicitadas: number;
  estado: EstadoSoporte;
  solicitado_en: Date;
  caduca_en: Date;
  horas_aprobadas: number | null;
  desde: Date | null;
  hasta: Date | null;
  cerrado_en: Date | null;
  motivo_cierre: string | null;
  causa_cierre: CausaCierreSoporte | null;
  agente_id: string;
  agente_nombre: string;
  agente_correo: string;
  aprobador_id: string | null;
  aprobador_nombre: string | null;
  aprobador_correo: string | null;
  cerrador_id: string | null;
  cerrador_nombre: string | null;
  cerrador_correo: string | null;
}

/** `seg.usuario` es global y sin RLS: solo se lee unido a un acceso del tenant. */
const PERSONAS = [
  ['agente', 'acceso.agenteId', 'innerJoin'],
  ['aprobador', 'acceso.aprobadoPor', 'leftJoin'],
  ['cerrador', 'acceso.cerradoPor', 'leftJoin'],
] as const;

export class LecturaSoporteTypeOrm implements LecturaSoporte {
  constructor(
    private readonly unidadDeTrabajo: TypeOrmUnitOfWork,
    private readonly contexto: TenantContext,
    private readonly dataSource: Pick<DataSource, 'query'>,
  ) {}

  async delTenant(filtro: FiltroSolicitudesSoporte): Promise<Listado<SolicitudSoporte>> {
    const consulta = this.accesos().createQueryBuilder('acceso').where('acceso.tenantId = :tenantId', { tenantId: this.tenantId() });
    if (filtro.estados?.length) consulta.andWhere('acceso.estado IN (:...estados)', { estados: filtro.estados });
    const total = await consulta.getCount();
    const filas = await this.conPersonas(consulta)
      .orderBy('acceso.solicitadoEn', 'DESC')
      .addOrderBy('acceso.id')
      .offset((filtro.pagina - 1) * filtro.tamano)
      .limit(filtro.tamano)
      .getRawMany<FilaSolicitud>();
    return { items: filas.map(solicitud), total };
  }

  async pendientes(ahora: Date): Promise<number> {
    return this.accesos().countBy({ tenantId: this.tenantId(), estado: 'PENDIENTE', caducaEn: MoreThan(ahora) });
  }

  async vigenteDe(usuarioId: string, ahora: Date): Promise<SesionSoporte | null> {
    const fila = await this.accesos().findOneBy({ tenantId: this.tenantId(), agenteId: usuarioId, estado: 'APROBADO', hasta: MoreThan(ahora) });
    if (!fila?.hasta) return null;
    return { accesoId: fila.id, ticket: fila.ticket, modo: fila.modo, hasta: fila.hasta };
  }

  async deAgente(agenteId: string): Promise<AccesoDelAgente[]> {
    const filas: FilaAccesoDeAgente[] = await this.dataSource.query(ACCESOS_DE_AGENTE, [agenteId]);
    return filas.map(accesoDelAgente);
  }

  async porVencer(ahora: Date): Promise<AccesoPorVencer[]> {
    const filas: { id: string; tenant_id: string }[] = await this.dataSource.query(ACCESOS_POR_VENCER, [ahora]);
    return filas.map((fila) => ({ id: fila.id, tenantId: fila.tenant_id }));
  }

  async permisosDeOpciones(codigos: readonly string[]): Promise<Map<string, string[]>> {
    const porOpcion = new Map<string, string[]>(codigos.map((codigo) => [codigo, []]));
    if (codigos.length === 0) return porOpcion;
    const filas = await this.unidadDeTrabajo.manager
      .getRepository(OpcionPermisoLecturaEntidad)
      .createQueryBuilder('opcionPermiso')
      .innerJoin(OpcionLecturaEntidad.options.name, 'opcion', 'opcion.id = opcionPermiso.opcionId')
      .select('opcion.codigo', 'codigo')
      .addSelect('opcionPermiso.permisoCodigo', 'permiso')
      .where('opcion.codigo IN (:...codigos)', { codigos })
      .getRawMany<{ codigo: string; permiso: string }>();
    for (const fila of filas) porOpcion.get(fila.codigo)?.push(fila.permiso);
    return porOpcion;
  }

  private conPersonas(consulta: SelectQueryBuilder<FilaAccesoSoporte>): SelectQueryBuilder<FilaAccesoSoporte> {
    consulta
      .select('acceso.id', 'id')
      .addSelect('acceso.ticket', 'ticket')
      .addSelect('acceso.motivo', 'motivo')
      .addSelect('acceso.modo', 'modo')
      .addSelect('acceso.horasSolicitadas', 'horas_solicitadas')
      .addSelect('acceso.estado', 'estado')
      .addSelect('acceso.solicitadoEn', 'solicitado_en')
      .addSelect('acceso.caducaEn', 'caduca_en')
      .addSelect('acceso.horasAprobadas', 'horas_aprobadas')
      .addSelect('acceso.desde', 'desde')
      .addSelect('acceso.hasta', 'hasta')
      .addSelect('acceso.cerradoEn', 'cerrado_en')
      .addSelect('acceso.motivoCierre', 'motivo_cierre')
      .addSelect('acceso.causaCierre', 'causa_cierre');
    for (const [alias, columna, union] of PERSONAS) {
      consulta[union](UsuarioLecturaEntidad.options.name, alias, `${alias}.id = ${columna}`)
        .addSelect(`${alias}.id`, `${alias}_id`)
        .addSelect(`${alias}.nombre`, `${alias}_nombre`)
        .addSelect(`${alias}.correo`, `${alias}_correo`);
    }
    return consulta;
  }

  private accesos(): Repository<FilaAccesoSoporte> {
    return this.unidadDeTrabajo.manager.getRepository(AccesoSoporteEntidad);
  }

  private tenantId(): string {
    return this.contexto.current().tenantId;
  }
}

function persona(id: string | null, nombre: string | null, correo: string | null): UsuarioDelEvento | null {
  return id && nombre !== null && correo !== null ? { id, nombre, correo } : null;
}

function solicitud(fila: FilaSolicitud): SolicitudSoporte {
  return {
    id: fila.id,
    agente: { id: fila.agente_id, nombre: fila.agente_nombre, correo: fila.agente_correo },
    ticket: fila.ticket,
    motivo: fila.motivo,
    modo: fila.modo,
    horasSolicitadas: Number(fila.horas_solicitadas),
    estado: fila.estado,
    solicitadoEn: fila.solicitado_en,
    caducaEn: fila.caduca_en,
    horasAprobadas: fila.horas_aprobadas === null ? null : Number(fila.horas_aprobadas),
    desde: fila.desde,
    hasta: fila.hasta,
    aprobadoPor: persona(fila.aprobador_id, fila.aprobador_nombre, fila.aprobador_correo),
    cerradoPor: persona(fila.cerrador_id, fila.cerrador_nombre, fila.cerrador_correo),
    cerradoEn: fila.cerrado_en,
    motivoCierre: fila.motivo_cierre,
    causaCierre: fila.causa_cierre,
  };
}

function accesoDelAgente(fila: FilaAccesoDeAgente): AccesoDelAgente {
  return {
    id: fila.id,
    tenantId: fila.tenant_id,
    tenantNombre: fila.tenant_nombre,
    ticket: fila.ticket,
    modo: fila.modo,
    estado: fila.estado,
    horasSolicitadas: Number(fila.horas_solicitadas),
    solicitadoEn: fila.solicitado_en,
    desde: fila.desde,
    hasta: fila.hasta,
    motivoCierre: fila.motivo_cierre,
    causaCierre: fila.causa_cierre,
  };
}
