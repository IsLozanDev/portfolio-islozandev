import { uuidV7 } from '@vitrina/plataforma/kernel-infra';
import { AjustarItem } from '../src/application/ajustar-item.js';
import type { ContenidoItemComando } from '../src/application/contenido-item.js';
import { EliminarItemPropio } from '../src/application/eliminar-item-propio.js';
import { GuardarItemPropio } from '../src/application/guardar-item-propio.js';
import { AlcanceNoPermiteError, CodigoItemDuplicadoError, ItemNoEncontradoError } from '../src/domain/errores.js';
import { crearEntornoCatalogos, type EntornoCatalogos } from './support/entorno.js';
import { describeConDb } from './support/temp-db.js';

// Ids de la semilla de 01f_cat.sql.
const MEDIO_PAGO = 'ca700000-0000-0000-0000-000000000001';
const ESPECIALIDAD = 'ca700000-0000-0000-0000-000000000004';
const PLIN = 'ca700000-0000-0000-0001-000000000003';
const FACTURA = 'ca700000-0000-0000-0003-000000000001';

const contenido = (cambios: Partial<ContenidoItemComando> = {}): ContenidoItemComando => ({
  codigoExterno: null,
  nombre: 'Cardiología',
  abreviatura: null,
  orden: 2,
  atributos: {},
  vigenteDesde: '2026-01-01',
  vigenteHasta: null,
  activo: true,
  ...cambios,
});

