import { ActualizarCatalogo } from '../src/application/actualizar-catalogo.js';
import type { ContenidoItemComando } from '../src/application/contenido-item.js';
import { CrearCatalogo, type CrearCatalogoComando } from '../src/application/crear-catalogo.js';
import { EliminarItemGlobal } from '../src/application/eliminar-item-global.js';
import { GuardarItemGlobal } from '../src/application/guardar-item-global.js';
import { ListarCatalogos } from '../src/application/listar-catalogos.js';
import {
  AlcanceNoPermiteError,
  CatalogoDuplicadoError,
  CatalogoInvalidoError,
  CatalogoNoExisteError,
  CodigoItemDuplicadoError,
  ItemNoEncontradoError,
  ItemReferenciadoError,
  VersionObsoletaError,
} from '../src/domain/errores.js';
import { ANA, CLIENTE, OperadorRequeridoDoble, escenario, type Escenario } from './support/dobles.js';

const comandoCatalogo = (cambios: Partial<CrearCatalogoComando> = {}): CrearCatalogoComando => ({
  codigo: 'MEDIO_PAGO',
  nombre: 'Medios de pago',
  alcance: 'MIXTO',
  fuente: null,
  editablePorTenant: true,
  actorId: ANA,
  ...cambios,
});

const contenido = (cambios: Partial<ContenidoItemComando> = {}): ContenidoItemComando => ({
  codigoExterno: null,
  nombre: 'Yape',
  abreviatura: null,
  orden: 2,
  atributos: {},
  vigenteDesde: '2026-01-01',
  vigenteHasta: null,
  activo: true,
  ...cambios,
});

describe('CrearCatalogo y ActualizarCatalogo (TR-RF-022)', () => {
  let actual: Escenario;
  beforeEach(() => {
    actual = escenario();
  });

  it('TR-CA-058: MEDIO_PAGO MIXTO queda en versión 1 y publica catalogo.actualizado en la transacción', async () => {
    const definicion = await new CrearCatalogo(actual.dependencias).ejecutar(comandoCatalogo());
    expect(definicion).toMatchObject({ codigo: 'MEDIO_PAGO', alcance: 'MIXTO', editablePorTenant: true, version: 1 });
    expect(actual.publicados).toHaveLength(1);
    expect(actual.publicados[0]).toMatchObject({
      eventType: 'catalogo.actualizado',
      aggregateId: definicion.id,
      payload: { codigo: 'MEDIO_PAGO', version_global: 1, version_tenant: 0, tenant_id: null, cambio: 'CATALOGO', item_id: null, por: ANA },
    });
  });

  it('TR-CA-059: GLOBAL editable da CATALOGO_INVALIDO sin escribir', async () => {
    await expect(
      new CrearCatalogo(actual.dependencias).ejecutar(comandoCatalogo({ codigo: 'NORMA', alcance: 'GLOBAL', editablePorTenant: true })),
    ).rejects.toThrow(new CatalogoInvalidoError('Un catálogo normativo global no puede ser editable por el tenant'));
    expect(actual.catalogos.escrituras).toBe(0);
  });

  it('un código repetido da CATALOGO_DUPLICADO', async () => {
    await new CrearCatalogo(actual.dependencias).ejecutar(comandoCatalogo());
    await expect(new CrearCatalogo(actual.dependencias).ejecutar(comandoCatalogo())).rejects.toThrow(CatalogoDuplicadoError);
  });

  it('fuera del operador da 403 OPERADOR_REQUERIDO sin escribir ni publicar, aunque tenga el permiso', async () => {
    actual.comoTenant(CLIENTE);
    await expect(new CrearCatalogo(actual.dependencias).ejecutar(comandoCatalogo())).rejects.toThrow(OperadorRequeridoDoble);
    expect(actual.catalogos.escrituras).toBe(0);
    expect(actual.publicados).toEqual([]);
  });

  it('actualizar sube la versión y publica; sin cambios responde cambiado false sin escribir ni publicar', async () => {
    await actual.catalogo('MEDIO_PAGO', 'MIXTO');
    const actualizar = new ActualizarCatalogo(actual.dependencias);
    const base = { codigo: 'MEDIO_PAGO', fuente: null, editablePorTenant: true, actorId: ANA };

    expect(await actualizar.ejecutar({ ...base, nombre: 'Formas de pago', version: 1 })).toMatchObject({ version: 2, cambiado: true });
    expect(actual.publicados.map((evento) => evento.payload)).toEqual([expect.objectContaining({ version_global: 2, cambio: 'CATALOGO' })]);

    const escrituras = actual.catalogos.escrituras;
    expect(await actualizar.ejecutar({ ...base, nombre: 'Formas de pago', version: 2 })).toMatchObject({ version: 2, cambiado: false });
    expect(actual.catalogos.escrituras).toBe(escrituras);
    expect(actual.publicados).toHaveLength(1);
  });

  it('actualizar con versión obsoleta da VERSION_OBSOLETA', async () => {
    await actual.catalogo('MEDIO_PAGO', 'MIXTO');
    await expect(
      new ActualizarCatalogo(actual.dependencias).ejecutar({
        codigo: 'MEDIO_PAGO',
        nombre: 'Otro',
        fuente: null,
        editablePorTenant: true,
        version: 9,
        actorId: ANA,
      }),
    ).rejects.toThrow(VersionObsoletaError);
  });

  it('actualizar un catálogo inexistente da CATALOGO_NO_EXISTE; fuera del operador, 403 antes de leer', async () => {
    const comando = { codigo: 'NO_EXISTE', nombre: 'Otro', fuente: null, editablePorTenant: true, version: 1, actorId: ANA };
    await expect(new ActualizarCatalogo(actual.dependencias).ejecutar(comando)).rejects.toThrow(CatalogoNoExisteError);
    actual.comoTenant(CLIENTE);
    await expect(new ActualizarCatalogo(actual.dependencias).ejecutar(comando)).rejects.toThrow(OperadorRequeridoDoble);
  });

  it('ListarCatalogos devuelve las definiciones ordenadas por código, también a un cliente', async () => {
    await actual.catalogo('TIPO_COMPROBANTE', 'GLOBAL');
    await actual.catalogo('MEDIO_PAGO', 'MIXTO');
    actual.comoTenant(CLIENTE);
    const lista = await new ListarCatalogos(actual.dependencias).ejecutar();
    expect(lista.map((definicion) => [definicion.codigo, definicion.version])).toEqual([
      ['MEDIO_PAGO', 1],
      ['TIPO_COMPROBANTE', 1],
    ]);
  });
});

