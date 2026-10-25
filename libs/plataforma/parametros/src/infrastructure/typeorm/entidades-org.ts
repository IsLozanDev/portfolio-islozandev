import { EntitySchema } from 'typeorm';

// Lectura de nombres de org para la tabla de herencia (TR-RF-033). Solo las columnas que cfg usa;
// org sigue siendo el dueño de estas tablas y de su escritura.

export interface FilaEmpresaNombre {
  id: string;
  tenantId: string;
  razonSocial: string;
}

export interface FilaSucursalNombre {
  id: string;
  tenantId: string;
  nombre: string;
}

export const EmpresaNombreEntidad = new EntitySchema<FilaEmpresaNombre>({
  name: 'CfgEmpresaNombre',
  schema: 'org',
  tableName: 'empresa',
  columns: {
    id: { type: 'uuid', primary: true },
    tenantId: { name: 'tenant_id', type: 'uuid' },
    razonSocial: { name: 'razon_social', type: 'varchar' },
  },
});

export const SucursalNombreEntidad = new EntitySchema<FilaSucursalNombre>({
  name: 'CfgSucursalNombre',
  schema: 'org',
  tableName: 'sucursal',
  columns: {
    id: { type: 'uuid', primary: true },
    tenantId: { name: 'tenant_id', type: 'uuid' },
    nombre: { type: 'varchar' },
  },
});
