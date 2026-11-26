import type { PersonaDetalle } from '../models/persona';
import { resumenContactos, resumenDatosBasicos, resumenDirecciones, resumenRoles } from './resumenes-ficha';

const JUANA: PersonaDetalle = {
  id: 'per-juana',
  tipoPersona: 'NATURAL',
  tipoDocumento: 'DNI',
  numeroDocumento: '45781236',
  nombres: 'Juana',
  apellidoPaterno: 'Quispe',
  apellidoMaterno: 'Mamani',
  razonSocial: null,
  activo: true,
  version: 1,
  roles: [],
  contactos: [],
  direcciones: [],
  resueltaDesde: null,
  alias: [],
};

const DIRECCION = { referencia: null, ubigeo: '040103', provincia: 'AREQUIPA', departamento: 'AREQUIPA' };

describe('resumenes de la ficha', () => {
  it('datos básicos: documento y tipo de persona', () => {
    expect(resumenDatosBasicos(JUANA)).toBe('DNI 45781236 · Persona natural');
  });

  it('contactos: total y el tipo del principal', () => {
    expect(resumenContactos(JUANA)).toBe('Sin contactos');
    expect(
      resumenContactos({
        ...JUANA,
        contactos: [
          { id: 'c1', tipo: 'CORREO', valor: 'juana@correo.pe', principal: false },
          { id: 'c2', tipo: 'CELULAR', valor: '987654321', principal: true },
        ],
      }),
    ).toBe('2 contactos · principal: celular');
    expect(resumenContactos({ ...JUANA, contactos: [{ id: 'c1', tipo: 'FIJO', valor: '014452211', principal: false }] })).toBe('1 contacto');
  });

  it('direcciones: total y el distrito de la principal', () => {
    expect(resumenDirecciones(JUANA)).toBe('Sin direcciones');
    expect(
      resumenDirecciones({
        ...JUANA,
        direcciones: [
          { ...DIRECCION, id: 'd1', direccion: 'Calle Mercaderes 120', distrito: 'AREQUIPA', principal: false },
          { ...DIRECCION, id: 'd2', direccion: 'Av. Cayma 410', distrito: 'CAYMA', principal: true },
        ],
      }),
    ).toBe('2 direcciones · principal: CAYMA');
  });

  it('roles: solo los vigentes, separados por coma', () => {
    expect(resumenRoles(JUANA)).toBe('Sin roles');
    expect(
      resumenRoles({
        ...JUANA,
        roles: [
          { productoCodigo: 'CLI', rol: 'PACIENTE', desde: '2026-03-02', hasta: null },
          { productoCodigo: 'GYM', rol: 'SOCIO', desde: '2025-01-10', hasta: '2025-12-31' },
          { productoCodigo: 'REST', rol: 'CLIENTE', desde: '2026-05-01', hasta: null },
        ],
      }),
    ).toBe('CLI · Paciente, REST · Cliente');
  });
});
