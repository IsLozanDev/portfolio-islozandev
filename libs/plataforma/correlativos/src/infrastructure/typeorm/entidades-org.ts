import { EntitySchema } from 'typeorm';

// Lectura de org para validar el ámbito de una serie y mostrar sus nombres. Solo las columnas que seq
// usa; org sigue siendo el dueño de estas tablas y de su escritura.

export interface FilaEmpresaSerie {
  id: string;
  tenantId: string;
  razonSocial: string;
}

export interface FilaSucursalSerie {
  id: string;
  tenantId: string;
  empresaId: string;
  nombre: string;
}

export interface FilaUnidadSerie {
  id: string;
  tenantId: string;
  empresaId: string;
  sucursalId: string | null;
  nombre: string;
}

export const EmpresaSerieEntidad = new EntitySchema<FilaEmpresaSerie>({
  name: 'SeqEmpresa',
  schema: 'org',
  tableName: 'empresa',
  columns: {
    id: { type: 'uuid', primary: true },
    tenantId: { name: 'tenant_id', type: 'uuid' },
    razonSocial: { name: 'razon_social', type: 'varchar' },
  },
});

export const SucursalSerieEntidad = new EntitySchema<FilaSucursalSerie>({
  name: 'SeqSucursal',
  schema: 'org',
  tableName: 'sucursal',
  columns: {
    id: { type: 'uuid', primary: true },
    tenantId: { name: 'tenant_id', type: 'uuid' },
    empresaId: { name: 'empresa_id', type: 'uuid' },
    nombre: { type: 'varchar' },
  },
});

export const UnidadSerieEntidad = new EntitySchema<FilaUnidadSerie>({
  name: 'SeqUnidadOperativa',
  schema: 'org',
  tableName: 'unidad_operativa',
  columns: {
    id: { type: 'uuid', primary: true },
    tenantId: { name: 'tenant_id', type: 'uuid' },
    empresaId: { name: 'empresa_id', type: 'uuid' },
    sucursalId: { name: 'sucursal_id', type: 'uuid', nullable: true },
    nombre: { type: 'varchar' },
  },
});
