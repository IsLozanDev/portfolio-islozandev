import { EntitySchema } from 'typeorm';
import type { Alcance } from '../../domain/alcance.js';
import type { Fecha } from '../../domain/asignacion.js';
import type { EstadoMembresia } from '../../domain/membresia.js';
import { EmpresaUbicacionEntidad, SucursalUbicacionEntidad, UnidadUbicacionEntidad } from './entidades-org.js';

// Mapeo ORM de solo lectura para la administración de miembros (spec 16a) y de roles (spec 16b). La
// escritura sigue en los repositorios con SQL (anteriores al spec 10, regla 11).

export interface FilaMembresia {
  id: string;
  tenantId: string;
  usuarioId: string;
  estado: EstadoMembresia;
  esPropietario: boolean;
  desde: Date;
  hasta: Date | null;
}

/** `seg.usuario` es global y sin RLS: solo se lee unido a una membresía del tenant. */
export interface FilaUsuario {
  id: string;
  correo: string;
  nombre: string;
}

export interface FilaInvitacion {
  id: string;
  tenantId: string;
  membresiaId: string;
  expiraEn: Date;
  usadaEn: Date | null;
  anuladaEn: Date | null;
}

export interface FilaAsignacion {
  id: string;
  tenantId: string;
  membresiaId: string;
  rolId: string | null;
  perfilId: string | null;
  alcance: Alcance;
  empresaId: string | null;
  sucursalId: string | null;
  unidadId: string | null;
  vigenteDesde: Fecha;
  vigenteHasta: Fecha | null;
  revocadaEn: Date | null;
  motivoRevocacion: string | null;
}

export interface FilaRol {
  id: string;
  tenantId: string | null;
  productoCodigo: string;
  codigo: string;
  nombre: string;
  activo: boolean;
  obsoleto: boolean;
}

export interface FilaRolPermiso {
  rolId: string;
  permisoCodigo: string;
}

export interface FilaPermiso {
  codigo: string;
  productoCodigo: string;
  descripcion: string;
  alcanceMinimo: Alcance;
  sensible: boolean;
  obsoleto: boolean;
}

export interface FilaProducto {
  codigo: string;
  nombre: string;
}

export interface FilaModulo {
  id: string;
  productoCodigo: string;
  codigo: string;
  nombre: string;
  orden: number;
  obsoleto: boolean;
}

export interface FilaOpcion {
  id: string;
  moduloId: string;
  codigo: string;
  nombre: string;
  orden: number;
  obsoleto: boolean;
}

export interface FilaOpcionPermiso {
  opcionId: string;
  permisoCodigo: string;
}

export interface FilaPerfil {
  id: string;
  tenantId: string | null;
  codigo: string;
  nombre: string;
}

export interface FilaPerfilRol {
  perfilId: string;
  rolId: string;
}

export const MembresiaLecturaEntidad = new EntitySchema<FilaMembresia>({
  name: 'SegMembresia',
  schema: 'seg',
  tableName: 'membresia',
  columns: {
    id: { type: 'uuid', primary: true },
    tenantId: { name: 'tenant_id', type: 'uuid' },
    usuarioId: { name: 'usuario_id', type: 'uuid' },
    estado: { type: 'varchar' },
    esPropietario: { name: 'es_propietario', type: 'boolean' },
    desde: { type: 'timestamptz' },
    hasta: { type: 'timestamptz', nullable: true },
  },
});

export const UsuarioLecturaEntidad = new EntitySchema<FilaUsuario>({
  name: 'SegUsuario',
  schema: 'seg',
  tableName: 'usuario',
  columns: {
    id: { type: 'uuid', primary: true },
    correo: { name: 'email', type: 'varchar' },
    nombre: { type: 'varchar' },
  },
});

export const InvitacionLecturaEntidad = new EntitySchema<FilaInvitacion>({
  name: 'SegInvitacion',
  schema: 'seg',
  tableName: 'invitacion',
  columns: {
    id: { type: 'uuid', primary: true },
    tenantId: { name: 'tenant_id', type: 'uuid' },
    membresiaId: { name: 'membresia_id', type: 'uuid' },
    expiraEn: { name: 'expira_en', type: 'timestamptz' },
    usadaEn: { name: 'usada_en', type: 'timestamptz', nullable: true },
    anuladaEn: { name: 'anulada_en', type: 'timestamptz', nullable: true },
  },
});

export const AsignacionLecturaEntidad = new EntitySchema<FilaAsignacion>({
  name: 'SegAsignacion',
  schema: 'seg',
  tableName: 'asignacion',
  columns: {
    id: { type: 'uuid', primary: true },
    tenantId: { name: 'tenant_id', type: 'uuid' },
    membresiaId: { name: 'membresia_id', type: 'uuid' },
    rolId: { name: 'rol_id', type: 'uuid', nullable: true },
    perfilId: { name: 'perfil_id', type: 'uuid', nullable: true },
    alcance: { type: 'varchar' },
    empresaId: { name: 'empresa_id', type: 'uuid', nullable: true },
    sucursalId: { name: 'sucursal_id', type: 'uuid', nullable: true },
    unidadId: { name: 'unidad_id', type: 'uuid', nullable: true },
    vigenteDesde: { name: 'vigente_desde', type: 'date' },
    vigenteHasta: { name: 'vigente_hasta', type: 'date', nullable: true },
    revocadaEn: { name: 'revocada_en', type: 'timestamptz', nullable: true },
    motivoRevocacion: { name: 'motivo_revocacion', type: 'varchar', nullable: true },
  },
});

