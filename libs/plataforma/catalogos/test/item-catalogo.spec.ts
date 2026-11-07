import { Catalogo } from '../src/domain/catalogo.js';
import { AlcanceNoPermiteError, ItemInvalidoError } from '../src/domain/errores.js';
import { ItemCatalogo, type CambiosItem, type DatosNuevoItem } from '../src/domain/item-catalogo.js';
import type { AlcanceCatalogo } from '../src/domain/tipos.js';
import { Vigencia } from '../src/domain/vigencia.js';

const TENANT = '0193f3a0-0000-7000-8000-000000000001';
const ANA = '0193f3a0-0000-7000-8000-000000000901';
const LUIS = '0193f3a0-0000-7000-8000-000000000902';
const AHORA = new Date('2026-11-07T15:00:00Z');
const DESPUES = new Date('2026-11-08T15:00:00Z');
const DESDE_2026 = Vigencia.de('2026-01-01', null);

const catalogo = (alcance: AlcanceCatalogo): Catalogo =>
  Catalogo.crear({
    id: '0193f3a0-0000-7000-8000-00000000c001',
    codigo: 'TIPO_DOC_IDENTIDAD',
    nombre: 'Tipos de documento',
    alcance,
    fuente: null,
    editablePorTenant: alcance !== 'GLOBAL',
    por: ANA,
    ahora: AHORA,
  });

const crear = (cambios: Partial<DatosNuevoItem> = {}): ItemCatalogo =>
  ItemCatalogo.crear({
    id: '0193f3a0-0000-7000-8000-00000000d001',
    catalogo: catalogo('GLOBAL'),
    tenantId: null,
    codigo: 'DNI',
    codigoExterno: '1',
    nombre: 'Documento nacional de identidad',
    abreviatura: 'DNI',
    orden: 1,
    atributos: { longitud: 8, regex: '^[0-9]{8}$' },
    vigencia: DESDE_2026,
    activo: true,
    por: ANA,
    ahora: AHORA,
    ...cambios,
  });

const mensajeDe = (accion: () => unknown): string => {
  try {
    accion();
  } catch (error) {
    return (error as Error).message;
  }
  throw new Error('no falló');
};

describe('ItemCatalogo.crear (TR-RF-023, TR-RN-012)', () => {
  it('TR-CA-060: DNI guarda longitud 8 y regex en atributos, global y en versión 0', () => {
    const item = crear();
    expect(item.atributos).toEqual({ longitud: 8, regex: '^[0-9]{8}$' });
    expect(item).toMatchObject({ codigo: 'DNI', codigoExterno: '1', esGlobal: true, tenantId: null, version: 0, activo: true });
    expect(item.catalogoId).toBe('0193f3a0-0000-7000-8000-00000000c001');
    expect(item.creadoPor).toBe(ANA);
  });

  it('un propio en un catálogo MIXTO o TENANT se crea', () => {
    expect(crear({ catalogo: catalogo('MIXTO'), tenantId: TENANT }).esGlobal).toBe(false);
    expect(crear({ catalogo: catalogo('TENANT'), tenantId: TENANT }).tenantId).toBe(TENANT);
  });

  it('un propio en un catálogo GLOBAL no se admite', () => {
    expect(() => crear({ tenantId: TENANT })).toThrow(AlcanceNoPermiteError);
  });

  it('un global en un catálogo TENANT no se admite', () => {
    expect(() => crear({ catalogo: catalogo('TENANT') })).toThrow(AlcanceNoPermiteError);
  });

  it.each([
    ['código vacío', { codigo: '' }, 'El código debe tener de 1 a 40 caracteres'],
    ['código de 41', { codigo: 'C'.repeat(41) }, 'El código debe tener de 1 a 40 caracteres'],
    ['nombre vacío', { nombre: '' }, 'El nombre debe tener de 1 a 200 caracteres'],
    ['nombre de 201', { nombre: 'n'.repeat(201) }, 'El nombre debe tener de 1 a 200 caracteres'],
    ['abreviatura de 31', { abreviatura: 'a'.repeat(31) }, 'La abreviatura debe tener como máximo 30 caracteres'],
    ['código externo de 41', { codigoExterno: 'e'.repeat(41) }, 'El código externo debe tener como máximo 40 caracteres'],
    ['regex que no compila', { atributos: { regex: '[0-9' } }, 'El atributo regex no es una expresión regular válida'],
  ] as const)('rechaza %s', (_caso, cambios, mensaje) => {
    expect(mensajeDe(() => crear(cambios as Partial<DatosNuevoItem>))).toBe(mensaje);
  });

  it('admite los límites de longitud', () => {
    const item = crear({ codigo: 'C'.repeat(40), nombre: 'n'.repeat(200), abreviatura: 'a'.repeat(30), codigoExterno: null });
    expect(item.codigo).toHaveLength(40);
    expect(item.abreviatura).toHaveLength(30);
  });

  it('los errores de validación son ITEM_INVALIDO', () => {
    expect(() => crear({ nombre: '' })).toThrow(ItemInvalidoError);
  });
});

