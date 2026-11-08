import { eventoCatalogoActualizado } from '../src/domain/eventos.js';
import { PERMISOS_CAT } from '../src/domain/permisos-cat.js';

const CATALOGO = '0193f3a0-0000-7000-8000-00000000c001';
const ITEM = '0193f3a0-0000-7000-8000-00000000d001';
const TENANT = '0193f3a0-0000-7000-8000-000000000001';
const ANA = '0193f3a0-0000-7000-8000-000000000901';
const AHORA = new Date('2026-11-07T15:00:00Z');

describe('eventoCatalogoActualizado', () => {
  it('un cambio global lleva tenant null y la versión global como versión del agregado', () => {
    const evento = eventoCatalogoActualizado({
      catalogoId: CATALOGO,
      codigo: 'MEDIO_PAGO',
      versionGlobal: 4,
      versionTenant: 0,
      tenantId: null,
      cambio: 'ITEM',
      itemId: ITEM,
      por: ANA,
      ahora: AHORA,
    });
    expect(evento).toEqual({
      eventType: 'catalogo.actualizado',
      aggregateType: 'catalogo',
      aggregateId: CATALOGO,
      aggregateVersion: 4,
      schemaVersion: 1,
      occurredAt: AHORA,
      payload: {
        catalogo_id: CATALOGO,
        codigo: 'MEDIO_PAGO',
        version_global: 4,
        version_tenant: 0,
        tenant_id: null,
        cambio: 'ITEM',
        item_id: ITEM,
        por: ANA,
      },
    });
  });

  it('un ajuste lleva el tenant y su versión como versión del agregado, sin nombres (TR-RNF-026)', () => {
    const evento = eventoCatalogoActualizado({
      catalogoId: CATALOGO,
      codigo: 'MEDIO_PAGO',
      versionGlobal: 4,
      versionTenant: 2,
      tenantId: TENANT,
      cambio: 'AJUSTE',
      itemId: ITEM,
      por: ANA,
      ahora: AHORA,
    });
    expect(evento.aggregateVersion).toBe(2);
    expect(evento.payload).toMatchObject({ tenant_id: TENANT, cambio: 'AJUSTE', version_tenant: 2 });
    expect(Object.keys(evento.payload).sort()).toEqual(
      ['cambio', 'catalogo_id', 'codigo', 'item_id', 'por', 'tenant_id', 'version_global', 'version_tenant'],
    );
  });
});

describe('PERMISOS_CAT', () => {
  it('declara los 6 permisos plat.catalogo.* y plat.feriado.gestionar (spec 19c)', () => {
    expect(Object.values(PERMISOS_CAT).sort()).toEqual([
      'plat.catalogo.gestionar',
      'plat.catalogo.importar',
      'plat.catalogo.item_gestionar',
      'plat.catalogo.item_propio',
      'plat.catalogo.leer',
      'plat.catalogo.personalizar',
      'plat.feriado.gestionar',
    ]);
  });
});
