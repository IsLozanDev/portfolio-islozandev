import { EntitySchema } from 'typeorm';

// Lectura de org para validar el ámbito de una serie. Solo las columnas que seq usa; org sigue siendo
// el dueño de estas tablas y de su escritura.

export interface FilaSucursalSerie {
  id: string;
  tenantId: string;
  empresaId: string;
}

export interface FilaUnidadSerie {
  id: string;
  tenantId: string;
  empresaId: string;
  sucursalId: string | null;
}

export const SucursalSerieEntidad = new EntitySchema<FilaSucursalSerie>({
  name: 'SeqSucursal',
  schema: 'org',
  tableName: 'sucursal',
  columns: {
    id: { type: 'uuid', primary: true },
    tenantId: { name: 'tenant_id', type: 'uuid' },
    empresaId: { name: 'empresa_id', type: 'uuid' },
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
  },
});
