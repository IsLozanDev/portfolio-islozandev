export { CodigoTenant } from './domain/codigo-tenant.js';
export { exigirCupo, topeSucursales, type CupoSucursales } from './domain/cupo-sucursales.js';
export { Empresa, type DatosEmpresa, type EmpresaProps } from './domain/empresa.js';
export { Sucursal, type DatosSucursal, type SucursalProps } from './domain/sucursal.js';
export {
  ESTADOS_SUSCRIPCION,
  PLANES,
  PRODUCTOS,
  Suscripcion,
  type DatosSuscripcion,
  type EstadoSuscripcion,
  type Plan,
  type ProductoCodigo,
  type SuscripcionProps,
  type UsoActual,
} from './domain/suscripcion.js';
export {
  ESTADOS_TENANT,
  TRANSICIONES,
  Tenant,
  type CambioEstadoTenant,
  type EstadoTenant,
  type TenantProps,
} from './domain/tenant.js';
export {
  TIPOS_UNIDAD,
  UnidadOperativa,
  type Atributos,
  type DatosUnidad,
  type TipoUnidad,
  type UnidadProps,
} from './domain/unidad-operativa.js';
export { CodigoEstablecimiento, Ruc, Ubigeo } from './domain/valores.js';
export type {
  RepositorioEmpresas,
  RepositorioSucursales,
  RepositorioSuscripciones,
  RepositorioTenants,
  RepositorioUnidades,
} from './application/ports/repositorios.js';
export { ESQUEMAS_ORG, registrarEsquemasOrg } from './infrastructure/event-schemas.js';
