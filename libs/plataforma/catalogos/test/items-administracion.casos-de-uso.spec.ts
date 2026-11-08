import { AjustarItem } from '../src/application/ajustar-item.js';
import { GuardarItemPropio } from '../src/application/guardar-item-propio.js';
import { ListarItemsAdministracion, type ListarItemsAdministracionConsulta } from '../src/application/listar-items-administracion.js';
import { CatalogoNoExisteError } from '../src/domain/errores.js';
import { ANA, CLIENTE, escenario, type Escenario } from './support/dobles.js';
import { dependenciasAdministracion, LecturaItemsAdministracionEnMemoria } from './support/dobles-administracion.js';

const consulta = (cambios: Partial<ListarItemsAdministracionConsulta> = {}): ListarItemsAdministracionConsulta => ({
  catalogo: 'MEDIO_PAGO',
  texto: null,
  estado: null,
  origen: null,
  pagina: 1,
  tamano: 25,
  ...cambios,
});

describe('ListarItemsAdministracion (apoyo a TR-RF-023, 025 y 026)', () => {
  let actual: Escenario;
  let lectura: LecturaItemsAdministracionEnMemoria;
  let plinId: string;
  const listar = (cambios: Partial<ListarItemsAdministracionConsulta> = {}) =>
    new ListarItemsAdministracion(dependenciasAdministracion(actual, lectura)).ejecutar(consulta(cambios));
  const codigos = async (cambios: Partial<ListarItemsAdministracionConsulta> = {}) => {
    const pagina = await listar(cambios);
    return { codigos: pagina.items.map((item) => item.codigo), total: pagina.total };
  };

  beforeEach(async () => {
    actual = escenario();
    lectura = new LecturaItemsAdministracionEnMemoria(actual);
    const catalogo = await actual.catalogo('MEDIO_PAGO', 'MIXTO');
    await actual.itemGlobal(catalogo, 'EFECTIVO');
    await actual.itemGlobal(catalogo, 'YAPE');
    plinId = (await actual.itemGlobal(catalogo, 'PLIN')).id;
    actual.comoTenant(CLIENTE);
    await new AjustarItem(actual.dependencias).ejecutar({
      catalogo: 'MEDIO_PAGO',
      itemId: plinId,
      visible: false,
      orden: 9,
      alias: 'Plin QR',
      version: null,
      actorId: ANA,
    });
    await new GuardarItemPropio(actual.dependencias).crear({
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
      actorId: ANA,
    });
  });

  it('MEDIO_PAGO para un tenant con Plin oculto trae Plin con estado OCULTO y su ajuste, y el propio con propio true', async () => {
    const pagina = await listar();
    expect(pagina).toMatchObject({ total: 4, pagina: 1, tamano: 25 });
    expect(pagina.items.map((item) => [item.codigo, item.estado, item.propio])).toEqual([
      ['EFECTIVO', 'VISIBLE', false],
      ['YAPE', 'VISIBLE', false],
      ['DINERS', 'VISIBLE', true],
      ['PLIN', 'OCULTO', false],
    ]);
    expect(pagina.items.find((item) => item.codigo === 'PLIN')).toMatchObject({
      itemId: plinId,
      nombre: 'PLIN',
      ajuste: { visible: false, orden: 9, alias: 'Plin QR', version: 0 },
    });
    expect(pagina.items.find((item) => item.codigo === 'DINERS')).toMatchObject({ nombre: 'Tarjeta Diners', orden: 5, ajuste: null });
  });

  it('usa el tenant del contexto y la fecha de hoy en America/Lima', async () => {
    await listar();
    expect(lectura.filtros[0]).toMatchObject({ tenantId: CLIENTE, fecha: '2026-11-07', limite: 25, desplazamiento: 0 });
  });

  it('origen=PROPIO y origen=GLOBAL filtran con su total', async () => {
    await expect(codigos({ origen: 'PROPIO' })).resolves.toEqual({ codigos: ['DINERS'], total: 1 });
    await expect(codigos({ origen: 'GLOBAL' })).resolves.toEqual({ codigos: ['EFECTIVO', 'YAPE', 'PLIN'], total: 3 });
  });

  it('estado filtra con su total', async () => {
    await expect(codigos({ estado: 'OCULTO' })).resolves.toEqual({ codigos: ['PLIN'], total: 1 });
  });

  it('texto busca por código y por nombre, sin distinguir mayúsculas', async () => {
    await expect(codigos({ texto: 'efec' })).resolves.toEqual({ codigos: ['EFECTIVO'], total: 1 });
    await expect(codigos({ texto: 'tarjeta' })).resolves.toEqual({ codigos: ['DINERS'], total: 1 });
  });

  it('pagina con el total sin paginar', async () => {
    await expect(codigos({ pagina: 2, tamano: 2 })).resolves.toEqual({ codigos: ['DINERS', 'PLIN'], total: 4 });
    expect(lectura.filtros.at(-1)).toMatchObject({ limite: 2, desplazamiento: 2 });
  });

  it('una página fuera de rango no trae ítems pero sí el total', async () => {
    await expect(codigos({ pagina: 5, tamano: 2 })).resolves.toEqual({ codigos: [], total: 4 });
  });

  it('un catálogo inexistente da 404 CATALOGO_NO_EXISTE sin leer ítems', async () => {
    await expect(listar({ catalogo: 'NO_EXISTE' })).rejects.toThrow(CatalogoNoExisteError);
    expect(lectura.filtros).toEqual([]);
  });
});
