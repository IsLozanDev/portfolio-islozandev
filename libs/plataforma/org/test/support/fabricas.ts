import { Empresa, type EmpresaProps } from '../../src/domain/empresa.js';
import { Sucursal, type DatosSucursal, type SucursalProps } from '../../src/domain/sucursal.js';

export const TENANT = '0190a8e0-0000-7000-8000-000000000001';
export const EMPRESA = '0190a8e0-0000-7000-8000-0000000000e1';

export const empresa = (cambios: Partial<EmpresaProps> = {}, id = EMPRESA) =>
  Empresa.reconstituir(id, 1, {
    tenantId: TENANT,
    ruc: '20512345671',
    razonSocial: 'Sabores del Sur SAC',
    nombreComercial: null,
    direccionFiscal: 'Av. Ejército 101',
    ubigeo: '040101',
    activo: true,
    ...cambios,
  });

export const datosSucursal = (cambios: Partial<DatosSucursal> = {}): DatosSucursal => ({
  codigo: 'CAYMA',
  nombre: 'Cayma',
  codigoEstablecimientoSunat: '0002',
  direccion: null,
  ubigeo: '040103',
  telefono: null,
  zonaHoraria: 'America/Lima',
  ...cambios,
});

export const sucursal = (id: string, cambios: Partial<SucursalProps> = {}) =>
  Sucursal.reconstituir(id, 1, {
    tenantId: TENANT,
    empresaId: EMPRESA,
    esPrincipal: false,
    activo: true,
    ...datosSucursal({ codigo: id.slice(-4), nombre: `Sucursal ${id.slice(-4)}`, codigoEstablecimientoSunat: null }),
    ...cambios,
  });
