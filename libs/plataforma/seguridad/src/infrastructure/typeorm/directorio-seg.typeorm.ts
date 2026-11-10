import type { TenantContext } from '@vitrina/plataforma/kernel';
import type { TypeOrmUnitOfWork } from '@vitrina/plataforma/kernel-infra';
import type { SelectQueryBuilder } from 'typeorm';
import type { DirectorioSeg, SucursalDirectorio, UsuarioDirectorio } from '../../application/ports/directorio-seg.port.js';
import { MembresiaLecturaEntidad, UsuarioLecturaEntidad, type FilaUsuario } from './entidades-lectura.js';
import { SucursalDirectorioEntidad } from './entidades-org.js';
import { patronDeBusqueda } from './patron-busqueda.js';

/**
 * `seg.usuario` es global y sin RLS: solo se lee unido a una membresía del tenant del contexto, así un id
 * o un texto nunca devuelve personas de otro tenant. Filtra por tenant además de la RLS (regla 3).
 */
export class DirectorioSegTypeOrm implements DirectorioSeg {
  constructor(
    private readonly unidadDeTrabajo: TypeOrmUnitOfWork,
    private readonly contexto: TenantContext,
  ) {}

  async buscarUsuarios(texto: string, limite: number): Promise<string[]> {
    const filas = await this.miembros()
      .select('usuario.id', 'id')
      .andWhere('(usuario.correo ILIKE :patron OR usuario.nombre ILIKE :patron)', { patron: patronDeBusqueda(texto) })
      .orderBy('usuario.id')
      .limit(limite)
      .getRawMany<{ id: string }>();
    return filas.map((fila) => fila.id);
  }

  async usuarios(ids: readonly string[]): Promise<UsuarioDirectorio[]> {
    if (ids.length === 0) return [];
    return this.miembros()
      .select('usuario.id', 'id')
      .addSelect('usuario.nombre', 'nombre')
      .addSelect('usuario.correo', 'correo')
      .andWhere('usuario.id IN (:...ids)', { ids })
      .getRawMany<UsuarioDirectorio>();
  }

  async sucursales(ids: readonly string[]): Promise<SucursalDirectorio[]> {
    if (ids.length === 0) return [];
    return this.unidadDeTrabajo.manager
      .getRepository(SucursalDirectorioEntidad)
      .createQueryBuilder('sucursal')
      .select('sucursal.id', 'id')
      .addSelect('sucursal.codigo', 'codigo')
      .addSelect('sucursal.nombre', 'nombre')
      .where('sucursal.tenantId = :tenantId', { tenantId: this.tenantId() })
      .andWhere('sucursal.id IN (:...ids)', { ids })
      .getRawMany<SucursalDirectorio>();
  }

  private miembros(): SelectQueryBuilder<FilaUsuario> {
    return this.unidadDeTrabajo.manager
      .getRepository(UsuarioLecturaEntidad)
      .createQueryBuilder('usuario')
      .innerJoin(MembresiaLecturaEntidad.options.name, 'membresia', 'membresia.usuarioId = usuario.id')
      .where('membresia.tenantId = :tenantId', { tenantId: this.tenantId() });
  }

  private tenantId(): string {
    return this.contexto.current().tenantId;
  }
}
