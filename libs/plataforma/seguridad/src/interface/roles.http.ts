import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { z } from 'zod';
import type { ArbolPermisos, OpcionDelArbol, PermisoDelArbol } from '../application/arbol-permisos.js';
import type { Producto, RolDetalle, RolListado } from '../application/ports/lectura-roles.js';
import type { ResultadoInactivar } from '../application/rol.casos-de-uso.js';
import { ALCANCES } from '../domain/alcance.js';

/** Igual que `seg.permiso.codigo`. */
const LONGITUD_MAXIMA_PERMISO = 80;
const PERMISOS_MAXIMOS_POR_ROL = 500;
/** Igual que `seg.rol.nombre`, el texto más largo del cuerpo; el rango real (3-50, 3-100) lo valida el dominio. */
const LONGITUD_MAXIMA_TEXTO = 100;
/** `seg.producto.codigo`: PLAT, REST, LIB... */
const CODIGO_PRODUCTO = /^[A-Z]{2,5}$/;

const texto = z.string().max(LONGITUD_MAXIMA_TEXTO);
const permisos = z.array(z.string().max(LONGITUD_MAXIMA_PERMISO)).max(PERMISOS_MAXIMOS_POR_ROL);
export const codigoProducto = z.string().regex(CODIGO_PRODUCTO);

export const EsquemaCrearRol = z.object({ producto_codigo: codigoProducto, codigo: texto, nombre: texto, permisos });
export const EsquemaCopiarRol = z.object({ codigo: texto, nombre: texto, permisos: permisos.optional() });
export const EsquemaCambiarPermisosRol = z.object({ permisos });
export const EsquemaInactivarRol = z.object({ confirmado: z.boolean() });

export class RolDto {
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

  @ApiProperty({ description: 'Del manifiesto: no se edita ni se inactiva, se copia (TR-CA-032)' })
  predefinido!: boolean;

  @ApiProperty({ description: 'Activo y no obsoleto' })
  activo!: boolean;

  @ApiProperty()
  total_permisos!: number;
}

export class ListadoRolesDto {
  @ApiProperty({ type: [RolDto], description: 'Por producto y nombre, sin paginar' })
  items!: RolDto[];
}

export class RolDetalleDto {
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

  @ApiProperty()
  activo!: boolean;

  @ApiProperty({ type: [String], description: 'Ordenados por código' })
  permisos!: string[];
}

export class CrearRolDto {
  @ApiProperty({ example: 'REST', description: 'PLAT o un producto con suscripción vigente' })
  producto_codigo!: string;

  @ApiProperty({ minLength: 3, maxLength: 50, description: 'Único en el tenant' })
  codigo!: string;

  @ApiProperty({ minLength: 3, maxLength: 100 })
  nombre!: string;

  @ApiProperty({ type: [String], description: 'Del catálogo del producto; en PLAT, solo los de PLAT_PROPIETARIO' })
  permisos!: string[];
}

export class CopiarRolDto {
  @ApiProperty({ minLength: 3, maxLength: 50 })
  codigo!: string;

  @ApiProperty({ minLength: 3, maxLength: 100 })
  nombre!: string;

  @ApiPropertyOptional({ type: [String], description: 'Reemplaza los permisos del origen (TR-CA-031)' })
  permisos?: string[];
}

export class CambiarPermisosRolDto {
  @ApiProperty({ type: [String], description: 'El conjunto completo' })
  permisos!: string[];
}

export class InactivarRolDto {
  @ApiProperty({ description: 'false: solo informa a cuántos usuarios afecta (TR-CA-033)' })
  confirmado!: boolean;
}

export class RolCreadoDto {
  @ApiProperty({ format: 'uuid' })
  rol_id!: string;
}

export class ResultadoInactivarDto {
  @ApiProperty()
  requiere_confirmacion!: boolean;

  @ApiProperty({ description: 'Membresías con una asignación vigente al rol o a un perfil que lo contiene' })
  afectados!: number;
}

export class ProductoDto {
  @ApiProperty()
  codigo!: string;

  @ApiProperty()
  nombre!: string;
}

export class ListadoProductosDto {
  @ApiProperty({ type: [ProductoDto], description: 'PLAT y los productos con suscripción vigente' })
  items!: ProductoDto[];
}

export class PermisoDelArbolDto {
  @ApiProperty()
  codigo!: string;

  @ApiProperty()
  descripcion!: string;

  @ApiProperty({ description: 'Asignar un rol con él exige MFA reciente (TR-RN-009)' })
  sensible!: boolean;

  @ApiProperty({ enum: ALCANCES })
  alcance_minimo!: string;
}

export class OpcionDelArbolDto {
  @ApiProperty()
  codigo!: string;

  @ApiProperty()
  nombre!: string;

  @ApiProperty({ type: [PermisoDelArbolDto] })
  permisos!: PermisoDelArbolDto[];
}

export class ModuloDelArbolDto {
  @ApiProperty()
  codigo!: string;

  @ApiProperty()
  nombre!: string;

  @ApiProperty({ type: [OpcionDelArbolDto] })
  opciones!: OpcionDelArbolDto[];
}

export class ArbolPermisosDto {
  @ApiProperty()
  producto_codigo!: string;

  @ApiProperty({ type: [ModuloDelArbolDto], description: 'Cada permiso aparece en una sola opción' })
  modulos!: ModuloDelArbolDto[];

  @ApiProperty({ type: [PermisoDelArbolDto], description: 'Permisos sin opción de menú' })
  otros!: PermisoDelArbolDto[];
}

export function listadoRolesDto(roles: readonly RolListado[]): ListadoRolesDto {
  return {
    items: roles.map((rol) => ({
      id: rol.id,
      codigo: rol.codigo,
      nombre: rol.nombre,
      producto_codigo: rol.productoCodigo,
      producto_nombre: rol.productoNombre,
      predefinido: rol.predefinido,
      activo: rol.activo,
      total_permisos: rol.totalPermisos,
    })),
  };
}

export function rolDetalleDto(rol: RolDetalle): RolDetalleDto {
  return {
    id: rol.id,
    codigo: rol.codigo,
    nombre: rol.nombre,
    producto_codigo: rol.productoCodigo,
    producto_nombre: rol.productoNombre,
    predefinido: rol.predefinido,
    activo: rol.activo,
    permisos: [...rol.permisos],
  };
}

export function resultadoInactivarDto(resultado: ResultadoInactivar): ResultadoInactivarDto {
  return { requiere_confirmacion: resultado.requiereConfirmacion, afectados: resultado.afectados };
}

export function listadoProductosDto(productos: readonly Producto[]): ListadoProductosDto {
  return { items: productos.map((producto) => ({ codigo: producto.codigo, nombre: producto.nombre })) };
}

function permisoDelArbolDto(permiso: PermisoDelArbol): PermisoDelArbolDto {
  return { codigo: permiso.codigo, descripcion: permiso.descripcion, sensible: permiso.sensible, alcance_minimo: permiso.alcanceMinimo };
}

function opcionDelArbolDto(opcion: OpcionDelArbol): OpcionDelArbolDto {
  return { codigo: opcion.codigo, nombre: opcion.nombre, permisos: opcion.permisos.map(permisoDelArbolDto) };
}

export function arbolPermisosDto(arbol: ArbolPermisos): ArbolPermisosDto {
  return {
    producto_codigo: arbol.productoCodigo,
    modulos: arbol.modulos.map((modulo) => ({ codigo: modulo.codigo, nombre: modulo.nombre, opciones: modulo.opciones.map(opcionDelArbolDto) })),
    otros: arbol.otros.map(permisoDelArbolDto),
  };
}
