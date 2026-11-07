import { Catalogo, type DatosNuevoCatalogo } from '../src/domain/catalogo.js';
import { CatalogoInvalidoError } from '../src/domain/errores.js';

const ID = '0193f3a0-0000-7000-8000-00000000c001';
const ANA = '0193f3a0-0000-7000-8000-000000000901';
const LUIS = '0193f3a0-0000-7000-8000-000000000902';
const AHORA = new Date('2026-11-07T15:00:00Z');
const DESPUES = new Date('2026-11-08T15:00:00Z');

const crear = (cambios: Partial<DatosNuevoCatalogo> = {}): Catalogo =>
  Catalogo.crear({
    id: ID,
    codigo: 'MEDIO_PAGO',
    nombre: 'Medios de pago',
    alcance: 'MIXTO',
    fuente: null,
    editablePorTenant: true,
    por: ANA,
    ahora: AHORA,
    ...cambios,
  });

const errorDe = (accion: () => unknown): Error => {
  try {
    accion();
  } catch (error) {
    return error as Error;
  }
  throw new Error('no falló');
};

describe('Catalogo.crear (TR-RF-022, TR-RN-012)', () => {
  it('TR-CA-058: MEDIO_PAGO MIXTO queda en versión 1 y editable', () => {
    const catalogo = crear();
    expect(catalogo).toMatchObject({ codigo: 'MEDIO_PAGO', alcance: 'MIXTO', editablePorTenant: true, version: 1 });
    expect(catalogo.creadoPor).toBe(ANA);
    expect(catalogo.modificadoEn).toEqual(AHORA);
    expect(catalogo.pullEvents()).toEqual([]);
  });

  it('TR-CA-059: un GLOBAL editable por el tenant se rechaza con el mensaje exacto', () => {
    const error = errorDe(() => crear({ codigo: 'TIPO_DOC_IDENTIDAD', alcance: 'GLOBAL', editablePorTenant: true }));
    expect(error).toBeInstanceOf(CatalogoInvalidoError);
    expect(error).toMatchObject({ code: 'CATALOGO_INVALIDO' });
    expect(error.message).toBe('Un catálogo normativo global no puede ser editable por el tenant');
  });

  it.each(['MIXTO', 'TENANT'] as const)('un %s no editable se rechaza', (alcance) => {
    expect(errorDe(() => crear({ alcance, editablePorTenant: false })).message).toBe(
      'Un catálogo mixto o del tenant debe ser editable por el tenant',
    );
  });

  it('un GLOBAL no editable con fuente se crea', () => {
    expect(crear({ alcance: 'GLOBAL', editablePorTenant: false, fuente: 'SUNAT catálogo 06' })).toMatchObject({
      alcance: 'GLOBAL',
      fuente: 'SUNAT catálogo 06',
    });
  });

  it.each(['MP', 'medio_pago', '1MEDIO', 'MEDIO-PAGO', 'A'.repeat(61)])('rechaza el código %s', (codigo) => {
    const error = errorDe(() => crear({ codigo }));
    expect(error).toBeInstanceOf(CatalogoInvalidoError);
    expect(error.message).toBe('El código debe tener de 3 a 60 mayúsculas, dígitos o guion bajo');
  });

  it.each(['ABC', 'A'.repeat(60), 'CIE_10'])('admite el código %s', (codigo) => {
    expect(crear({ codigo }).codigo).toBe(codigo);
  });

  it.each(['MP', 'x'.repeat(151)])('rechaza el nombre "%s"', (nombre) => {
    expect(errorDe(() => crear({ nombre })).message).toBe('El nombre debe tener de 3 a 150 caracteres');
  });

  it('admiteItems y ajustes según el alcance', () => {
    const global = crear({ alcance: 'GLOBAL', editablePorTenant: false });
    const mixto = crear();
    const tenant = crear({ alcance: 'TENANT' });
    expect([global.admiteItemsGlobales(), global.admiteItemsPropios(), global.admiteAjustes()]).toEqual([true, false, false]);
    expect([mixto.admiteItemsGlobales(), mixto.admiteItemsPropios(), mixto.admiteAjustes()]).toEqual([true, true, true]);
    expect([tenant.admiteItemsGlobales(), tenant.admiteItemsPropios(), tenant.admiteAjustes()]).toEqual([false, true, false]);
  });
});

describe('Catalogo.actualizar', () => {
  const cambios = { nombre: 'Medios de pago', fuente: null, editablePorTenant: true, por: LUIS, ahora: DESPUES };

  it('sin cambios devuelve false, no toca la auditoría ni emite evento (TR-RNF-008)', () => {
    const catalogo = crear();
    expect(catalogo.actualizar(cambios)).toBe(false);
    expect(catalogo.modificadoPor).toBe(ANA);
    expect(catalogo.version).toBe(1);
    expect(catalogo.pullEvents()).toEqual([]);
  });

  it('con un nombre nuevo devuelve true y registra quién y cuándo', () => {
    const catalogo = crear();
    expect(catalogo.actualizar({ ...cambios, nombre: 'Formas de pago', fuente: 'Interno' })).toBe(true);
    expect(catalogo).toMatchObject({ nombre: 'Formas de pago', fuente: 'Interno', modificadoPor: LUIS, modificadoEn: DESPUES });
  });

  it('el alcance no se cambia', () => {
    expect(errorDe(() => crear().actualizar({ ...cambios, alcance: 'GLOBAL' })).message).toBe(
      'El alcance de un catálogo no se cambia',
    );
  });

  it('el mismo alcance se acepta', () => {
    expect(crear().actualizar({ ...cambios, alcance: 'MIXTO' })).toBe(false);
  });

  it('no deja un MIXTO como no editable ni un nombre corto', () => {
    expect(() => crear().actualizar({ ...cambios, editablePorTenant: false })).toThrow(CatalogoInvalidoError);
    expect(() => crear().actualizar({ ...cambios, nombre: 'MP' })).toThrow(CatalogoInvalidoError);
  });

  it('reconstituir conserva la versión', () => {
    const catalogo = crear();
    const otro = Catalogo.reconstituir(ID, 7, {
      codigo: catalogo.codigo,
      nombre: catalogo.nombre,
      alcance: catalogo.alcance,
      fuente: null,
      editablePorTenant: true,
      creadoPor: null,
      creadoEn: AHORA,
      modificadoPor: null,
      modificadoEn: AHORA,
    });
    expect(otro.version).toBe(7);
    expect(otro.creadoPor).toBeNull();
  });
});
