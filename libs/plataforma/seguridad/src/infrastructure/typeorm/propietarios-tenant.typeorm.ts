import type { Clock, TenantContext } from '@vitrina/plataforma/kernel';
import type { TypeOrmUnitOfWork } from '@vitrina/plataforma/kernel-infra';
import { ROL_PROPIETARIO } from '../../application/invitar-propietario.js';
import { fechaLocal } from '../../application/otorgar-asignacion.js';
import type { PropietariosTenant, PropietarioTenant } from '../../application/ports/propietarios-tenant.js';
import { AsignacionLecturaEntidad, MembresiaLecturaEntidad, RolLecturaEntidad, UsuarioLecturaEntidad } from './entidades-lectura.js';

const MEMBRESIA_ACTIVA = 'ACTIVO';

/**
 * Usuarios del tenant del contexto con membresía ACTIVA y una asignación vigente del rol predefinido
 * PLAT_PROPIETARIO (sin revocar y con hoy, en Perú, dentro de su vigencia). `seg.usuario` es global: solo se lee
 * unido a la membresía del tenant. Filtra por tenant además de la RLS (regla 3).
 */
export class PropietariosTenantTypeOrm implements PropietariosTenant {
  constructor(
    private readonly unidadDeTrabajo: TypeOrmUnitOfWork,
    private readonly contexto: TenantContext,
    private readonly reloj: Clock,
  ) {}

  listar(): Promise<PropietarioTenant[]> {
    const tenantId = this.contexto.current().tenantId;
    return this.unidadDeTrabajo.manager
      .getRepository(UsuarioLecturaEntidad)
      .createQueryBuilder('usuario')
      .select('usuario.id', 'usuarioId')
      .addSelect('usuario.correo', 'correo')
      .distinct(true)
      .innerJoin(MembresiaLecturaEntidad.options.name, 'membresia', 'membresia.usuarioId = usuario.id')
      .innerJoin(AsignacionLecturaEntidad.options.name, 'asignacion', 'asignacion.membresiaId = membresia.id')
      .innerJoin(RolLecturaEntidad.options.name, 'rol', 'rol.id = asignacion.rolId')
      .where('membresia.tenantId = :tenantId', { tenantId })
      .andWhere('membresia.estado = :estado', { estado: MEMBRESIA_ACTIVA })
      .andWhere('asignacion.tenantId = :tenantId')
      .andWhere('asignacion.revocadaEn IS NULL')
      .andWhere('asignacion.vigenteDesde <= :hoy', { hoy: fechaLocal(this.reloj.now()) })
      .andWhere('(asignacion.vigenteHasta IS NULL OR asignacion.vigenteHasta >= :hoy)')
      .andWhere('rol.codigo = :rol', { rol: ROL_PROPIETARIO })
      .andWhere('rol.tenantId IS NULL')
      .orderBy('usuario.correo')
      .getRawMany<PropietarioTenant>();
  }
}
