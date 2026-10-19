import { MissingTenantContextError } from '@vitrina/plataforma/kernel';
import { AlsTenantContext } from '../src/als-tenant-context.js';

const pausa = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('AlsTenantContext', () => {
  it('current() fuera de run lanza MissingTenantContextError', () => {
    expect(() => new AlsTenantContext().current()).toThrow(MissingTenantContextError);
  });

  it('current() devuelve el scope dentro de run, también tras await', async () => {
    const ctx = new AlsTenantContext();
    const scope = { tenantId: 'A', branchId: 'S1' };
    const visto = await ctx.run(scope, async () => {
      await pausa(1);
      return ctx.current();
    });
    expect(visto).toEqual(scope);
  });

  it('dos run concurrentes de tenants distintos no se mezclan', async () => {
    const ctx = new AlsTenantContext();
    const leer = (tenantId: string, espera: number) =>
      ctx.run({ tenantId }, async () => {
        await pausa(espera);
        return ctx.current().tenantId;
      });
    expect(await Promise.all([leer('A', 10), leer('B', 1)])).toEqual(['A', 'B']);
  });

  it('el scope no se filtra fuera de run', async () => {
    const ctx = new AlsTenantContext();
    await ctx.run({ tenantId: 'A' }, async () => undefined);
    expect(() => ctx.current()).toThrow(MissingTenantContextError);
  });
});
