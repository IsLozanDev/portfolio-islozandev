import { Direccion, exigirFormatoDeUbigeo, type DatosDireccion } from '../src/domain/direccion.js';
import { DireccionInvalidaError } from '../src/domain/errores.js';

const ID = '32000000-0000-4000-8000-0000000000d1';
const DIRECCION_MINIMA = 5;
const DIRECCION_MAXIMA = 250;
const REFERENCIA_MAXIMA = 150;
const CAYMA = { distrito: 'CAYMA', provincia: 'AREQUIPA', departamento: 'AREQUIPA' };

function datos(cambios: Partial<DatosDireccion> = {}): DatosDireccion {
  return { id: ID, direccion: 'Av. Ejército 710', referencia: 'Frente al parque', ubigeo: '040103', ubicacion: CAYMA, principal: false, ...cambios };
}

describe('Direccion', () => {
  it('crea una dirección y recorta sus textos', () => {
    const direccion = Direccion.crear(datos({ direccion: '  Av. Ejército 710 ', referencia: ' Frente al parque  ', principal: true }));

    expect(direccion).toMatchObject({
      id: ID,
      direccion: 'Av. Ejército 710',
      referencia: 'Frente al parque',
      ubigeo: '040103',
      ubicacion: CAYMA,
      principal: true,
    });
  });

  it.each([undefined, null, '', '   '])('una referencia ausente o vacía queda nula', (referencia) => {
    expect(Direccion.crear(datos({ referencia })).referencia).toBeNull();
  });

  it('acepta los límites: dirección de 5 y de 250, referencia de 150', () => {
    expect(Direccion.crear(datos({ direccion: 'a'.repeat(DIRECCION_MINIMA) })).direccion).toHaveLength(DIRECCION_MINIMA);
    expect(Direccion.crear(datos({ direccion: 'a'.repeat(DIRECCION_MAXIMA) })).direccion).toHaveLength(DIRECCION_MAXIMA);
    expect(Direccion.crear(datos({ referencia: 'a'.repeat(REFERENCIA_MAXIMA) })).referencia).toHaveLength(REFERENCIA_MAXIMA);
  });

  it.each<[string, Partial<DatosDireccion>]>([
    ['dirección de 4 caracteres', { direccion: 'Av 1' }],
    ['dirección de 4 caracteres tras recortar', { direccion: '  Av 1  ' }],
    ['dirección de 251 caracteres', { direccion: 'a'.repeat(DIRECCION_MAXIMA + 1) }],
    ['referencia de 151 caracteres', { referencia: 'a'.repeat(REFERENCIA_MAXIMA + 1) }],
    ['ubigeo de 4 dígitos', { ubigeo: '4010' }],
    ['ubigeo con letras', { ubigeo: '04010A' }],
    ['ubigeo de 7 dígitos', { ubigeo: '0401031' }],
  ])('rechaza %s con DIRECCION_INVALIDA', (_caso, cambios) => {
    const crear = () => Direccion.crear(datos(cambios));

    expect(crear).toThrow(DireccionInvalidaError);
    expect(crear).toThrow(expect.objectContaining({ code: 'DIRECCION_INVALIDA' }));
  });

  it('el mensaje de error no lleva la dirección ni la referencia', () => {
    const crear = () => Direccion.crear(datos({ direccion: 'Av 1', referencia: 'Casa de Juana' }));

    expect(crear).toThrow(expect.objectContaining({ message: 'La dirección debe tener entre 5 y 250 caracteres' }));
  });

  it('con() cambia solo lo que llega, valida y devuelve otra dirección', () => {
    const original = Direccion.crear(datos());

    const editada = original.con({ direccion: 'Calle Mercaderes 120', referencia: null, principal: true });

    expect(editada).toMatchObject({ id: ID, direccion: 'Calle Mercaderes 120', referencia: null, ubigeo: '040103', principal: true });
    expect(original).toMatchObject({ direccion: 'Av. Ejército 710', referencia: 'Frente al parque', principal: false });
    expect(original.con({}).esIgualA(original)).toBe(true);
    expect(editada.esIgualA(original)).toBe(false);
    expect(() => original.con({ ubigeo: '4010' })).toThrow(DireccionInvalidaError);
  });

  it('esIgualA distingue un cambio de ubicación', () => {
    const original = Direccion.crear(datos());
    const enLima = original.con({ ubigeo: '150101', ubicacion: { distrito: 'LIMA', provincia: 'LIMA', departamento: 'LIMA' } });

    expect(enLima.esIgualA(original)).toBe(false);
    expect(enLima.ubicacion.distrito).toBe('LIMA');
  });

  it('reconstituye sin validar', () => {
    expect(Direccion.reconstituir(datos({ direccion: 'Av 1', referencia: undefined }))).toMatchObject({ direccion: 'Av 1', referencia: null });
  });

  it('exigirFormatoDeUbigeo acepta 6 dígitos y rechaza lo demás', () => {
    expect(() => exigirFormatoDeUbigeo('040103')).not.toThrow();
    expect(() => exigirFormatoDeUbigeo('4010')).toThrow(DireccionInvalidaError);
  });
});
