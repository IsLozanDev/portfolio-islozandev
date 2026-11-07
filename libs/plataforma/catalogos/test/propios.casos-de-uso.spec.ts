import { AjustarItem, type AjustarItemComando } from '../src/application/ajustar-item.js';
import type { ContenidoItemComando } from '../src/application/contenido-item.js';
import { EliminarItemPropio } from '../src/application/eliminar-item-propio.js';
import { GuardarItemPropio } from '../src/application/guardar-item-propio.js';
import type { Catalogo } from '../src/domain/catalogo.js';
import {
  AlcanceNoPermiteError,
  CatalogoNoExisteError,
  CodigoItemDuplicadoError,
  ItemNoEncontradoError,
  ItemReferenciadoError,
  ItemInvalidoError,
  VersionObsoletaError,
} from '../src/domain/errores.js';
import { ANA, CLIENTE, escenario, type Escenario } from './support/dobles.js';

const OTRA_CLINICA = '0193f3a0-0000-7000-8000-000000000003';

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

describe('GuardarItemPropio y EliminarItemPropio (TR-RF-026)', () => {
  let actual: Escenario;
  let especialidad: Catalogo;
  beforeEach(async () => {
    actual = escenario();
    especialidad = await actual.catalogo('ESPECIALIDAD', 'MIXTO');
    await actual.itemGlobal(especialidad, 'MED_GEN');
    actual.comoTenant(CLIENTE);
  });

  const crearCardiologia = () =>
    new GuardarItemPropio(actual.dependencias).crear({ catalogo: 'ESPECIALIDAD', codigo: 'CARDIO', ...contenido(), actorId: ANA });

  it('TR-CA-068: la especialidad propia queda con el tenant del contexto y sube solo su versión', async () => {
    const item = await crearCardiologia();
    expect(actual.items.filas.get(item.id)?.tenantId).toBe(CLIENTE);
    expect(item).toMatchObject({ codigo: 'CARDIO', version: 0 });
    expect(actual.versionesTenant.de(especialidad.id, CLIENTE)).toBe(1);
    expect(actual.versionesTenant.de(especialidad.id, OTRA_CLINICA)).toBe(0);
    expect(actual.publicados.at(-1)).toMatchObject({
      aggregateVersion: 1,
      payload: { cambio: 'ITEM', tenant_id: CLIENTE, item_id: item.id, version_global: 2, version_tenant: 1, por: ANA },
    });
  });

  it('TR-CA-068: otro tenant no ve ni modifica el propio: 404', async () => {
    const item = await crearCardiologia();
    actual.comoTenant(OTRA_CLINICA);
    await expect(
      new GuardarItemPropio(actual.dependencias).actualizar({ catalogo: 'ESPECIALIDAD', itemId: item.id, version: 0, ...contenido({ nombre: 'Otra' }), actorId: ANA }),
    ).rejects.toThrow(ItemNoEncontradoError);
    await expect(
      new EliminarItemPropio(actual.dependencias).ejecutar({ catalogo: 'ESPECIALIDAD', itemId: item.id, version: 0, actorId: ANA }),
    ).rejects.toThrow(ItemNoEncontradoError);
  });

  it('TR-CA-069: un propio MED_GEN repite un global: «El código ya existe en el catálogo»', async () => {
    await expect(
      new GuardarItemPropio(actual.dependencias).crear({ catalogo: 'ESPECIALIDAD', codigo: 'MED_GEN', ...contenido(), actorId: ANA }),
    ).rejects.toThrow(new CodigoItemDuplicadoError().message);
    expect(actual.publicados.filter((evento) => evento.payload && (evento.payload as { tenant_id: string }).tenant_id === CLIENTE)).toEqual([]);
  });

  it('un propio repetido en el mismo tenant da CODIGO_DUPLICADO; en otro tenant se admite', async () => {
    await crearCardiologia();
    await expect(crearCardiologia()).rejects.toThrow(CodigoItemDuplicadoError);
    actual.comoTenant(OTRA_CLINICA);
    await expect(crearCardiologia()).resolves.toMatchObject({ codigo: 'CARDIO' });
  });

  it('un propio en un catálogo GLOBAL da ALCANCE_NO_PERMITE; en uno inexistente, CATALOGO_NO_EXISTE', async () => {
    await actual.catalogo('TIPO_COMPROBANTE', 'GLOBAL');
    await expect(
      new GuardarItemPropio(actual.dependencias).crear({ catalogo: 'TIPO_COMPROBANTE', codigo: '99', ...contenido(), actorId: ANA }),
    ).rejects.toThrow(AlcanceNoPermiteError);
    await expect(
      new GuardarItemPropio(actual.dependencias).crear({ catalogo: 'NO_EXISTE', codigo: 'X', ...contenido(), actorId: ANA }),
    ).rejects.toThrow(CatalogoNoExisteError);
  });

  it('un id global en la ruta de propios da 404', async () => {
    const [medGen] = [...actual.items.filas.values()];
    await expect(
      new GuardarItemPropio(actual.dependencias).actualizar({ catalogo: 'ESPECIALIDAD', itemId: medGen.id, version: 0, ...contenido(), actorId: ANA }),
    ).rejects.toThrow(ItemNoEncontradoError);
  });

  it('actualizar sube la versión; sin cambios no escribe; con versión obsoleta da 409', async () => {
    const item = await crearCardiologia();
    const guardar = new GuardarItemPropio(actual.dependencias);
    const base = { catalogo: 'ESPECIALIDAD', itemId: item.id, actorId: ANA };

    expect(await guardar.actualizar({ ...base, version: 0, ...contenido({ activo: false }) })).toMatchObject({ version: 1, activo: false, cambiado: true });
    const publicados = actual.publicados.length;
    expect(await guardar.actualizar({ ...base, version: 1, ...contenido({ activo: false }) })).toMatchObject({ version: 1, cambiado: false });
    expect(actual.publicados).toHaveLength(publicados);
    await expect(guardar.actualizar({ ...base, version: 0, ...contenido() })).rejects.toThrow(VersionObsoletaError);
  });

  it('eliminar sigue la regla de referencias y, sin ellas, borra y publica', async () => {
    const item = await crearCardiologia();
    const eliminar = new EliminarItemPropio(actual.dependencias);
    actual.referenciados.add(item.id);
    await expect(eliminar.ejecutar({ catalogo: 'ESPECIALIDAD', itemId: item.id, version: 0, actorId: ANA })).rejects.toThrow(ItemReferenciadoError);
    expect(actual.items.filas.has(item.id)).toBe(true);

    actual.referenciados.clear();
    await eliminar.ejecutar({ catalogo: 'ESPECIALIDAD', itemId: item.id, version: 0, actorId: ANA });
    expect(actual.items.filas.has(item.id)).toBe(false);
    expect(actual.publicados.at(-1)?.payload).toMatchObject({ cambio: 'ITEM', item_id: item.id, tenant_id: CLIENTE, version_tenant: 2 });
  });
});

