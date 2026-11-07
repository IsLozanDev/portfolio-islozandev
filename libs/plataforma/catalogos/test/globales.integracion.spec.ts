import { ActualizarCatalogo } from '../src/application/actualizar-catalogo.js';
import type { ContenidoItemComando } from '../src/application/contenido-item.js';
import { CrearCatalogo } from '../src/application/crear-catalogo.js';
import { EliminarItemGlobal } from '../src/application/eliminar-item-global.js';
import { GuardarItemGlobal } from '../src/application/guardar-item-global.js';
import { ListarCatalogos } from '../src/application/listar-catalogos.js';
import {
  CatalogoDuplicadoError,
  CodigoItemDuplicadoError,
  ItemNoEncontradoError,
  ItemReferenciadoError,
  VersionObsoletaError,
} from '../src/domain/errores.js';
import { crearEntornoCatalogos, OperadorRequeridoDoble, type EntornoCatalogos } from './support/entorno.js';
import { describeConDb } from './support/temp-db.js';

// Ids de la semilla de 01f_cat.sql.
const MEDIO_PAGO = 'ca700000-0000-0000-0000-000000000001';
const YAPE = 'ca700000-0000-0000-0001-000000000002';
const PLIN = 'ca700000-0000-0000-0001-000000000003';

const contenido = (cambios: Partial<ContenidoItemComando> = {}): ContenidoItemComando => ({
  codigoExterno: null,
  nombre: 'Ítem',
  abreviatura: null,
  orden: 0,
  atributos: {},
  vigenteDesde: '2026-01-01',
  vigenteHasta: null,
  activo: true,
  ...cambios,
});

