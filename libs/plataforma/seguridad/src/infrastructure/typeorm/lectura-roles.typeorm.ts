import type { TenantContext } from '@vitrina/plataforma/kernel';
import type { TypeOrmUnitOfWork } from '@vitrina/plataforma/kernel-infra';
import type { EntitySchema, ObjectLiteral, SelectQueryBuilder } from 'typeorm';
import type { ElementoDelMenu, FilaCatalogo, LecturaRoles, Producto, RolDetalle, RolListado } from '../../application/ports/lectura-roles.js';
import type { Alcance } from '../../domain/alcance.js';
import {
  ModuloLecturaEntidad,
  OpcionLecturaEntidad,
  OpcionPermisoLecturaEntidad,
  PermisoLecturaEntidad,
  ProductoLecturaEntidad,
  RolLecturaEntidad,
  RolPermisoLecturaEntidad,
} from './entidades-lectura.js';

interface FilaRolResumen {
  id: string;
  codigo: string;
  nombre: string;
  producto_codigo: string;
  producto_nombre: string;
  tenant_id: string | null;
  activo: boolean;
  obsoleto: boolean;
}

interface FilaRolListado extends FilaRolResumen {
  total_permisos: string;
}

interface FilaCatalogoPlana {
  permiso_codigo: string;
  permiso_descripcion: string;
  permiso_sensible: boolean;
  permiso_alcance_minimo: Alcance;
  modulo_codigo: string | null;
  modulo_nombre: string | null;
  modulo_orden: number | null;
  opcion_codigo: string | null;
  opcion_nombre: string | null;
  opcion_orden: number | null;
}

/** Roles propios del tenant del contexto y predefinidos. Filtra por tenant además de la RLS (regla 3). */
export class LecturaRolesTypeOrm implements LecturaRoles {
  constructor(
    private readonly unidadDeTrabajo: TypeOrmUnitOfWork,
    private readonly contexto: TenantContext,
  ) {}

  async listar(productos: readonly string[]): Promise<RolListado[]> {
    if (productos.length === 0) return [];
    const filas = await this.rolesVisibles()
      .addSelect(
        (subconsulta) => subconsulta.select('count(*)').from(RolPermisoLecturaEntidad, 'rolPermiso').where('rolPermiso.rolId = rol.id'),
        'total_permisos',
      )
      .andWhere('rol.productoCodigo IN (:...productos)', { productos })
      .andWhere('(rol.tenantId IS NOT NULL OR (rol.activo = true AND rol.obsoleto = false))')
      .orderBy('rol.productoCodigo')
      .addOrderBy('rol.nombre')
      .addOrderBy('rol.id')
      .getRawMany<FilaRolListado>();
    return filas.map((fila) => ({ ...rolResumen(fila), totalPermisos: Number(fila.total_permisos) }));
  }

  async detalle(rolId: string): Promise<RolDetalle | null> {
    const fila = await this.rolesVisibles().andWhere('rol.id = :rolId', { rolId }).getRawOne<FilaRolResumen>();
    if (!fila) return null;
    return { ...rolResumen(fila), permisos: await this.permisosDe(rolId) };
  }

  async catalogo(productoCodigo: string): Promise<FilaCatalogo[]> {
    const filas = await this.repositorio(PermisoLecturaEntidad, 'permiso')
      .leftJoin(OpcionPermisoLecturaEntidad.options.name, 'opcionPermiso', 'opcionPermiso.permisoCodigo = permiso.codigo')
      .leftJoin(OpcionLecturaEntidad.options.name, 'opcion', 'opcion.id = opcionPermiso.opcionId AND opcion.obsoleto = false')
      .leftJoin(ModuloLecturaEntidad.options.name, 'modulo', 'modulo.id = opcion.moduloId AND modulo.obsoleto = false')
      .select('permiso.codigo', 'permiso_codigo')
      .addSelect('permiso.descripcion', 'permiso_descripcion')
      .addSelect('permiso.sensible', 'permiso_sensible')
      .addSelect('permiso.alcanceMinimo', 'permiso_alcance_minimo')
      .addSelect('modulo.codigo', 'modulo_codigo')
      .addSelect('modulo.nombre', 'modulo_nombre')
      .addSelect('modulo.orden', 'modulo_orden')
      .addSelect('opcion.codigo', 'opcion_codigo')
      .addSelect('opcion.nombre', 'opcion_nombre')
      .addSelect('opcion.orden', 'opcion_orden')
      .where('permiso.productoCodigo = :productoCodigo', { productoCodigo })
      .andWhere('permiso.obsoleto = false')
      .orderBy('permiso.codigo')
      .getRawMany<FilaCatalogoPlana>();
    return filas.map(filaCatalogo);
  }