describe('AjustarItem (TR-RF-025)', () => {
  let actual: Escenario;
  let plinId: string;
  beforeEach(async () => {
    actual = escenario();
    const medioPago = await actual.catalogo('MEDIO_PAGO', 'MIXTO');
    plinId = (await actual.itemGlobal(medioPago, 'PLIN')).id;
    const comprobantes = await actual.catalogo('TIPO_COMPROBANTE', 'GLOBAL');
    await actual.itemGlobal(comprobantes, '01');
    actual.comoTenant(CLIENTE);
  });

  const ajustar = (cambios: Partial<AjustarItemComando> = {}) =>
    new AjustarItem(actual.dependencias).ejecutar({
      catalogo: 'MEDIO_PAGO',
      itemId: plinId,
      visible: false,
      orden: null,
      alias: null,
      version: null,
      actorId: ANA,
      ...cambios,
    });

  it('TR-CA-066: ocultar Plin crea el ajuste solo para el tenant y publica AJUSTE con su versión', async () => {
    expect(await ajustar()).toEqual({ itemId: plinId, visible: false, orden: null, alias: null, version: 0, cambiado: true });
    expect(await actual.ajustes.buscar(plinId)).toMatchObject({ version: 0 });
    expect(actual.publicados.at(-1)?.payload).toMatchObject({ cambio: 'AJUSTE', item_id: plinId, tenant_id: CLIENTE, version_tenant: 1 });

    actual.comoTenant(OTRA_CLINICA);
    expect(await actual.ajustes.buscar(plinId)).toBeNull();
  });

  it('TR-CA-067: un ajuste en TIPO_COMPROBANTE da ALCANCE_NO_PERMITE', async () => {
    const [, factura] = [...actual.items.filas.values()];
    await expect(ajustar({ catalogo: 'TIPO_COMPROBANTE', itemId: factura.id })).rejects.toThrow(AlcanceNoPermiteError);
    expect(actual.ajustes.escrituras).toBe(0);
  });

  it('un ajuste sobre un ítem propio da ALCANCE_NO_PERMITE; un id inexistente, 404', async () => {
    const propio = await new GuardarItemPropio(actual.dependencias).crear({ catalogo: 'MEDIO_PAGO', codigo: 'DINERS', ...contenido({ nombre: 'Tarjeta Diners' }), actorId: ANA });
    await expect(ajustar({ itemId: propio.id })).rejects.toThrow(AlcanceNoPermiteError);
    await expect(ajustar({ itemId: '0193f3a0-0000-7000-8000-0000000fffff' })).rejects.toThrow(ItemNoEncontradoError);
  });

  it('alias y orden; repetir no escribe; con versión obsoleta da 409', async () => {
    await ajustar({ visible: true, orden: 0, alias: 'Plin QR' });
    const escrituras = actual.ajustes.escrituras;
    const publicados = actual.publicados.length;
    expect(await ajustar({ visible: true, orden: 0, alias: 'Plin QR', version: 0 })).toMatchObject({ version: 0, cambiado: false });
    expect(actual.ajustes.escrituras).toBe(escrituras);
    expect(actual.publicados).toHaveLength(publicados);

    expect(await ajustar({ visible: false, orden: 0, alias: 'Plin QR', version: 0 })).toMatchObject({ version: 1, cambiado: true });
    await expect(ajustar({ visible: true, version: 0 })).rejects.toThrow(VersionObsoletaError);
    await expect(ajustar({ visible: true, version: null })).rejects.toThrow(VersionObsoletaError);
  });

  it('un ajuste neutro borra la fila y responde version null; neutro sin fila no escribe', async () => {
    await ajustar();
    expect(await ajustar({ visible: true, version: 0 })).toEqual({ itemId: plinId, visible: true, orden: null, alias: null, version: null, cambiado: true });
    expect(await actual.ajustes.buscar(plinId)).toBeNull();

    const escrituras = actual.ajustes.escrituras;
    expect(await ajustar({ visible: true })).toMatchObject({ version: null, cambiado: false });
    expect(actual.ajustes.escrituras).toBe(escrituras);
  });

  it('un alias vacío da ITEM_INVALIDO', async () => {
    await expect(ajustar({ alias: '' })).rejects.toThrow(ItemInvalidoError);
  });
});
