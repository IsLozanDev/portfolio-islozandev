import { Contacto } from '../src/domain/contacto.js';
import { ContactoInvalidoError } from '../src/domain/errores.js';

const ID = '31000000-0000-4000-8000-0000000000c1';
const LONGITUD_MAXIMA = 254;

describe('Contacto', () => {
  it('crea un celular principal y recorta el valor', () => {
    const contacto = Contacto.crear({ id: ID, tipo: 'CELULAR', valor: ' 987654321 ', principal: true });

    expect(contacto).toMatchObject({ id: ID, tipo: 'CELULAR', valor: '987654321', principal: true });
  });

  it('TR-CA-106: rechaza el celular 51987654 con el mensaje del criterio', () => {
    const crear = () => Contacto.crear({ id: ID, tipo: 'CELULAR', valor: '51987654', principal: true });

    expect(crear).toThrow(ContactoInvalidoError);
    expect(crear).toThrow(
      expect.objectContaining({ code: 'CONTACTO_INVALIDO', message: 'El celular debe tener 9 dígitos e iniciar con 9' }),
    );
  });

  it('crea un correo válido y rechaza uno sin dominio', () => {
    expect(Contacto.crear({ id: ID, tipo: 'CORREO', valor: 'juana@vitrina.pe', principal: true }).valor).toBe('juana@vitrina.pe');
    expect(() => Contacto.crear({ id: ID, tipo: 'CORREO', valor: 'juana@vitrina', principal: true })).toThrow(
      ContactoInvalidoError,
    );
  });

  it.each(['', '   ', '9'.repeat(LONGITUD_MAXIMA + 1)])('rechaza un valor vacío o demasiado largo', (valor) => {
    expect(() => Contacto.crear({ id: ID, tipo: 'FIJO', valor, principal: false })).toThrow(ContactoInvalidoError);
  });

  it('acepta un fijo sin regla de formato', () => {
    expect(Contacto.crear({ id: ID, tipo: 'FIJO', valor: '014567890', principal: false }).valor).toBe('014567890');
  });

  it('reconstituye sin validar', () => {
    const contacto = Contacto.reconstituir({ id: ID, tipo: 'CELULAR', valor: '51987654', principal: false });

    expect(contacto.valor).toBe('51987654');
  });
});
