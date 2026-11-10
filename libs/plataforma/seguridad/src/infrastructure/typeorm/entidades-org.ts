import { EntitySchema } from 'typeorm';

// Nombres de la ubicación de una asignación (spec 16a). Solo las columnas que seg muestra; org sigue
// siendo el dueño de estas tablas y de su escritura.

export interface FilaUbicacion {
  id: string;
  tenantId: string;
  nombre: string;
}

export const EmpresaUbicacionEntidad = new EntitySchema<FilaUbicacion>({
  name: 'SegEmpresa',
  schema: 'org',
  tableName: 'empresa',
  columns: {
    id: { type: 'uuid', primary: true },
    tenantId: { name: 'tenant_id', type: 'uuid' },
    nombre: { name: 'razon_social', type: 'varchar' },
  },
});

export const SucursalUbicacionEntidad = new EntitySchema<FilaUbicacion>({
  name: 'SegSucursal',
  schema: 'org',
  tableName: 'sucursal',
  columns: {
    id: { type: 'uuid', primary: true },
    tenantId: { name: 'tenant_id', type: 'uuid' },
    nombre: { type: 'varchar' },
  },
});

export const UnidadUbicacionEntidad = new EntitySchema<FilaUbicacion>({
  name: 'SegUnidadOperativa',
  schema: 'org',
  tableName: 'unidad_operativa',
  columns: {
    id: { type: 'uuid', primary: true },
    tenantId: { name: 'tenant_id', type: 'uuid' },
    nombre: { type: 'varchar' },
  },
});

/** Código del tenant: la solicitud de soporte comprueba el tenant operador y que el destino exista (spec 18). */
export interface FilaTenantCodigo {
  id: string;
  codigo: string;
}

export const TenantCodigoEntidad = new EntitySchema<FilaTenantCodigo>({
  name: 'SegTenant',
  schema: 'org',
  tableName: 'tenant',
  columns: {
    id: { type: 'uuid', primary: true },
    codigo: { type: 'varchar' },
  },
});

/** Código y nombre de la sucursal para componentes que guardan solo su id (spec 20b, `DirectorioSeg`). */
export interface FilaSucursalDirectorio {
  id: string;
  tenantId: string;
  codigo: string;
  nombre: string;
}

export const SucursalDirectorioEntidad = new EntitySchema<FilaSucursalDirectorio>({
  name: 'SegSucursalDirectorio',
  schema: 'org',
  tableName: 'sucursal',
  columns: {
    id: { type: 'uuid', primary: true },
    tenantId: { name: 'tenant_id', type: 'uuid' },
    codigo: { type: 'varchar' },
    nombre: { type: 'varchar' },
  },
});
