import { aCuerpoItem, aItemCatalogo, solicitudDeItem, type ItemCatalogoRespuesta, type SolicitudItem } from './item';

const DNI: ItemCatalogoRespuesta = {
  id: 'i-1',
  codigo: 'DNI',
  codigo_externo: '1',
  nombre: 'DNI',
  abreviatura: null,
  orden: 1,
  atributos: { longitud: 8, regex: '^\\d{8}$', propia: 'x' },
  vigente_desde: '2026-01-01',
  vigente_hasta: null,
  activo: true,
  version: 2,
};

describe('mapeos de ítem', () => {
  it('aItemCatalogo pasa a camelCase sin perder atributos desconocidos', () => {
    expect(aItemCatalogo(DNI)).toEqual({
      id: 'i-1',
      codigo: 'DNI',
      codigoExterno: '1',
      nombre: 'DNI',
      abreviatura: null,
      orden: 1,
      atributos: { longitud: 8, regex: '^\\d{8}$', propia: 'x' },
      vigenteDesde: '2026-01-01',
      vigenteHasta: null,
      activo: true,
      version: 2,
    });
  });

  it('aCuerpoItem omite el código si no viene y el orden si es null', () => {
    const solicitud: SolicitudItem = { ...solicitudDeItem(aItemCatalogo(DNI)), orden: null };
    expect(aCuerpoItem(solicitud)).toEqual({
      codigo_externo: '1',
      nombre: 'DNI',
      abreviatura: null,
      atributos: { longitud: 8, regex: '^\\d{8}$', propia: 'x' },
      vigente_desde: '2026-01-01',
      vigente_hasta: null,
      activo: true,
    });
    expect(aCuerpoItem({ ...solicitud, codigo: 'DNI', orden: 0 })).toMatchObject({ codigo: 'DNI', orden: 0 });
  });

  it('solicitudDeItem copia todo el contenido, sin código ni versión', () => {
    const solicitud = solicitudDeItem(aItemCatalogo(DNI));
    expect(solicitud).not.toHaveProperty('codigo');
    expect(solicitud).not.toHaveProperty('version');
    expect(solicitud).toMatchObject({ nombre: 'DNI', orden: 1, vigenteDesde: '2026-01-01', activo: true });
  });
});
