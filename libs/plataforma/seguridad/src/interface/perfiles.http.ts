import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { z } from 'zod';
import type { PerfilDetalle, PerfilListado } from '../application/ports/lectura-perfiles.js';
import type { RolListado } from '../application/ports/lectura-roles.js';

const ROLES_MAXIMOS_POR_PERFIL = 100;
/** Igual que `seg.perfil.nombre`; el rango real (3-50, 3-100) lo valida el dominio. */
const LONGITUD_MAXIMA_TEXTO = 100;

const texto = z.string().max(LONGITUD_MAXIMA_TEXTO);
const roles = z.array(z.uuid()).max(ROLES_MAXIMOS_POR_PERFIL);

export const EsquemaCrearPerfil = z.object({ codigo: texto, nombre: texto, roles });
export const EsquemaCopiarPerfil = z.object({ codigo: texto, nombre: texto, roles: roles.optional() });
export const EsquemaCambiarRolesPerfil = z.object({ roles });

export class PerfilDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  codigo!: string;

  @ApiProperty()
  nombre!: string;

  @ApiProperty({ description: 'No se editan sus roles, se copia' })
  predefinido!: boolean;

  @ApiProperty()
  total_roles!: number;

  @ApiProperty({ type: [String], description: 'Productos distintos de sus roles, ordenados' })
  productos!: string[];
}

export class ListadoPerfilesDto {
  @ApiProperty({ type: [PerfilDto], description: 'Propios y predefinidos, por nombre, sin paginar' })
  items!: PerfilDto[];
}

export class PerfilDetalleDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  codigo!: string;

  @ApiProperty()
  nombre!: string;

  @ApiProperty()
  predefinido!: boolean;

  @ApiProperty({ type: [String], format: 'uuid', description: 'Ids de sus roles, ordenados' })
  roles!: string[];
}

export class RolDisponibleDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  codigo!: string;

  @ApiProperty()
  nombre!: string;

  @ApiProperty()
  producto_codigo!: string;

  @ApiProperty()
  producto_nombre!: string;

  @ApiProperty()
  predefinido!: boolean;
}

export class ListadoRolesDisponiblesDto {
  @ApiProperty({ type: [RolDisponibleDto], description: 'Roles activos de PLAT (dentro del techo del cliente) y de productos contratados, por producto y nombre' })
  items!: RolDisponibleDto[];
}

export class CrearPerfilDto {
  @ApiProperty({ minLength: 3, maxLength: 50, description: 'Único en el tenant' })
  codigo!: string;

  @ApiProperty({ minLength: 3, maxLength: 100 })
  nombre!: string;

  @ApiProperty({ type: [String], format: 'uuid', description: 'Al menos uno; activos, de PLAT o de productos contratados' })
  roles!: string[];
}

export class CopiarPerfilDto {
  @ApiProperty({ minLength: 3, maxLength: 50 })
  codigo!: string;

  @ApiProperty({ minLength: 3, maxLength: 100 })
  nombre!: string;

  @ApiPropertyOptional({ type: [String], format: 'uuid', description: 'Reemplaza los roles del origen' })
  roles?: string[];
}

export class CambiarRolesPerfilDto {
  @ApiProperty({ type: [String], format: 'uuid', description: 'El conjunto completo' })
  roles!: string[];
}

export class PerfilCreadoDto {
  @ApiProperty({ format: 'uuid' })
  perfil_id!: string;
}

export function listadoPerfilesDto(perfiles: readonly PerfilListado[]): ListadoPerfilesDto {
  return {
    items: perfiles.map((perfil) => ({
      id: perfil.id,
      codigo: perfil.codigo,
      nombre: perfil.nombre,
      predefinido: perfil.predefinido,
      total_roles: perfil.totalRoles,
      productos: [...perfil.productos],
    })),
  };
}

export function perfilDetalleDto(perfil: PerfilDetalle): PerfilDetalleDto {
  return { id: perfil.id, codigo: perfil.codigo, nombre: perfil.nombre, predefinido: perfil.predefinido, roles: [...perfil.roles] };
}

export function listadoRolesDisponiblesDto(roles: readonly RolListado[]): ListadoRolesDisponiblesDto {
  return {
    items: roles.map((rol) => ({
      id: rol.id,
      codigo: rol.codigo,
      nombre: rol.nombre,
      producto_codigo: rol.productoCodigo,
      producto_nombre: rol.productoNombre,
      predefinido: rol.predefinido,
    })),
  };
}
