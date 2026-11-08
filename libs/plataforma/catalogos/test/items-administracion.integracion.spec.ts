import { AjustarItem } from '../src/application/ajustar-item.js';
import { GuardarItemPropio } from '../src/application/guardar-item-propio.js';
import { ListarItemsAdministracion, type ListarItemsAdministracionConsulta } from '../src/application/listar-items-administracion.js';
import { CatalogoNoExisteError } from '../src/domain/errores.js';
import { LecturaItemsAdministracionTypeOrm } from '../src/infrastructure/typeorm/lectura-items-administracion.typeorm.js';
import { crearEntornoCatalogos, type EntornoCatalogos } from './support/entorno.js';
import { describeConDb } from './support/temp-db.js';

// Ids de la semilla de 01f_cat.sql.
const PLIN = 'ca700000-0000-0000-0001-000000000003';

describeConDb('ListarItemsAdministracion (PostgreSQL 16)', () => {
  let entorno: EntornoCatalogos;
  let listarItems: ListarItemsAdministracion;
  const comoCliente = <T>(trabajo: () => Promise<T>) => entorno.en(entorno.tenants.cliente, trabajo);
  const listar = (cambios: Partial<ListarItemsAdministracionConsulta> = {}) =>
    listarItems.ejecutar({ catalogo: 'MEDIO_PAGO', texto: null, estado: null, origen: null, pagina: 1, tamano: 25, ...cambios });
  const codigos = async (cambios: Partial<ListarItemsAdministracionConsulta> = {}) => {
    const pagina = await comoCliente(() => listar(cambios));
    return { codigos: pagina.items.map((item) => item.codigo), total: pagina.total };
  };

  beforeAll(async () => {
    entorno = await crearEntornoCatalogos();
    const { unidadDeTrabajo, contexto, reloj, catalogos } = entorno.dependencias;
    listarItems = new ListarItemsAdministracion({ unidadDeTrabajo, contexto, reloj, catalogos, lectura: new LecturaItemsAdministracionTypeOrm(unidadDeTrabajo) });
    const actorId = entorno.tenants.usuarioId;
    await comoCliente(async () => {
      await new AjustarItem(entorno.dependencias).ejecutar({ catalogo: 'MEDIO_PAGO', itemId: PLIN, visible: false, orden: 9, alias: 'Plin QR', version: null, actorId });
      await new GuardarItemPropio(entorno.dependencias).crear({
        catalogo: 'MEDIO_PAGO',
        codigo: 'DINERS',
        codigoExterno: null,
        nombre: 'Tarjeta Diners',
        abreviatura: null,
        orden: 5,
        atributos: {},
        vigenteDesde: '2026-01-01',
        vigenteHasta: null,
        activo: true,
        actorId,
      });
    });
  });

  afterAll(() => entorno?.cerrar());

  it('MEDIO_PAGO con Plin oculto trae Plin OCULTO con su ajuste y el propio con propio true', async () => {
    const pagina = await comoCliente(() => listar());
    expect(pagina.items.map((item) => [item.codigo, item.estado, item.propio])).toEqual([
      ['EFECTIVO', 'VISIBLE', false],
      ['YAPE', 'VISIBLE', false],
      ['TARJETA', 'VISIBLE', false],
      ['DINERS', 'VISIBLE', true],
      ['PLIN', 'OCULTO', false],
    ]);
    expect(pagina.total).toBe(5);
    expect(pagina.items.find((item) => item.codigo === 'PLIN')).toEqual({
      itemId: PLIN,
      codigo: 'PLIN',
      codigoExterno: null,
      nombre: 'Plin',
      abreviatura: null,
      orden: 3,
      atributos: {},
      vigenteDesde: '2026-01-01',
      vigenteHasta: null,
      activo: true,
      propio: false,
      estado: 'OCULTO',
      ajuste: { visible: false, orden: 9, alias: 'Plin QR', version: 0 },
      version: 0,
    });
    expect(pagina.items.find((item) => item.codigo === 'DINERS')?.ajuste).toBeNull();
  });

  it('el operador ve los globales sin los ajustes ni los propios del cliente', async () => {
    const pagina = await entorno.en(entorno.tenants.operador, () => listar());
    expect(pagina.items.map((item) => [item.codigo, item.estado, item.ajuste])).toEqual([
      ['EFECTIVO', 'VISIBLE', null],
      ['YAPE', 'VISIBLE', null],
      ['PLIN', 'VISIBLE', null],
      ['TARJETA', 'VISIBLE', null],
    ]);
  });

  it('texto, estado y origen filtran con el total correcto', async () => {
    await expect(codigos({ origen: 'PROPIO' })).resolves.toEqual({ codigos: ['DINERS'], total: 1 });
    await expect(codigos({ origen: 'GLOBAL' })).resolves.toMatchObject({ total: 4 });
    await expect(codigos({ estado: 'OCULTO' })).resolves.toEqual({ codigos: ['PLIN'], total: 1 });
    await expect(codigos({ texto: 'efec' })).resolves.toEqual({ codigos: ['EFECTIVO'], total: 1 });
    await expect(codigos({ texto: 'tarjeta' })).resolves.toEqual({ codigos: ['TARJETA', 'DINERS'], total: 2 });
  });

  it('pagina con el total sin paginar, también fuera de rango', async () => {
    await expect(codigos({ pagina: 2, tamano: 2 })).resolves.toEqual({ codigos: ['TARJETA', 'DINERS'], total: 5 });
    await expect(codigos({ pagina: 9, tamano: 2 })).resolves.toEqual({ codigos: [], total: 5 });
  });

  it('un catálogo inexistente da CATALOGO_NO_EXISTE', async () => {
    await expect(comoCliente(() => listar({ catalogo: 'NO_EXISTE' }))).rejects.toThrow(CatalogoNoExisteError);
  });
});