describe('ItemCatalogo.actualizar', () => {
  const cambios = (otros: Partial<CambiosItem> = {}): CambiosItem => ({
    codigoExterno: '1',
    nombre: 'Documento nacional de identidad',
    abreviatura: 'DNI',
    orden: 1,
    atributos: { regex: '^[0-9]{8}$', longitud: 8 },
    vigencia: Vigencia.de('2026-01-01', null),
    activo: true,
    por: LUIS,
    ahora: DESPUES,
    ...otros,
  });

  it('sin cambios devuelve false aunque los atributos vengan en otro orden (TR-RNF-008)', () => {
    const item = crear();
    expect(item.actualizar(cambios())).toBe(false);
    expect(item.modificadoPor).toBe(ANA);
    expect(item.pullEvents()).toEqual([]);
  });

  it.each([
    ['cerrar la vigencia', { vigencia: Vigencia.de('2026-01-01', '2026-12-31') }],
    ['inactivar', { activo: false }],
    ['cambiar el orden', { orden: 2 }],
    ['cambiar un atributo', { atributos: { longitud: 9 } }],
    ['cambiar el nombre', { nombre: 'DNI' }],
    ['quitar la abreviatura', { abreviatura: null }],
    ['quitar el código externo', { codigoExterno: null }],
  ] as const)('%s devuelve true y registra quién', (_caso, otros) => {
    const item = crear();
    expect(item.actualizar(cambios(otros as Partial<CambiosItem>))).toBe(true);
    expect(item).toMatchObject({ modificadoPor: LUIS, modificadoEn: DESPUES });
  });

  it('valida igual que al crear y no cambia el código', () => {
    const item = crear();
    expect(() => item.actualizar(cambios({ nombre: '' }))).toThrow(ItemInvalidoError);
    item.actualizar(cambios({ activo: false }));
    expect(item.codigo).toBe('DNI');
    expect(item.vigencia.hasta).toBeNull();
  });

  it('reconstituir conserva la versión y el dueño', () => {
    const item = ItemCatalogo.reconstituir('0193f3a0-0000-7000-8000-00000000d002', 3, {
      catalogoId: '0193f3a0-0000-7000-8000-00000000c001',
      tenantId: TENANT,
      codigo: 'DINERS',
      codigoExterno: null,
      nombre: 'Tarjeta Diners',
      abreviatura: null,
      orden: 5,
      atributos: {},
      vigencia: DESDE_2026,
      activo: true,
      creadoPor: ANA,
      creadoEn: AHORA,
      modificadoPor: ANA,
      modificadoEn: AHORA,
    });
    expect(item).toMatchObject({ version: 3, tenantId: TENANT, esGlobal: false, creadoEn: AHORA });
  });
});
