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
export { CrearTenant, type CrearTenantComando } from './application/crear-tenant.js';
export {
  EditarEmpresa,
  RegistrarEmpresa,
  type EditarEmpresaComando,
  type EmpresaRepos,
  type RegistrarEmpresaComando,
} from './application/empresa.casos-de-uso.js';
export type { DatosPadron, PadronRucPort } from './application/ports/padron-ruc.port.js';
export { PadronRucNulo } from './infrastructure/padron-ruc.nulo.js';
export {
  EditarSucursal,
  InactivarSucursal,
  MarcarSucursalPrincipal,
  RegistrarSucursal,
  type EditarSucursalComando,
  type RegistrarSucursalComando,
  type SucursalRepos,
} from './application/sucursal.casos-de-uso.js';
