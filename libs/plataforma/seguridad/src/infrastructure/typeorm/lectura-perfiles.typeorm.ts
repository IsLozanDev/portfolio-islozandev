import type { TenantContext } from '@vitrina/plataforma/kernel';
import type { TypeOrmUnitOfWork } from '@vitrina/plataforma/kernel-infra';
import type { SelectQueryBuilder } from 'typeorm';
import type { LecturaPerfiles, PerfilDetalle, PerfilListado } from '../../application/ports/lectura-perfiles.js';
import { PerfilLecturaEntidad, PerfilRolLecturaEntidad, RolLecturaEntidad, type FilaPerfil } from './entidades-lectura.js';

interface FilaRolDelPerfil {
  perfil_id: string;
  rol_id: string;
  producto_codigo: string;
}

/** Perfiles propios del tenant del contexto y predefinidos. Filtra por tenant además de la RLS (regla 3). */
export class LecturaPerfilesTypeOrm implements LecturaPerfiles {
  constructor(
    private readonly unidadDeTrabajo: TypeOrmUnitOfWork,
    private readonly contexto: TenantContext,
  ) {}

  async listar(): Promise<PerfilListado[]> {
    const perfiles = await this.perfilesVisibles().orderBy('perfil.nombre').addOrderBy('perfil.id').getMany();
    const rolesPorPerfil = agruparPorPerfil(await this.rolesDe(perfiles.map((perfil) => perfil.id)));
    return perfiles.map((perfil) => {
      const roles = rolesPorPerfil.get(perfil.id) ?? [];
      return {
        ...perfilResumen(perfil),
        totalRoles: roles.length,
        productos: [...new Set(roles.map((rol) => rol.producto_codigo))].sort(),
      };
    });
  }

  async detalle(perfilId: string): Promise<PerfilDetalle | null> {
    const perfil = await this.perfilesVisibles().andWhere('perfil.id = :perfilId', { perfilId }).getOne();
    if (!perfil) return null;
    const roles = await this.rolesDe([perfilId]);
    return { ...perfilResumen(perfil), roles: roles.map((rol) => rol.rol_id).sort() };
  }

  private perfilesVisibles(): SelectQueryBuilder<FilaPerfil> {
    return this.unidadDeTrabajo.manager
      .getRepository(PerfilLecturaEntidad)
      .createQueryBuilder('perfil')
      .where('(perfil.tenantId = :tenantId OR perfil.tenantId IS NULL)', { tenantId: this.contexto.current().tenantId });
  }

  private async rolesDe(perfilIds: readonly string[]): Promise<FilaRolDelPerfil[]> {
    if (perfilIds.length === 0) return [];
    return this.unidadDeTrabajo.manager
      .getRepository(PerfilRolLecturaEntidad)
      .createQueryBuilder('perfilRol')
      .innerJoin(RolLecturaEntidad.options.name, 'rol', 'rol.id = perfilRol.rolId')
      .select('perfilRol.perfilId', 'perfil_id')
      .addSelect('perfilRol.rolId', 'rol_id')
      .addSelect('rol.productoCodigo', 'producto_codigo')
      .where('perfilRol.perfilId IN (:...perfilIds)', { perfilIds })
      .getRawMany<FilaRolDelPerfil>();
  }
}

function perfilResumen(perfil: FilaPerfil): Omit<PerfilListado, 'totalRoles' | 'productos'> {
  return { id: perfil.id, codigo: perfil.codigo, nombre: perfil.nombre, predefinido: perfil.tenantId === null };
}

function agruparPorPerfil(filas: readonly FilaRolDelPerfil[]): Map<string, FilaRolDelPerfil[]> {
  const grupos = new Map<string, FilaRolDelPerfil[]>();
  for (const fila of filas) grupos.set(fila.perfil_id, [...(grupos.get(fila.perfil_id) ?? []), fila]);
  return grupos;
}