describe('GuardarItemGlobal y EliminarItemGlobal (TR-RF-023)', () => {
  let actual: Escenario;
  beforeEach(() => {
    actual = escenario();
  });

  it('crear un global sube la versión global y publica el cambio de ítem con la versión que quedó', async () => {
    await actual.catalogo('MEDIO_PAGO', 'MIXTO');
    const item = await new GuardarItemGlobal(actual.dependencias).crear({ catalogo: 'MEDIO_PAGO', codigo: 'YAPE', ...contenido(), actorId: ANA });
    expect(item).toMatchObject({ codigo: 'YAPE', version: 0, vigenteDesde: '2026-01-01', vigenteHasta: null });
    expect(actual.publicados[0].payload).toMatchObject({ cambio: 'ITEM', item_id: item.id, version_global: 2, tenant_id: null });
  });

  it('TR-CA-060: el DNI guarda longitud 8 y regex', async () => {
    await actual.catalogo('TIPO_DOC_IDENTIDAD', 'GLOBAL');
    const item = await new GuardarItemGlobal(actual.dependencias).crear({
      catalogo: 'TIPO_DOC_IDENTIDAD',
      codigo: 'DNI',
      ...contenido({ nombre: 'DNI', codigoExterno: '1', atributos: { longitud: 8, regex: '^[0-9]{8}$' } }),
      actorId: ANA,
    });
    expect(actual.items.filas.get(item.id)?.atributos).toEqual({ longitud: 8, regex: '^[0-9]{8}$' });
  });

  it('un global repetido da CODIGO_DUPLICADO y uno en un catálogo TENANT, ALCANCE_NO_PERMITE', async () => {
    const mixto = await actual.catalogo('MEDIO_PAGO', 'MIXTO');
    await actual.itemGlobal(mixto, 'YAPE');
    await actual.catalogo('AREA', 'TENANT');
    const guardar = new GuardarItemGlobal(actual.dependencias);
    await expect(guardar.crear({ catalogo: 'MEDIO_PAGO', codigo: 'YAPE', ...contenido(), actorId: ANA })).rejects.toThrow(CodigoItemDuplicadoError);
    await expect(guardar.crear({ catalogo: 'AREA', codigo: 'URG', ...contenido(), actorId: ANA })).rejects.toThrow(AlcanceNoPermiteError);
  });

  it('fuera del operador da 403 sin escribir', async () => {
    const mixto = await actual.catalogo('MEDIO_PAGO', 'MIXTO');
    const yape = await actual.itemGlobal(mixto, 'YAPE');
    const escrituras = actual.items.escrituras;
    actual.comoTenant(CLIENTE);
    const guardar = new GuardarItemGlobal(actual.dependencias);
    await expect(guardar.crear({ catalogo: 'MEDIO_PAGO', codigo: 'PLIN', ...contenido(), actorId: ANA })).rejects.toThrow(OperadorRequeridoDoble);
    await expect(
      guardar.actualizar({ catalogo: 'MEDIO_PAGO', itemId: yape.id, version: 0, ...contenido({ activo: false }), actorId: ANA }),
    ).rejects.toThrow(OperadorRequeridoDoble);
    await expect(
      new EliminarItemGlobal(actual.dependencias).ejecutar({ catalogo: 'MEDIO_PAGO', itemId: yape.id, version: 0, actorId: ANA }),
    ).rejects.toThrow(OperadorRequeridoDoble);
    expect(actual.items.escrituras).toBe(escrituras);
    expect(actual.publicados).toEqual([]);
  });

  it('cerrar la vigencia sube la versión; versión obsoleta da 409; sin cambios no escribe', async () => {
    const mixto = await actual.catalogo('MEDIO_PAGO', 'MIXTO');
    const yape = await actual.itemGlobal(mixto, 'YAPE');
    const guardar = new GuardarItemGlobal(actual.dependencias);
    const base = { catalogo: 'MEDIO_PAGO', itemId: yape.id, actorId: ANA };

    expect(await guardar.actualizar({ ...base, version: 0, ...contenido({ nombre: 'YAPE', orden: 0, vigenteHasta: '2026-12-31' }) })).toMatchObject({
      version: 1,
      vigenteHasta: '2026-12-31',
      cambiado: true,
    });
    await expect(guardar.actualizar({ ...base, version: 0, ...contenido({ activo: false }) })).rejects.toThrow(VersionObsoletaError);

    const escrituras = actual.items.escrituras;
    const publicados = actual.publicados.length;
    expect(await guardar.actualizar({ ...base, version: 1, ...contenido({ nombre: 'YAPE', orden: 0, vigenteHasta: '2026-12-31' }) })).toMatchObject({
      cambiado: false,
    });
    expect(actual.items.escrituras).toBe(escrituras);
    expect(actual.publicados).toHaveLength(publicados);
  });

  it('un id de otro catálogo o inexistente da ITEM_NO_ENCONTRADO', async () => {
    const mixto = await actual.catalogo('MEDIO_PAGO', 'MIXTO');
    await actual.catalogo('ESPECIALIDAD', 'MIXTO');
    const yape = await actual.itemGlobal(mixto, 'YAPE');
    const eliminar = new EliminarItemGlobal(actual.dependencias);
    await expect(eliminar.ejecutar({ catalogo: 'ESPECIALIDAD', itemId: yape.id, version: 0, actorId: ANA })).rejects.toThrow(ItemNoEncontradoError);
    await expect(eliminar.ejecutar({ catalogo: 'MEDIO_PAGO', itemId: 'no-es-uuid', version: 0, actorId: ANA })).rejects.toThrow(ItemNoEncontradoError);
  });

  it('TR-CA-061: Yape referenciado da ITEM_REFERENCIADO y el ítem sigue', async () => {
    const mixto = await actual.catalogo('MEDIO_PAGO', 'MIXTO');
    const yape = await actual.itemGlobal(mixto, 'YAPE');
    actual.referenciados.add(yape.id);
    await expect(
      new EliminarItemGlobal(actual.dependencias).ejecutar({ catalogo: 'MEDIO_PAGO', itemId: yape.id, version: 0, actorId: ANA }),
    ).rejects.toThrow(ItemReferenciadoError);
    expect(actual.consultasReferencias).toEqual([{ itemId: yape.id, catalogo: 'MEDIO_PAGO', codigo: 'YAPE' }]);
    expect(actual.items.filas.has(yape.id)).toBe(true);
    expect(actual.publicados).toEqual([]);
  });

  it('sin referencias se borra con sus ajustes y publica el cambio', async () => {
    const mixto = await actual.catalogo('MEDIO_PAGO', 'MIXTO');
    const yape = await actual.itemGlobal(mixto, 'YAPE');
    await new EliminarItemGlobal(actual.dependencias).ejecutar({ catalogo: 'MEDIO_PAGO', itemId: yape.id, version: 0, actorId: ANA });
    expect(actual.items.filas.has(yape.id)).toBe(false);
    expect(actual.items.ajustesBorrados).toEqual([yape.id]);
    expect(actual.publicados[0].payload).toMatchObject({ cambio: 'ITEM', item_id: yape.id, version_global: 3 });
  });

  it('eliminar con versión obsoleta da VERSION_OBSOLETA', async () => {
    const mixto = await actual.catalogo('MEDIO_PAGO', 'MIXTO');
    const yape = await actual.itemGlobal(mixto, 'YAPE');
    await expect(
      new EliminarItemGlobal(actual.dependencias).ejecutar({ catalogo: 'MEDIO_PAGO', itemId: yape.id, version: 4, actorId: ANA }),
    ).rejects.toThrow(VersionObsoletaError);
  });
});
