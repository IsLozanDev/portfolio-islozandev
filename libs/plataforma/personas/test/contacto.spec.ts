import { Contacto, type TipoContacto } from '../src/domain/contacto.js';
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

  it.each<[TipoContacto, string]>([
    ['FIJO', '054234567'],
    ['FIJO', '014567890'],
    ['WHATSAPP', '+51987654321'],
    ['WHATSAPP', '+14155552671'],
  ])('acepta %s %s', (tipo, valor) => {
    expect(Contacto.crear({ id: ID, tipo, valor, principal: false }).valor).toBe(valor);
  });

  it.each<[TipoContacto, string, string]>([
    ['FIJO', '12345', 'El teléfono fijo debe tener de 6 a 9 dígitos'],
    ['FIJO', '054-234567', 'El teléfono fijo debe tener de 6 a 9 dígitos'],
    ['WHATSAPP', '987654321', 'El WhatsApp debe ir en formato internacional: + y de 8 a 15 dígitos'],
    ['WHATSAPP', '+0123456789', 'El WhatsApp debe ir en formato internacional: + y de 8 a 15 dígitos'],
    ['WHATSAPP', '+51 987 654 321', 'El WhatsApp debe ir en formato internacional: + y de 8 a 15 dígitos'],
    ['CORREO', 'juana@', 'El correo no tiene un formato válido'],
  ])('rechaza %s %s con el mensaje de su formato', (tipo, valor, mensaje) => {
    const crear = () => Contacto.crear({ id: ID, tipo, valor, principal: false });

    expect(crear).toThrow(expect.objectContaining({ code: 'CONTACTO_INVALIDO', message: mensaje }));
  });

  it('conValor valida y devuelve otro contacto del mismo tipo; conPrincipal solo cambia el principal', () => {
    const celular = Contacto.crear({ id: ID, tipo: 'CELULAR', valor: '987654321', principal: true });

    expect(celular.conValor(' 912345678 ')).toMatchObject({ id: ID, tipo: 'CELULAR', valor: '912345678', principal: true });
    expect(celular.conPrincipal(false)).toMatchObject({ id: ID, tipo: 'CELULAR', valor: '987654321', principal: false });
    expect(celular).toMatchObject({ valor: '987654321', principal: true });
    expect(() => celular.conValor('51987654')).toThrow(ContactoInvalidoError);
  });

  it('esMismoContacto compara tipo y valor, sin normalizar', () => {
    const celular = Contacto.crear({ id: ID, tipo: 'CELULAR', valor: '987654321', principal: true });
    const otroCorreo = (valor: string) => Contacto.crear({ id: ID, tipo: 'CORREO', valor, principal: false });

    expect(celular.esMismoContacto(celular.conPrincipal(false))).toBe(true);
    expect(celular.esMismoContacto(celular.conValor('912345678'))).toBe(false);
    expect(otroCorreo('juana@vitrina.pe').esMismoContacto(otroCorreo('Juana@vitrina.pe'))).toBe(false);
  });

  it('reconstituye sin validar', () => {
    const contacto = Contacto.reconstituir({ id: ID, tipo: 'CELULAR', valor: '51987654', principal: false });

    expect(contacto.valor).toBe('51987654');
  });
});
