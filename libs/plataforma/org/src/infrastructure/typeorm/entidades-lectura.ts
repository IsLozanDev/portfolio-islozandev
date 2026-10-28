import { EntitySchema } from 'typeorm';
import type { Atributos, TipoUnidad } from '../../domain/unidad-operativa.js';

// Mapeo ORM de solo lectura para las listas (spec 17a). La escritura sigue en los repositorios con SQL
// (anteriores al spec 10, regla 11). bigint llega como string desde node-pg: se convierte al mapear.

export interface FilaEmpresa {
  id: string;
  tenantId: string;
  ruc: string;
  razonSocial: string;
  nombreComercial: string | null;
  direccionFiscal: string | null;
  ubigeo: string | null;
  activo: boolean;
  version: string;
}

export interface FilaSucursal {
  id: string;
  tenantId: string;
  empresaId: string;
  codigo: string;
  nombre: string;
  codigoEstablecimientoSunat: string | null;
  direccion: string | null;
  ubigeo: string | null;
  telefono: string | null;
  zonaHoraria: string;
  esPrincipal: boolean;
  activo: boolean;
  version: string;
}

export interface FilaUnidad {
  id: string;
  tenantId: string;
  empresaId: string;
  sucursalId: string | null;
  tipo: TipoUnidad;
  codigo: string;
  nombre: string;
  padreId: string | null;
  atributos: Atributos;
  activo: boolean;
  version: string;
}

export const EmpresaLecturaEntidad = new EntitySchema<FilaEmpresa>({
  name: 'OrgEmpresa',
  schema: 'org',
  tableName: 'empresa',
  columns: {
    id: { type: 'uuid', primary: true },
    tenantId: { name: 'tenant_id', type: 'uuid' },
    ruc: { type: 'char' },
    razonSocial: { name: 'razon_social', type: 'varchar' },
    nombreComercial: { name: 'nombre_comercial', type: 'varchar', nullable: true },
    direccionFiscal: { name: 'direccion_fiscal', type: 'varchar', nullable: true },
    ubigeo: { type: 'char', nullable: true },
    activo: { type: 'boolean' },
    version: { type: 'bigint' },
  },
});

export const SucursalLecturaEntidad = new EntitySchema<FilaSucursal>({
  name: 'OrgSucursal',
  schema: 'org',
  tableName: 'sucursal',
  columns: {
    id: { type: 'uuid', primary: true },
    tenantId: { name: 'tenant_id', type: 'uuid' },
    empresaId: { name: 'empresa_id', type: 'uuid' },
    codigo: { type: 'varchar' },
    nombre: { type: 'varchar' },
    codigoEstablecimientoSunat: { name: 'codigo_establecimiento_sunat', type: 'char', nullable: true },
    direccion: { type: 'varchar', nullable: true },
    ubigeo: { type: 'char', nullable: true },
    telefono: { type: 'varchar', nullable: true },
    zonaHoraria: { name: 'zona_horaria', type: 'varchar' },
    esPrincipal: { name: 'es_principal', type: 'boolean' },
    activo: { type: 'boolean' },
    version: { type: 'bigint' },
  },
});

export const UnidadLecturaEntidad = new EntitySchema<FilaUnidad>({
  name: 'OrgUnidadOperativa',
  schema: 'org',
  tableName: 'unidad_operativa',
  columns: {
    id: { type: 'uuid', primary: true },
    tenantId: { name: 'tenant_id', type: 'uuid' },
    empresaId: { name: 'empresa_id', type: 'uuid' },
    sucursalId: { name: 'sucursal_id', type: 'uuid', nullable: true },
    tipo: { type: 'varchar' },
    codigo: { type: 'varchar' },
    nombre: { type: 'varchar' },
    padreId: { name: 'padre_id', type: 'uuid', nullable: true },
    atributos: { type: 'jsonb' },
    activo: { type: 'boolean' },
    version: { type: 'bigint' },
  },
});
