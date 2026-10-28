import { EntitySchema } from 'typeorm';
import type { AvisoVencimiento } from '../../domain/aviso-vencimiento.js';
import { EmpresaLecturaEntidad, SucursalLecturaEntidad, UnidadLecturaEntidad } from './entidades-lectura.js';

// Mapeo ORM de org.aviso_vencimiento. El esquema lo define db/01a_org_alta.sql (sin synchronize).
// Los repositorios de org anteriores al spec 10 siguen con SQL (regla 11).
export const AvisoVencimientoEntidad = new EntitySchema<AvisoVencimiento>({
  name: 'AvisoVencimiento',
  schema: 'org',
  tableName: 'aviso_vencimiento',
  columns: {
    id: { type: 'uuid', primary: true },
    tenantId: { name: 'tenant_id', type: 'uuid' },
    suscripcionId: { name: 'suscripcion_id', type: 'uuid' },
    diasAntes: { name: 'dias_antes', type: 'smallint' },
    vigenteHasta: { name: 'vigente_hasta', type: 'date' },
    fechaEjecucion: { name: 'fecha_ejecucion', type: 'date' },
  },
});

/** Van en el DataSource de la app que use la tarea de vencimientos o las listas de organización. */
export const ENTIDADES_ORG = [AvisoVencimientoEntidad, EmpresaLecturaEntidad, SucursalLecturaEntidad, UnidadLecturaEntidad];
