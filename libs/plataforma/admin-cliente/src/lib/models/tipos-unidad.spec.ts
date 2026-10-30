import { ETIQUETAS_TIPO_UNIDAD, TIPOS_UNIDAD } from './tipos-unidad';

describe('TIPOS_UNIDAD', () => {
  // Si ORG cambia la lista (o llega el catálogo del 19a), esta prueba avisa del desfase.
  it('repite los nueve tipos de libs/plataforma/org en el mismo orden', () => {
    expect(TIPOS_UNIDAD).toEqual(['ALMACEN', 'CAJA', 'PUNTO_VENTA', 'CONSULTORIO', 'VENTANILLA', 'SALON', 'ESTACION_PRODUCCION', 'FARMACIA', 'OFICINA']);
  });

  it('cada tipo tiene su etiqueta', () => {
    expect(Object.keys(ETIQUETAS_TIPO_UNIDAD)).toEqual([...TIPOS_UNIDAD]);
  });
});