  async productos(codigos: readonly string[]): Promise<Producto[]> {
    if (codigos.length === 0) return [];
    const filas = await this.repositorio(ProductoLecturaEntidad, 'producto').where('producto.codigo IN (:...codigos)', { codigos }).orderBy('producto.codigo').getMany();
    return filas.map((fila) => ({ codigo: fila.codigo, nombre: fila.nombre }));
  }

  private get tenantId(): string {
    return this.contexto.current().tenantId;
  }

  private repositorio<F extends ObjectLiteral>(entidad: EntitySchema<F>, alias: string): SelectQueryBuilder<F> {
    return this.unidadDeTrabajo.manager.getRepository(entidad).createQueryBuilder(alias);
  }

  private rolesVisibles(): SelectQueryBuilder<ObjectLiteral> {
    return this.repositorio(RolLecturaEntidad, 'rol')
      .innerJoin(ProductoLecturaEntidad.options.name, 'producto', 'producto.codigo = rol.productoCodigo')
      .select('rol.id', 'id')
      .addSelect('rol.codigo', 'codigo')
      .addSelect('rol.nombre', 'nombre')
      .addSelect('rol.productoCodigo', 'producto_codigo')
      .addSelect('producto.nombre', 'producto_nombre')
      .addSelect('rol.tenantId', 'tenant_id')
      .addSelect('rol.activo', 'activo')
      .addSelect('rol.obsoleto', 'obsoleto')
      .where('(rol.tenantId = :tenantId OR rol.tenantId IS NULL)', { tenantId: this.tenantId });
  }

  private async permisosDe(rolId: string): Promise<string[]> {
    const filas = await this.repositorio(RolPermisoLecturaEntidad, 'rolPermiso')
      .where('rolPermiso.rolId = :rolId', { rolId })
      .orderBy('rolPermiso.permisoCodigo')
      .getMany();
    return filas.map((fila) => fila.permisoCodigo);
  }
}

function rolResumen(fila: FilaRolResumen): Omit<RolListado, 'totalPermisos'> {
  return {
    id: fila.id,
    codigo: fila.codigo,
    nombre: fila.nombre,
    productoCodigo: fila.producto_codigo,
    productoNombre: fila.producto_nombre,
    predefinido: fila.tenant_id === null,
    activo: fila.activo && !fila.obsoleto,
  };
}

/** Una opción sin módulo vigente cuenta como permiso sin opción. */
function filaCatalogo(fila: FilaCatalogoPlana): FilaCatalogo {
  const permiso = {
    codigo: fila.permiso_codigo,
    descripcion: fila.permiso_descripcion,
    sensible: fila.permiso_sensible,
    alcanceMinimo: fila.permiso_alcance_minimo,
  };
  const modulo = elementoDelMenu(fila.modulo_codigo, fila.modulo_nombre, fila.modulo_orden);
  const opcion = elementoDelMenu(fila.opcion_codigo, fila.opcion_nombre, fila.opcion_orden);
  if (!modulo || !opcion) return { permiso, modulo: null, opcion: null };
  return { permiso, modulo, opcion };
}

function elementoDelMenu(codigo: string | null, nombre: string | null, orden: number | null): ElementoDelMenu | null {
  if (codigo === null || nombre === null || orden === null) return null;
  return { codigo, nombre, orden: Number(orden) };
}
