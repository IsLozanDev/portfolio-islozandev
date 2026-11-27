import { FormControl } from '@angular/forms';
import { aE164, digitosNacionales, esTelefonoPeru, formatoMientrasEscribe, formatoTelefono, telefonoPeru } from './telefono-peru';

describe('telefono-peru (mismas reglas que Telefono de ORG)', () => {
  it.each([
    ['987 654 321', '+51987654321'],
    ['(01) 555-0101', '+5115550101'],
    ['054 123456', '+5154123456'],
    ['+51 987654321', '+51987654321'],
    ['+51 987-654-321', '+51987654321'],
    ['+51 (01) 555-0101', '+5115550101'],
    ['15550101', '+5115550101'],
  ])('aE164(«%s») es %s', (texto, e164) => {
    expect(aE164(texto)).toBe(e164);
  });

  it.each(['98765432', '0987654321', '12ab', '98765', '', '0'])('aE164(«%s») es null: no está completo o no es peruano', (texto) => {
    expect(aE164(texto)).toBeNull();
  });

  it.each([
    ['9', '9'],
    ['987', '987'],
    ['9876', '987 6'],
    ['987654321', '987 654 321'],
    ['9876543210', '987 654 321'],
    ['0', '0'],
    ['01', '01'],
    ['015', '(01) 5'],
    ['0155501', '(01) 555-01'],
    ['015550101', '(01) 555-0101'],
    ['054', '054'],
    ['0541', '(054) 1'],
    ['054123456', '(054) 123-456'],
    ['15550101', '(01) 555-0101'],
    ['+51 987-654-321', '987 654 321'],
    ['12ab3', '(01) 23'],
  ])('mientras escribe «%s» se ve «%s»', (texto, visto) => {
    expect(formatoMientrasEscribe(texto)).toBe(visto);
  });

  it('el 51 sin + solo es código de país si sigue un número completo', () => {
    expect(digitosNacionales('5198765')).toBe('05198765');
    expect(digitosNacionales('51987654321')).toBe('987654321');
  });

  it.each([
    ['+51987654321', '987 654 321'],
    ['+5115550101', '(01) 555-0101'],
    ['+5154123456', '(054) 123-456'],
    ['anexo 12', 'anexo 12'],
  ])('formatoTelefono(%s) es «%s»', (e164, texto) => {
    expect(formatoTelefono(e164)).toBe(texto);
  });

  it('esTelefonoPeru solo acepta E.164 peruano', () => {
    expect(esTelefonoPeru('+51987654321')).toBe(true);
    expect(esTelefonoPeru('987654321')).toBe(false);
    expect(esTelefonoPeru('+5198765432')).toBe(false);
  });

  it('el validador deja pasar vacío y E.164, y marca lo demás con telefonoPeru', () => {
    expect(telefonoPeru(new FormControl<string | null>(null))).toBeNull();
    expect(telefonoPeru(new FormControl('+5115550101'))).toBeNull();
    expect(telefonoPeru(new FormControl('98765'))).toEqual({ telefonoPeru: true });
    expect(telefonoPeru(new FormControl('anexo 12'))).toEqual({ telefonoPeru: true });
  });
});