describeConDb('Ítems propios y ajustes (TR-RF-025, TR-RF-026, PostgreSQL 16)', () => {
  let entorno: EntornoCatalogos;
  let actorId: string;
  let otraClinica: string;
  const comoClinica = <T>(trabajo: () => Promise<T>) => entorno.en(entorno.tenants.cliente, trabajo);
  const comoOtra = <T>(trabajo: () => Promise<T>) => entorno.en(otraClinica, trabajo);
  const versionTenant = async (catalogoId: string, tenantId: string) =>
    Number((await entorno.dataSource.query(`SELECT version FROM cat.version_tenant WHERE catalogo_id = $1 AND tenant_id = $2`, [catalogoId, tenantId]))[0]?.version ?? 0);

  beforeAll(async () => {
    entorno = await crearEntornoCatalogos();
    actorId = entorno.tenants.usuarioId;
    otraClinica = uuidV7();
    await entorno.dataSource.query(`INSERT INTO org.tenant (id, codigo, nombre, estado, version) VALUES ($1, $2, 'Otra clínica', 'ACTIVO', 1)`, [
      otraClinica,
      `otra-${otraClinica.slice(-8)}`,
    ]);
  });

  afterAll(() => entorno?.cerrar());

  it('TR-CA-068: la especialidad propia queda con el tenant de la clínica y sube solo su versión', async () => {
    const item = await comoClinica(() =>
      new GuardarItemPropio(entorno.dependencias).crear({ catalogo: 'ESPECIALIDAD', codigo: 'CARDIO', ...contenido(), actorId }),
    );
    expect((await entorno.dataSource.query(`SELECT tenant_id, version FROM cat.catalogo_item WHERE id = $1`, [item.id]))[0]).toEqual({
      tenant_id: entorno.tenants.cliente,
      version: '0',
    });
    expect(await versionTenant(ESPECIALIDAD, entorno.tenants.cliente)).toBe(1);
    expect(await versionTenant(ESPECIALIDAD, otraClinica)).toBe(0);
    const [evento] = await entorno.eventosDe(ESPECIALIDAD);
    expect(evento).toMatchObject({ tenant_id: entorno.tenants.cliente, version: '1' });
    expect(evento.payload).toMatchObject({ cambio: 'ITEM', item_id: item.id, tenant_id: entorno.tenants.cliente, version_global: 1, version_tenant: 1 });
  });

  it('TR-CA-068: otra clínica no ve el propio: 404 al modificarlo o borrarlo', async () => {
    const [{ id }] = await entorno.dataSource.query(`SELECT id FROM cat.catalogo_item WHERE codigo = 'CARDIO'`);
    await expect(
      comoOtra(() => new GuardarItemPropio(entorno.dependencias).actualizar({ catalogo: 'ESPECIALIDAD', itemId: id, version: 0, ...contenido({ nombre: 'X' }), actorId })),
    ).rejects.toThrow(ItemNoEncontradoError);
    await expect(
      comoOtra(() => new EliminarItemPropio(entorno.dependencias).ejecutar({ catalogo: 'ESPECIALIDAD', itemId: id, version: 0, actorId })),
    ).rejects.toThrow(ItemNoEncontradoError);
  });

  it('TR-CA-069: un propio MED_GEN da «El código ya existe en el catálogo»; el mismo código en otra clínica se admite', async () => {
    await expect(
      comoClinica(() => new GuardarItemPropio(entorno.dependencias).crear({ catalogo: 'ESPECIALIDAD', codigo: 'MED_GEN', ...contenido(), actorId })),
    ).rejects.toThrow(new CodigoItemDuplicadoError().message);
    await expect(
      comoOtra(() => new GuardarItemPropio(entorno.dependencias).crear({ catalogo: 'ESPECIALIDAD', codigo: 'CARDIO', ...contenido(), actorId })),
    ).resolves.toMatchObject({ codigo: 'CARDIO' });
  });

  it('actualizar y eliminar un propio escriben solo en el tenant y publican', async () => {
    const guardar = new GuardarItemPropio(entorno.dependencias);
    const item = await comoClinica(() => guardar.crear({ catalogo: 'MEDIO_PAGO', codigo: 'DINERS', ...contenido({ nombre: 'Tarjeta Diners' }), actorId }));
    expect(await comoClinica(() => guardar.actualizar({ catalogo: 'MEDIO_PAGO', itemId: item.id, version: 0, ...contenido({ nombre: 'Diners Club' }), actorId }))).toMatchObject({
      version: 1,
      cambiado: true,
    });
    await comoClinica(() => new EliminarItemPropio(entorno.dependencias).ejecutar({ catalogo: 'MEDIO_PAGO', itemId: item.id, version: 1, actorId }));
    expect(await entorno.dataSource.query(`SELECT id FROM cat.catalogo_item WHERE id = $1`, [item.id])).toEqual([]);
    expect(await versionTenant(MEDIO_PAGO, entorno.tenants.cliente)).toBe(3);
  });

  it('TR-CA-066: ocultar Plin solo afecta a la clínica', async () => {
    const ajuste = await comoClinica(() =>
      new AjustarItem(entorno.dependencias).ejecutar({ catalogo: 'MEDIO_PAGO', itemId: PLIN, visible: false, orden: null, alias: null, version: null, actorId }),
    );
    expect(ajuste).toMatchObject({ visible: false, version: 0, cambiado: true });
    const filas = await entorno.dataSource.query(`SELECT tenant_id, visible FROM cat.catalogo_item_tenant WHERE item_id = $1`, [PLIN]);
    expect(filas).toEqual([{ tenant_id: entorno.tenants.cliente, visible: false }]);
    const eventos = await entorno.eventosDe(MEDIO_PAGO);
    expect(eventos.at(-1)?.payload).toMatchObject({ cambio: 'AJUSTE', item_id: PLIN, tenant_id: entorno.tenants.cliente });
  });

  it('volver al ajuste neutro borra la fila', async () => {
    await comoClinica(() =>
      new AjustarItem(entorno.dependencias).ejecutar({ catalogo: 'MEDIO_PAGO', itemId: PLIN, visible: true, orden: null, alias: null, version: 0, actorId }),
    );
    expect(await entorno.dataSource.query(`SELECT 1 FROM cat.catalogo_item_tenant WHERE item_id = $1`, [PLIN])).toEqual([]);
  });

  it('TR-CA-067: un ajuste sobre una factura de TIPO_COMPROBANTE da ALCANCE_NO_PERMITE', async () => {
    await expect(
      comoClinica(() =>
        new AjustarItem(entorno.dependencias).ejecutar({ catalogo: 'TIPO_COMPROBANTE', itemId: FACTURA, visible: false, orden: null, alias: null, version: null, actorId }),
      ),
    ).rejects.toThrow(AlcanceNoPermiteError);
  });
});