describeConDb('Catálogos e ítems globales (TR-RF-022, TR-RF-023, PostgreSQL 16)', () => {
  let entorno: EntornoCatalogos;
  let actorId: string;
  const comoOperador = <T>(trabajo: () => Promise<T>) => entorno.en(entorno.tenants.operador, trabajo);
  const comoCliente = <T>(trabajo: () => Promise<T>) => entorno.en(entorno.tenants.cliente, trabajo);
  const consultar = async (sql: string, parametros: unknown[] = []) => (await entorno.dataSource.query(sql, parametros))[0];

  beforeAll(async () => {
    entorno = await crearEntornoCatalogos();
    actorId = entorno.tenants.usuarioId;
  });

  afterAll(() => entorno?.cerrar());

  it('TR-CA-058: crea un catálogo MIXTO en versión 1 con catalogo.actualizado en el outbox, con el tenant del operador', async () => {
    const definicion = await comoOperador(() =>
      new CrearCatalogo(entorno.dependencias).ejecutar({
        codigo: 'FORMA_ENTREGA',
        nombre: 'Formas de entrega',
        alcance: 'MIXTO',
        fuente: null,
        editablePorTenant: true,
        actorId,
      }),
    );
    expect(await consultar(`SELECT alcance, version, creado_por FROM cat.catalogo WHERE id = $1`, [definicion.id])).toEqual({
      alcance: 'MIXTO',
      version: '1',
      creado_por: actorId,
    });
    const [evento] = await entorno.eventosDe(definicion.id);
    expect(evento).toMatchObject({ tenant_id: entorno.tenants.operador, event_type: 'catalogo.actualizado', aggregate_type: 'catalogo', version: '1' });
    expect(evento.payload).toEqual({
      catalogo_id: definicion.id,
      codigo: 'FORMA_ENTREGA',
      version_global: 1,
      version_tenant: 0,
      tenant_id: null,
      cambio: 'CATALOGO',
      item_id: null,
      por: actorId,
    });
  });

  it('un código de catálogo repetido da CATALOGO_DUPLICADO', async () => {
    await expect(
      comoOperador(() =>
        new CrearCatalogo(entorno.dependencias).ejecutar({
          codigo: 'MEDIO_PAGO',
          nombre: 'Otro',
          alcance: 'MIXTO',
          fuente: null,
          editablePorTenant: true,
          actorId,
        }),
      ),
    ).rejects.toThrow(CatalogoDuplicadoError);
  });

  it('un cliente con el permiso recibe OPERADOR_REQUERIDO y no se escribe nada', async () => {
    const antes = await consultar(`SELECT count(*)::int AS total FROM cat.catalogo_item`);
    await expect(
      comoCliente(() => new GuardarItemGlobal(entorno.dependencias).crear({ catalogo: 'MEDIO_PAGO', codigo: 'CHEQUE', ...contenido(), actorId })),
    ).rejects.toThrow(OperadorRequeridoDoble);
    expect(await consultar(`SELECT count(*)::int AS total FROM cat.catalogo_item`)).toEqual(antes);
  });

  it('un ítem global nuevo sube la versión global y el evento lleva la versión que quedó', async () => {
    const { version: antes } = await consultar(`SELECT version FROM cat.catalogo WHERE id = $1`, [MEDIO_PAGO]);
    const item = await comoOperador(() =>
      new GuardarItemGlobal(entorno.dependencias).crear({ catalogo: 'MEDIO_PAGO', codigo: 'TRANSFERENCIA', ...contenido({ orden: 5 }), actorId }),
    );
    const { version: despues } = await consultar(`SELECT version FROM cat.catalogo WHERE id = $1`, [MEDIO_PAGO]);
    expect(Number(despues)).toBe(Number(antes) + 1);
    const [evento] = await entorno.eventosDe(MEDIO_PAGO).then((eventos) => eventos.filter((fila) => (fila.payload as { item_id: string }).item_id === item.id));
    expect(evento.payload).toMatchObject({ cambio: 'ITEM', version_global: Number(despues), tenant_id: null });
  });

  it('TR-CA-060: el DNI de un catálogo nuevo guarda longitud 8 y regex en atributos', async () => {
    await comoOperador(() =>
      new CrearCatalogo(entorno.dependencias).ejecutar({
        codigo: 'DOC_PRUEBA',
        nombre: 'Documentos de prueba',
        alcance: 'GLOBAL',
        fuente: 'SUNAT catálogo 06',
        editablePorTenant: false,
        actorId,
      }),
    );
    const item = await comoOperador(() =>
      new GuardarItemGlobal(entorno.dependencias).crear({
        catalogo: 'DOC_PRUEBA',
        codigo: 'DNI',
        ...contenido({ codigoExterno: '1', atributos: { longitud: 8, regex: '^[0-9]{8}$' } }),
        actorId,
      }),
    );
    expect(await consultar(`SELECT atributos, tenant_id FROM cat.catalogo_item WHERE id = $1`, [item.id])).toEqual({
      atributos: { longitud: 8, regex: '^[0-9]{8}$' },
      tenant_id: null,
    });
  });

  it('un global con el código de un propio de cualquier tenant da CODIGO_DUPLICADO', async () => {
    await entorno.dataSource.query(
      `INSERT INTO cat.catalogo_item (id, catalogo_id, tenant_id, codigo, nombre, vigente_desde)
       VALUES (gen_random_uuid(), $1, $2, 'DINERS', 'Tarjeta Diners', '2026-01-01')`,
      [MEDIO_PAGO, entorno.tenants.cliente],
    );
    await expect(
      comoOperador(() => new GuardarItemGlobal(entorno.dependencias).crear({ catalogo: 'MEDIO_PAGO', codigo: 'DINERS', ...contenido(), actorId })),
    ).rejects.toThrow(CodigoItemDuplicadoError);
    await expect(
      comoOperador(() => new GuardarItemGlobal(entorno.dependencias).crear({ catalogo: 'MEDIO_PAGO', codigo: 'YAPE', ...contenido(), actorId })),
    ).rejects.toThrow(CodigoItemDuplicadoError);
  });

  it('cerrar la vigencia de Plin actualiza la fila; con versión obsoleta da VERSION_OBSOLETA; sin cambios no escribe', async () => {
    const guardar = new GuardarItemGlobal(entorno.dependencias);
    const cierre = { catalogo: 'MEDIO_PAGO', itemId: PLIN, ...contenido({ nombre: 'Plin', orden: 3, vigenteHasta: '2026-12-31' }), actorId };

    expect(await comoOperador(() => guardar.actualizar({ ...cierre, version: 0 }))).toMatchObject({ version: 1, cambiado: true });
    expect(await consultar(`SELECT to_char(vigente_hasta, 'YYYY-MM-DD') AS hasta, version, modificado_por FROM cat.catalogo_item WHERE id = $1`, [PLIN])).toEqual({
      hasta: '2026-12-31',
      version: '1',
      modificado_por: actorId,
    });
    await expect(comoOperador(() => guardar.actualizar({ ...cierre, activo: false, version: 0 }))).rejects.toThrow(VersionObsoletaError);

    const eventos = (await entorno.eventosDe(MEDIO_PAGO)).length;
    expect(await comoOperador(() => guardar.actualizar({ ...cierre, version: 1 }))).toMatchObject({ version: 1, cambiado: false });
    expect(await entorno.eventosDe(MEDIO_PAGO)).toHaveLength(eventos);
  });

  it('actualizar la definición sube la versión; con la versión anterior da VERSION_OBSOLETA', async () => {
    const { version } = await consultar(`SELECT version FROM cat.catalogo WHERE codigo = 'FORMA_ENTREGA'`);
    const actualizar = new ActualizarCatalogo(entorno.dependencias);
    const comando = { codigo: 'FORMA_ENTREGA', nombre: 'Entregas', fuente: null, editablePorTenant: true, actorId };
    expect(await comoOperador(() => actualizar.ejecutar({ ...comando, version: Number(version) }))).toMatchObject({
      version: Number(version) + 1,
      cambiado: true,
    });
    await expect(comoOperador(() => actualizar.ejecutar({ ...comando, nombre: 'Otra', version: Number(version) }))).rejects.toThrow(VersionObsoletaError);
  });

  it('TR-CA-061: Yape referenciado da ITEM_REFERENCIADO y el ítem sigue', async () => {
    entorno.referenciados.add(YAPE);
    try {
      await expect(
        comoOperador(() => new EliminarItemGlobal(entorno.dependencias).ejecutar({ catalogo: 'MEDIO_PAGO', itemId: YAPE, version: 0, actorId })),
      ).rejects.toThrow(ItemReferenciadoError);
    } finally {
      entorno.referenciados.clear();
    }
    expect(await consultar(`SELECT count(*)::int AS total FROM cat.catalogo_item WHERE id = $1`, [YAPE])).toEqual({ total: 1 });
  });

  it('sin referencias, Yape se borra junto con sus ajustes y el borrado entra al outbox', async () => {
    await entorno.dataSource.query(
      `INSERT INTO cat.catalogo_item_tenant (item_id, tenant_id, visible, alias, modificado_por) VALUES ($1, $2, true, 'Yape QR', $3)`,
      [YAPE, entorno.tenants.cliente, actorId],
    );
    await comoOperador(() => new EliminarItemGlobal(entorno.dependencias).ejecutar({ catalogo: 'MEDIO_PAGO', itemId: YAPE, version: 0, actorId }));
    expect(await consultar(`SELECT (SELECT count(*) FROM cat.catalogo_item WHERE id = $1)::int AS items,
                                   (SELECT count(*) FROM cat.catalogo_item_tenant WHERE item_id = $1)::int AS ajustes`, [YAPE])).toEqual({
      items: 0,
      ajustes: 0,
    });
    const eventos = await entorno.eventosDe(MEDIO_PAGO);
    expect(eventos.at(-1)?.payload).toMatchObject({ cambio: 'ITEM', item_id: YAPE });
    await expect(
      comoOperador(() => new EliminarItemGlobal(entorno.dependencias).ejecutar({ catalogo: 'MEDIO_PAGO', itemId: YAPE, version: 0, actorId })),
    ).rejects.toThrow(ItemNoEncontradoError);
  });

  it('un cliente lista las definiciones', async () => {
    const lista = await comoCliente(() => new ListarCatalogos(entorno.dependencias).ejecutar());
    expect(lista.map((definicion) => definicion.codigo)).toEqual(expect.arrayContaining(['ESPECIALIDAD', 'MEDIO_PAGO', 'TIPO_COMPROBANTE', 'TIPO_DOC_IDENTIDAD']));
  });
});
