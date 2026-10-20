import { NotFoundError, type TenantContext } from '@vitrina/plataforma/kernel';
import { topeSucursales, type CupoSucursales } from '../domain/cupo-sucursales.js';
import type { Tenant } from '../domain/tenant.js';
import type { RepositorioSucursales, RepositorioSuscripciones, RepositorioTenants } from './ports/repositorios.js';

export async function buscarTenant(tenants: RepositorioTenants, contexto: TenantContext): Promise<Tenant> {
  const tenant = await tenants.buscar(contexto.current().tenantId);
  if (!tenant) throw new NotFoundError('El tenant no existe');
  return tenant;
}

/** Va dentro de la transacción: cuenta y tope deben verse en el mismo momento que la escritura. */
export async function cupoSucursales(repos: { sucursales: RepositorioSucursales; suscripciones: RepositorioSuscripciones }): Promise<CupoSucursales> {
  return { activas: await repos.sucursales.contarActivas(), tope: topeSucursales(await repos.suscripciones.listar()) };
}

export function existe<T>(valor: T | null, mensaje: string): T {
  if (valor === null) throw new NotFoundError(mensaje);
  return valor;
}
