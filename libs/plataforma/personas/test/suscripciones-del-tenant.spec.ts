import type { ProductoCodigo, Suscripcion } from '@vitrina/plataforma/org';
import { SuscripcionesDelTenantOrg } from '../src/infrastructure/suscripciones-del-tenant.org.js';

function adaptadorCon(suscripciones: Partial<Record<ProductoCodigo, { vigente: boolean }>>): SuscripcionesDelTenantOrg {
  return new SuscripcionesDelTenantOrg({
    buscar: async (productoCodigo) => (suscripciones[productoCodigo] as Suscripcion | undefined) ?? null,
  });
}

describe('SuscripcionesDelTenantOrg', () => {
  it('una suscripción vigente (PRUEBA o ACTIVA) habilita el producto', async () => {
    expect(await adaptadorCon({ CLI: { vigente: true } }).estaVigente('CLI')).toBe(true);
  });

  it('una suscripción no vigente no habilita el producto', async () => {
    expect(await adaptadorCon({ ECO: { vigente: false } }).estaVigente('ECO')).toBe(false);
  });

  it('TR-CA-104: sin suscripción el producto no está vigente', async () => {
    expect(await adaptadorCon({}).estaVigente('ECO')).toBe(false);
  });
});
