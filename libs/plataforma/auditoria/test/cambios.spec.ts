import { calcularCambios, camposCambiados, MAXIMO_CAMBIOS, MAXIMO_LARGO_CAMPOS_CAMBIADOS, RUTA_RAIZ } from '../src/domain/cambios.js';

describe('calcularCambios (spec 20b)', () => {
  it('devuelve las rutas anidadas cuyo valor difiere, con el valor anterior y el nuevo', () => {
    const antes = { estado: 'EMITIDA', cliente: { nombre: 'Rosa', ruc: '20123456789' }, total: 120 };
    const despues = { estado: 'ANULADA', cliente: { nombre: 'Rosa', ruc: '20123456789' }, total: 0 };
    expect(calcularCambios(antes, despues)).toEqual([
      { campo: 'estado', antes: 'EMITIDA', despues: 'ANULADA' },
      { campo: 'total', antes: 120, despues: 0 },
    ]);
  });

  it('compara los arreglos por índice', () => {
    const antes = { items: [{ monto: 10 }, { monto: 20 }] };
    const despues = { items: [{ monto: 10 }, { monto: 25 }, { monto: 5 }] };
    expect(calcularCambios(antes, despues)).toEqual([
      { campo: 'items[1].monto', antes: 20, despues: 25 },
      { campo: 'items[2].monto', antes: null, despues: 5 },
    ]);
  });

  it('una clave que aparece o desaparece lleva null en el otro lado', () => {
    expect(calcularCambios({ motivo: 'error', descuento: 5 }, { motivo: 'error', propina: 3 })).toEqual([
      { campo: 'descuento', antes: 5, despues: null },
      { campo: 'propina', antes: null, despues: 3 },
    ]);
  });

  it('con antes nulo, todas las rutas de despues son cambios', () => {
    expect(calcularCambios(null, { ruc: '20123456789', direccion: { distrito: 'Surco' } })).toEqual([
      { campo: 'direccion.distrito', antes: null, despues: 'Surco' },
      { campo: 'ruc', antes: null, despues: '20123456789' },
    ]);
  });

  it('sin diferencias, o sin antes ni despues, no hay cambios', () => {
    expect(calcularCambios({ a: [1, { b: 2 }] }, { a: [1, { b: 2 }] })).toEqual([]);
    expect(calcularCambios(null, null)).toEqual([]);
    expect(calcularCambios(undefined, undefined)).toEqual([]);
  });

  it('un valor que no es objeto se compara en la raíz, y un objeto vacío es un valor', () => {
    expect(calcularCambios(1, 2)).toEqual([{ campo: RUTA_RAIZ, antes: 1, despues: 2 }]);
    expect(calcularCambios({ extras: {} }, { extras: [] })).toEqual([{ campo: 'extras', antes: {}, despues: [] }]);
  });

  it('ordena por ruta y corta en 200 cambios', () => {
    const despues = Object.fromEntries(Array.from({ length: MAXIMO_CAMBIOS + 50 }, (_, indice) => [`campo_${String(indice).padStart(3, '0')}`, indice]));
    const cambios = calcularCambios({}, despues);
    expect(cambios).toHaveLength(MAXIMO_CAMBIOS);
    expect(cambios[0].campo).toBe('campo_000');
    expect(cambios.map((cambio) => cambio.campo)).toEqual([...cambios.map((cambio) => cambio.campo)].sort());
  });
});

describe('camposCambiados (spec 20b, columna de la exportación)', () => {
  it('une las rutas que cambiaron con coma', () => {
    expect(camposCambiados({ estado: 'EMITIDA', items: [{ monto: 10 }] }, { estado: 'ANULADA', items: [{ monto: 0 }] })).toBe('estado, items[0].monto');
    expect(camposCambiados(null, null)).toBe('');
  });

  it('corta en 500 caracteres con «…» al final', () => {
    const despues = Object.fromEntries(Array.from({ length: 100 }, (_, indice) => [`campo_largo_${String(indice).padStart(3, '0')}`, indice]));
    const texto = camposCambiados({}, despues);
    expect(texto).toHaveLength(MAXIMO_LARGO_CAMPOS_CAMBIADOS);
    expect(texto.endsWith('…')).toBe(true);
    expect(texto.startsWith('campo_largo_000, campo_largo_001')).toBe(true);
  });
});