export const RolLecturaEntidad = new EntitySchema<FilaRol>({
  name: 'SegRol',
  schema: 'seg',
  tableName: 'rol',
  columns: {
    id: { type: 'uuid', primary: true },
    tenantId: { name: 'tenant_id', type: 'uuid', nullable: true },
    productoCodigo: { name: 'producto_codigo', type: 'varchar' },
    codigo: { type: 'varchar' },
    nombre: { type: 'varchar' },
    activo: { type: 'boolean' },
    obsoleto: { type: 'boolean' },
  },
});

export const RolPermisoLecturaEntidad = new EntitySchema<FilaRolPermiso>({
  name: 'SegRolPermiso',
  schema: 'seg',
  tableName: 'rol_permiso',
  columns: {
    rolId: { name: 'rol_id', type: 'uuid', primary: true },
    permisoCodigo: { name: 'permiso_codigo', type: 'varchar', primary: true },
  },
});

export const PermisoLecturaEntidad = new EntitySchema<FilaPermiso>({
  name: 'SegPermiso',
  schema: 'seg',
  tableName: 'permiso',
  columns: {
    codigo: { type: 'varchar', primary: true },
    productoCodigo: { name: 'producto_codigo', type: 'varchar' },
    descripcion: { type: 'varchar' },
    alcanceMinimo: { name: 'alcance_minimo', type: 'varchar' },
    sensible: { type: 'boolean' },
    obsoleto: { type: 'boolean' },
  },
});

export const ProductoLecturaEntidad = new EntitySchema<FilaProducto>({
  name: 'SegProducto',
  schema: 'seg',
  tableName: 'producto',
  columns: {
    codigo: { type: 'varchar', primary: true },
    nombre: { type: 'varchar' },
  },
});

export const ModuloLecturaEntidad = new EntitySchema<FilaModulo>({
  name: 'SegModulo',
  schema: 'seg',
  tableName: 'modulo',
  columns: {
    id: { type: 'uuid', primary: true },
    productoCodigo: { name: 'producto_codigo', type: 'varchar' },
    codigo: { type: 'varchar' },
    nombre: { type: 'varchar' },
    orden: { type: 'smallint' },
    obsoleto: { type: 'boolean' },
  },
});

export const OpcionLecturaEntidad = new EntitySchema<FilaOpcion>({
  name: 'SegOpcion',
  schema: 'seg',
  tableName: 'opcion',
  columns: {
    id: { type: 'uuid', primary: true },
    moduloId: { name: 'modulo_id', type: 'uuid' },
    codigo: { type: 'varchar' },
    nombre: { type: 'varchar' },
    orden: { type: 'smallint' },
    obsoleto: { type: 'boolean' },
  },
});

export const OpcionPermisoLecturaEntidad = new EntitySchema<FilaOpcionPermiso>({
  name: 'SegOpcionPermiso',
  schema: 'seg',
  tableName: 'opcion_permiso',
  columns: {
    opcionId: { name: 'opcion_id', type: 'uuid', primary: true },
    permisoCodigo: { name: 'permiso_codigo', type: 'varchar', primary: true },
  },
});

export const PerfilLecturaEntidad = new EntitySchema<FilaPerfil>({
  name: 'SegPerfil',
  schema: 'seg',
  tableName: 'perfil',
  columns: {
    id: { type: 'uuid', primary: true },
    tenantId: { name: 'tenant_id', type: 'uuid', nullable: true },
    codigo: { type: 'varchar' },
    nombre: { type: 'varchar' },
  },
});

export const PerfilRolLecturaEntidad = new EntitySchema<FilaPerfilRol>({
  name: 'SegPerfilRol',
  schema: 'seg',
  tableName: 'perfil_rol',
  columns: {
    perfilId: { name: 'perfil_id', type: 'uuid', primary: true },
    rolId: { name: 'rol_id', type: 'uuid', primary: true },
  },
});

export const ENTIDADES_SEG_LECTURA = [
  MembresiaLecturaEntidad,
  UsuarioLecturaEntidad,
  InvitacionLecturaEntidad,
  AsignacionLecturaEntidad,
  RolLecturaEntidad,
  RolPermisoLecturaEntidad,
  PermisoLecturaEntidad,
  ProductoLecturaEntidad,
  ModuloLecturaEntidad,
  OpcionLecturaEntidad,
  OpcionPermisoLecturaEntidad,
  PerfilLecturaEntidad,
  PerfilRolLecturaEntidad,
  EmpresaUbicacionEntidad,
  SucursalUbicacionEntidad,
  UnidadUbicacionEntidad,
];
