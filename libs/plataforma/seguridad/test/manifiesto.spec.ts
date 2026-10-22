import { ManifiestoInvalidoError, ManifiestoVersionAlteradaError, ManifiestoVersionAnteriorError } from '../src/domain/errores.js';
import { compararSemver, Manifiesto, resumir, totalCambios, type CatalogoProducto } from '../src/domain/manifiesto.js';

type Json = Record<string, unknown>;

const REST_140 = (): Json => ({
  producto_codigo: 'REST',
  nombre: 'Restaurantes',
  version: '1.4.0',
  modulos: [{ codigo: 'caja', nombre: 'Caja', orden: 1 }],
  opciones: [
    { codigo: 'rest.caja', modulo: 'caja', padre: null, nombre: 'Caja', icono: 'point_of_sale', orden: 1, permisos: [] },
    { codigo: 'rest.caja.cierre', modulo: 'caja', padre: 'rest.caja', nombre: 'Cierre', ruta: '/caja/cierre', permisos: ['rest.caja.cerrar'] },
  ],
  permisos: [
    { codigo: 'rest.caja.cerrar', descripcion: 'Cerrar caja', alcance_minimo: 'UNIDAD', sensible: false },
    { codigo: 'rest.pedido.anular', descripcion: 'Anular pedido', alcance_minimo: 'SUCURSAL', sensible: true },
  ],
  roles_predefinidos: [{ codigo: 'REST_CAJERO', nombre: 'Cajero', permisos: ['rest.caja.cerrar'] }],
  parametros: [{ codigo: 'rest.propina.porcentaje' }],
  indicadores: [],
  reportes: [],
});

const REST_150 = (): Json => {
  const m = REST_140();
  m.version = '1.5.0';
  (m.permisos as Json[]).push({ codigo: 'rest.propina.configurar', descripcion: 'Configurar propina', alcance_minimo: 'SUCURSAL', sensible: false });
  return m;
};

const VACIO: CatalogoProducto = { vigente: null, modulos: [], opciones: [], permisos: [], roles: [] };

/** El catálogo que quedaría en seg tras aplicar el manifiesto, con su versión y hash. */
function aplicado(m: Manifiesto, hash = 'h-' + m.version): CatalogoProducto {
  const vigente = (x: object) => ({ ...x, obsoleto: false });
  return {
    vigente: { version: m.version, hash },
    modulos: m.modulos.map(vigente) as CatalogoProducto['modulos'],
    opciones: m.opciones.map(vigente) as CatalogoProducto['opciones'],
    permisos: m.permisos.map(vigente) as CatalogoProducto['permisos'],
    roles: m.roles.map(vigente) as CatalogoProducto['roles'],
  };
}

const errores = (json: unknown): readonly string[] => {
  try {
    Manifiesto.leer(json);
  } catch (e) {
    if (e instanceof ManifiestoInvalidoError) return e.detalles;
    throw e;
  }
  throw new Error('no falló');
};

