import { aCuerpoCambiosProveedor, aProveedor } from './proveedor';

describe('mapeos de proveedor', () => {
  it('mapea el proveedor de la API a camelCase', () => {
    const respuesta = { codigo: 'DECOLECTA', tipos_doc: ['DNI', 'RUC'], prioridad: 1, ttl_dias: 30, timeout_ms: 3000, activo: true, version: 2 };

    expect(aProveedor(respuesta)).toEqual({
      codigo: 'DECOLECTA',
      tiposDoc: ['DNI', 'RUC'],
      prioridad: 1,
      ttlDias: 30,
      timeoutMs: 3000,
      activo: true,
      version: 2,
    });
  });

  it('el body del PATCH lleva solo los campos presentes y la versión', () => {
    expect(aCuerpoCambiosProveedor({ prioridad: 3, version: 2 })).toEqual({ prioridad: 3, version: 2 });
  });

  it('el body del PATCH pasa los campos a snake_case, incluido activo en falso', () => {
    expect(aCuerpoCambiosProveedor({ ttlDias: 60, timeoutMs: 5000, activo: false, version: 4 })).toEqual({
      ttl_dias: 60,
      timeout_ms: 5000,
      activo: false,
      version: 4,
    });
  });
});
