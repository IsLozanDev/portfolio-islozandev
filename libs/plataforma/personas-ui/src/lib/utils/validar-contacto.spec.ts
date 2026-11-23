import { formatoCelular, formatoContacto } from './formato-contacto';
import { validarContacto } from './validar-contacto';

describe('validarContacto (copias de shared/util)', () => {
  it('TR-CA-106: celular de 9 dígitos que empieza con 9', () => {
    expect(validarContacto('CELULAR', '987654321')).toBe(true);
    expect(validarContacto('CELULAR', '51987654')).toBe(false);
    expect(validarContacto('CELULAR', '887654321')).toBe(false);
  });

  it('correo, fijo y WhatsApp con las reglas del spec 32', () => {
    expect(validarContacto('CORREO', 'juana@correo.pe')).toBe(true);
    expect(validarContacto('CORREO', 'juana@')).toBe(false);
    expect(validarContacto('FIJO', '054234567')).toBe(true);
    expect(validarContacto('FIJO', '054-234567')).toBe(false);
    expect(validarContacto('WHATSAPP', '+51987654321')).toBe(true);
    expect(validarContacto('WHATSAPP', '987654321')).toBe(false);
    expect(validarContacto('WHATSAPP', '+0123456789')).toBe(false);
  });
});

describe('formatoContacto', () => {
  it('celular en grupos de tres; el resto, igual', () => {
    expect(formatoCelular('987654321')).toBe('987 654 321');
    expect(formatoContacto('CELULAR', '987654321')).toBe('987 654 321');
    expect(formatoContacto('WHATSAPP', '+51987654321')).toBe('+51987654321');
  });
});