describe('Manifiesto.leer', () => {
  it('lee un manifiesto válido', () => {
    const m = Manifiesto.leer(REST_140());
    expect(m.productoCodigo).toBe('REST');
    expect(m.version).toBe('1.4.0');
    expect(m.permisos).toContainEqual({ codigo: 'rest.pedido.anular', descripcion: 'Anular pedido', alcanceMinimo: 'SUCURSAL', sensible: true });
    expect(m.opciones[1]).toEqual(expect.objectContaining({ padre: 'rest.caja', ruta: '/caja/cierre', icono: null, orden: 0 }));
  });

  it('parámetros, indicadores y reportes pueden faltar', () => {
    const m = REST_140();
    delete m.parametros;
    delete m.indicadores;
    delete m.reportes;
    expect(() => Manifiesto.leer(m)).not.toThrow();
  });

  it('TR-CA-024: un permiso mal formado rechaza el manifiesto completo y nombra el permiso', () => {
    const m = REST_150();
    (m.permisos as Json[]).push({ codigo: 'rest-caja-cerrar', descripcion: 'Mal', alcance_minimo: 'SUCURSAL' });
    expect(() => Manifiesto.leer(m)).toThrow(ManifiestoInvalidoError);
    expect(errores(m)).toEqual(['permisos[3].codigo: rest-caja-cerrar']);
  });

  it('acumula todos los errores con su ruta', () => {
    const m = REST_140();
    m.version = '1.4';
    m.extra = true;
    (m.permisos as Json[]).push({ codigo: 'gym.acceso.registrar', descripcion: 'Ajeno', alcance_minimo: 'PAIS', sensible: 'si' });
    (m.permisos as Json[]).push({ codigo: 'rest.caja.cerrar', descripcion: 'Repetido', alcance_minimo: 'UNIDAD' });
    (m.opciones as Json[]).push({ codigo: 'rest.huerfana', modulo: 'bar', padre: 'rest.nada', nombre: 'Huérfana', orden: -1, permisos: ['rest.no.existe'] });
    (m.roles_predefinidos as Json[]).push({ codigo: 'RX', nombre: 'Rol', permisos: 'todo' });
    m.reportes = [{ nombre: 'sin código' }];

    expect(errores(m)).toEqual([
      'extra: clave desconocida',
      'version: 1.4',
      'permisos[2].codigo: gym.acceso.registrar no es del producto REST',
      'permisos[2].alcance_minimo: PAIS',
      'permisos[2].sensible: debe ser booleano',
      'permisos: código repetido rest.caja.cerrar',
      'opciones[2].modulo: bar no está en modulos',
      'opciones[2].orden: entero de 0 a 32767',
      'opciones[2].permisos: rest.no.existe no está en permisos',
      'opciones[2].padre: rest.nada no está en opciones',
      'roles_predefinidos[1].codigo: texto de 3 a 50 caracteres',
      'roles_predefinidos[1].permisos: debe ser un arreglo de códigos',
      'reportes[0].codigo: texto de 1 a 80 caracteres',
    ]);
  });

  it('detecta ciclos y autorreferencias en las opciones', () => {
    const m = REST_140();
    (m.opciones as Json[])[0].padre = 'rest.caja.cierre';
    expect(errores(m)).toContain('opciones[0].padre: ciclo en rest.caja');
  });

  it.each([null, [], 'texto'])('rechaza una raíz que no es objeto: %p', (raiz) => {
    expect(errores(raiz)).toEqual(['debe ser un objeto']);
  });

  it('rechaza listas que no son arreglos o con elementos que no son objetos', () => {
    const m = REST_140();
    m.modulos = 'caja';
    m.permisos = [...(m.permisos as Json[]), 7];
    expect(errores(m)).toEqual(expect.arrayContaining(['modulos: debe ser un arreglo', 'permisos[2]: debe ser un objeto']));
  });

  it('el canónico no depende del orden', () => {
    const a = REST_140();
    const b = REST_140();
    (b.permisos as Json[]).reverse();
    (b.opciones as Json[]).reverse();
    expect(Manifiesto.leer(a).canonico()).toBe(Manifiesto.leer(b).canonico());
    expect(Manifiesto.leer(REST_150()).canonico()).not.toBe(Manifiesto.leer(a).canonico());
  });
});

describe('Manifiesto.planificar (TR-RF-008, TR-RNF-120)', () => {
  it('primera aplicación inserta todo', () => {
    const plan = Manifiesto.leer(REST_140()).planificar(VACIO, 'h');
    expect(plan.yaAplicado).toBe(false);
    expect(resumir(plan.cambios)).toEqual({
      modulos: { insertados: 1, actualizados: 0, obsoletos: 0 },
      opciones: { insertados: 2, actualizados: 0, obsoletos: 0 },
      permisos: { insertados: 2, actualizados: 0, obsoletos: 0 },
      roles: { insertados: 1, actualizados: 0, obsoletos: 0 },
    });
  });

  it('TR-CA-022: de 1.4.0 a 1.5.0 agrega rest.propina.configurar', () => {
    const actual = aplicado(Manifiesto.leer(REST_140()));
    const plan = Manifiesto.leer(REST_150()).planificar(actual, 'h-150');

    expect(plan.cambios.permisos.insertados.map((p) => p.codigo)).toEqual(['rest.propina.configurar']);
    expect(totalCambios(plan.cambios)).toBe(1);
  });

  it('TR-CA-023: aplicar otra vez el mismo manifiesto da 0 cambios', () => {
    const m = Manifiesto.leer(REST_150());
    const plan = m.planificar(aplicado(m, 'h'), 'h');
    expect(plan.yaAplicado).toBe(true);
    expect(totalCambios(plan.cambios)).toBe(0);
  });

  it('una versión nueva con el mismo contenido no tiene cambios de catálogo', () => {
    const actual = aplicado(Manifiesto.leer(REST_140()));
    const m = REST_140();
    m.version = '1.4.1';
    const plan = Manifiesto.leer(m).planificar(actual, 'h-141');
    expect(plan.yaAplicado).toBe(false);
    expect(totalCambios(plan.cambios)).toBe(0);
  });

  it('la misma versión con otro contenido se rechaza', () => {
    const m = Manifiesto.leer(REST_150());
    expect(() => m.planificar(aplicado(m, 'h-original'), 'h-alterado')).toThrow(ManifiestoVersionAlteradaError);
  });

  it('una versión anterior a la vigente se rechaza', () => {
    const actual = aplicado(Manifiesto.leer(REST_150()));
    expect(() => Manifiesto.leer(REST_140()).planificar(actual, 'h')).toThrow(ManifiestoVersionAnteriorError);
  });

  it('lo retirado queda obsoleto y lo que reaparece se reactiva', () => {
    const actual = aplicado(Manifiesto.leer(REST_140()));
    const m160 = REST_140();
    m160.version = '1.6.0';
    m160.permisos = (m160.permisos as Json[]).filter((p) => p.codigo !== 'rest.pedido.anular');
    const plan = Manifiesto.leer(m160).planificar(actual, 'h-160');
    expect(plan.cambios.permisos.obsoletos).toEqual(['rest.pedido.anular']);

    const conRetirado: CatalogoProducto = {
      ...actual,
      permisos: actual.permisos.map((p) => (p.codigo === 'rest.pedido.anular' ? { ...p, obsoleto: true } : p)),
    };
    const m170 = REST_140();
    m170.version = '1.7.0';
    const reaparece = Manifiesto.leer(m170).planificar({ ...conRetirado, vigente: { version: '1.6.0', hash: 'h-160' } }, 'h-170');
    expect(reaparece.cambios.permisos.actualizados.map((p) => p.codigo)).toEqual(['rest.pedido.anular']);
    expect(reaparece.cambios.permisos.obsoletos).toEqual([]);
  });

  it('un cambio de campo o de permisos de un rol es una actualización', () => {
    const actual = aplicado(Manifiesto.leer(REST_140()));
    const m = REST_140();
    m.version = '2.0.0';
    (m.modulos as Json[])[0].nombre = 'Caja y arqueo';
    (m.roles_predefinidos as Json[])[0].permisos = ['rest.caja.cerrar', 'rest.pedido.anular'];
    const plan = Manifiesto.leer(m).planificar(actual, 'h-200');
    expect(plan.cambios.modulos.actualizados.map((x) => x.codigo)).toEqual(['caja']);
    expect(plan.cambios.roles.actualizados.map((x) => x.codigo)).toEqual(['REST_CAJERO']);
    expect(totalCambios(plan.cambios)).toBe(2);
  });
});

describe('compararSemver', () => {
  it('compara numéricamente cada parte', () => {
    expect(compararSemver('1.10.0', '1.9.9')).toBeGreaterThan(0);
    expect(compararSemver('1.4.0', '1.5.0')).toBeLessThan(0);
    expect(compararSemver('2.0.0', '2.0.0')).toBe(0);
  });
});
