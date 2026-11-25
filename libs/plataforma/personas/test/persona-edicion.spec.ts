import { ValidationError } from '@vitrina/plataforma/kernel';
import { Contacto, type TipoContacto } from '../src/domain/contacto.js';
import { Direccion } from '../src/domain/direccion.js';
import { DocumentoIdentidad } from '../src/domain/documento-identidad.js';
import {
  CelularPrincipalObligatorioError,
  ContactoDuplicadoError,
  ContactoInvalidoError,
  ContactoNoEncontradoError,
  DireccionInvalidaError,
  DireccionNoEncontradaError,
  TipoPersonaIncoherenteError,
} from '../src/domain/errores.js';
import { Persona } from '../src/domain/persona.js';

const PERSONA_ID = '32000000-0000-4000-8000-0000000000a1';
const TENANT_ID = '32000000-0000-4000-8000-00000000000a';
const CELULAR_ID = '32000000-0000-4000-8000-0000000000c1';
const OTRO_ID = '32000000-0000-4000-8000-0000000000ff';
const VERSION_REGISTRADA = 1;
const CAYMA = { distrito: 'CAYMA', provincia: 'AREQUIPA', departamento: 'AREQUIPA' };
const LIMA = { distrito: 'LIMA', provincia: 'LIMA', departamento: 'LIMA' };

let siguienteId = 0;
const idNuevo = () => `32000000-0000-4000-8000-${String((siguienteId += 1)).padStart(12, '0')}`;

const contacto = (tipo: TipoContacto, valor: string, principal = false) => Contacto.crear({ id: idNuevo(), tipo, valor, principal });
const direccion = (texto: string, principal = false) =>
  Direccion.crear({ id: idNuevo(), direccion: texto, ubigeo: '040103', ubicacion: CAYMA, principal });

/** Registrada y con los eventos del registro ya entregados: lo que sigue son solo los de la edición. */
function juana(): Persona {
  const persona = Persona.registrar({
    id: PERSONA_ID,
    tenantId: TENANT_ID,
    tipoPersona: 'NATURAL',
    documento: DocumentoIdentidad.crear('DNI', '45781236'),
    nombres: 'Juana',
    apellidoPaterno: 'Quispe',
    apellidoMaterno: 'Mamani',
    contactos: [Contacto.crear({ id: CELULAR_ID, tipo: 'CELULAR', valor: '987654321', principal: true })],
  });
  persona.pullEvents();
  return persona;
}

function empresa(): Persona {
  const persona = Persona.registrar({
    id: PERSONA_ID,
    tenantId: TENANT_ID,
    tipoPersona: 'JURIDICA',
    documento: DocumentoIdentidad.crear('RUC', '20100070970'),
    razonSocial: 'Supermercados Peruanos S.A.',
    contactos: [Contacto.crear({ id: CELULAR_ID, tipo: 'CELULAR', valor: '987654321', principal: true })],
  });
  persona.pullEvents();
  return persona;
}

const principalesDe = (persona: Persona, tipo: TipoContacto) =>
  persona.contactos.filter((otro) => otro.tipo === tipo && otro.principal).map((otro) => otro.valor);

/** Un solo `persona.actualizada` con ese cambio, sin nada más en el payload. */
function esperarUnaActualizacion(persona: Persona, cambio: string): void {
  const eventos = persona.pullEvents();
  expect(eventos).toHaveLength(1);
  expect(eventos[0]).toMatchObject({
    eventType: 'persona.actualizada',
    aggregateType: 'persona',
    aggregateId: PERSONA_ID,
    schemaVersion: 1,
    payload: { persona_id: PERSONA_ID, cambio },
  });
  expect(Object.keys(eventos[0].payload as object).sort()).toEqual(['cambio', 'persona_id']);
}

function esperarSinCambios(persona: Persona, version: number): void {
  expect(persona.pullEvents()).toEqual([]);
  expect(persona.version).toBe(version);
}

describe('Persona.cambiarDatosBasicos', () => {
  it('cambia nombres y apellidos de una natural, recortados, y publica DATOS_BASICOS', () => {
    const persona = juana();

    expect(persona.cambiarDatosBasicos({ nombres: ' Juana María ', apellidoPaterno: 'Quispe' })).toBe(true);

    expect(persona).toMatchObject({ nombres: 'Juana María', apellidoPaterno: 'Quispe', apellidoMaterno: 'Mamani', razonSocial: null });
    expect(persona.version).toBe(VERSION_REGISTRADA + 1);
    esperarUnaActualizacion(persona, 'DATOS_BASICOS');
  });

  it('apellidoMaterno nulo lo borra; ausente no lo toca', () => {
    const persona = juana();

    persona.cambiarDatosBasicos({ nombres: 'Juana María' });
    expect(persona.apellidoMaterno).toBe('Mamani');
    persona.cambiarDatosBasicos({ apellidoMaterno: null });

    expect(persona.apellidoMaterno).toBeNull();
  });

  it('cambia la razón social de una jurídica', () => {
    const persona = empresa();

    expect(persona.cambiarDatosBasicos({ razonSocial: 'Supermercados Peruanos S.A.C.' })).toBe(true);

    expect(persona.razonSocial).toBe('Supermercados Peruanos S.A.C.');
    esperarUnaActualizacion(persona, 'DATOS_BASICOS');
  });

  it.each([{}, { nombres: 'Juana' }, { nombres: ' Juana ', apellidoMaterno: 'Mamani' }, { nombres: undefined }])(
    'sin cambios devuelve false y no publica (%j)',
    (cambios) => {
      const persona = juana();

      expect(persona.cambiarDatosBasicos(cambios)).toBe(false);
      esperarSinCambios(persona, VERSION_REGISTRADA);
    },
  );

  it('razón social en una natural o nombres en una jurídica → TipoPersonaIncoherenteError, sin cambios', () => {
    const natural = juana();
    const juridica = empresa();

    expect(() => natural.cambiarDatosBasicos({ razonSocial: 'Juana EIRL' })).toThrow(TipoPersonaIncoherenteError);
    expect(() => juridica.cambiarDatosBasicos({ nombres: 'Juana' })).toThrow(TipoPersonaIncoherenteError);
    expect(natural.razonSocial).toBeNull();
    esperarSinCambios(natural, VERSION_REGISTRADA);
    esperarSinCambios(juridica, VERSION_REGISTRADA);
  });

  it.each([
    ['nombres vacío', { nombres: '   ' }],
    ['nombres nulo', { nombres: null }],
    ['apellido paterno vacío', { apellidoPaterno: '' }],
    ['nombres de 101 caracteres', { nombres: 'a'.repeat(101) }],
  ])('%s en una natural → ValidationError, sin cambios', (_caso, cambios) => {
    const persona = juana();

    expect(() => persona.cambiarDatosBasicos(cambios)).toThrow(ValidationError);
    expect(persona.nombres).toBe('Juana');
    esperarSinCambios(persona, VERSION_REGISTRADA);
  });

  it('razón social vacía en una jurídica → ValidationError', () => {
    expect(() => empresa().cambiarDatosBasicos({ razonSocial: ' ' })).toThrow(ValidationError);
  });
});

describe('Persona: contactos', () => {
  it('el primer FIJO, CORREO o WHATSAPP sin principal queda no principal', () => {
    const persona = juana();

    persona.agregarContacto(contacto('FIJO', '054234567'));
    persona.agregarContacto(contacto('CORREO', 'juana@vitrina.pe'));
    persona.agregarContacto(contacto('WHATSAPP', '+51987654321'));

    expect(persona.contactos.map((otro) => [otro.tipo, otro.principal])).toEqual([
      ['CELULAR', true],
      ['FIJO', false],
      ['CORREO', false],
      ['WHATSAPP', false],
    ]);
    expect(persona.pullEvents()).toHaveLength(3);
  });

  it('un segundo principal del mismo tipo desmarca el anterior con un solo evento', () => {
    const persona = juana();

    expect(persona.agregarContacto(contacto('CELULAR', '912345678', true))).toBe(true);

    expect(principalesDe(persona, 'CELULAR')).toEqual(['912345678']);
    expect(persona.contactos).toHaveLength(2);
    esperarUnaActualizacion(persona, 'CONTACTO');
  });

  it('un principal de otro tipo no desmarca al celular principal', () => {
    const persona = juana();

    persona.agregarContacto(contacto('CORREO', 'juana@vitrina.pe', true));

    expect(principalesDe(persona, 'CELULAR')).toEqual(['987654321']);
    expect(principalesDe(persona, 'CORREO')).toEqual(['juana@vitrina.pe']);
  });

  it('mismo tipo y valor → ContactoDuplicadoError; el mismo valor en otro tipo sí entra', () => {
    const persona = juana();
    persona.agregarContacto(contacto('WHATSAPP', '+51987654321'));
    persona.pullEvents();

    expect(() => persona.agregarContacto(contacto('WHATSAPP', '+51987654321'))).toThrow(ContactoDuplicadoError);
    expect(() => persona.agregarContacto(contacto('CELULAR', '987654321'))).toThrow(
      expect.objectContaining({ code: 'CONTACTO_DUPLICADO', message: 'La persona ya tiene ese contacto' }),
    );
    expect(persona.contactos).toHaveLength(2);
    esperarSinCambios(persona, VERSION_REGISTRADA + 1);
  });

  it('editar el valor valida el formato del tipo y conserva tipo y principal', () => {
    const persona = juana();

    expect(persona.editarContacto(CELULAR_ID, { valor: '912345678' })).toBe(true);

    expect(persona.contactos[0]).toMatchObject({ id: CELULAR_ID, tipo: 'CELULAR', valor: '912345678', principal: true });
    esperarUnaActualizacion(persona, 'CONTACTO');
    expect(() => persona.editarContacto(CELULAR_ID, { valor: '51987654' })).toThrow(
      expect.objectContaining({ code: 'CONTACTO_INVALIDO', message: 'El celular debe tener 9 dígitos e iniciar con 9' }),
    );
    expect(() => persona.editarContacto(CELULAR_ID, { valor: '51987654' })).toThrow(ContactoInvalidoError);
    expect(persona.contactos[0].valor).toBe('912345678');
  });

  it('editar a principal desmarca el anterior de su tipo y conserva el orden', () => {
    const persona = juana();
    const segundo = contacto('CELULAR', '912345678');
    persona.agregarContacto(segundo);
    persona.pullEvents();

    expect(persona.editarContacto(segundo.id, { principal: true })).toBe(true);

    expect(persona.contactos.map((otro) => [otro.valor, otro.principal])).toEqual([
      ['987654321', false],
      ['912345678', true],
    ]);
    esperarUnaActualizacion(persona, 'CONTACTO');
  });

  it.each([{}, { valor: '987654321' }, { valor: ' 987654321 ', principal: true }])('editar sin cambios devuelve false y no publica (%j)', (cambios) => {
    const persona = juana();

    expect(persona.editarContacto(CELULAR_ID, cambios)).toBe(false);
    esperarSinCambios(persona, VERSION_REGISTRADA);
  });

  it('editar al valor de otro contacto del mismo tipo → ContactoDuplicadoError', () => {
    const persona = juana();
    const segundo = contacto('CELULAR', '912345678');
    persona.agregarContacto(segundo);

    expect(() => persona.editarContacto(segundo.id, { valor: '987654321' })).toThrow(ContactoDuplicadoError);
    expect(persona.contactos[1].valor).toBe('912345678');
  });

  it('el celular principal no se desmarca ni se borra', () => {
    const persona = juana();

    expect(() => persona.editarContacto(CELULAR_ID, { principal: false })).toThrow(CelularPrincipalObligatorioError);
    expect(() => persona.eliminarContacto(CELULAR_ID)).toThrow(
      expect.objectContaining({ code: 'CELULAR_PRINCIPAL_OBLIGATORIO', message: 'La persona debe conservar un celular principal' }),
    );
    expect(principalesDe(persona, 'CELULAR')).toEqual(['987654321']);
    esperarSinCambios(persona, VERSION_REGISTRADA);
  });

  it('tras marcar otro celular como principal, el anterior se puede borrar', () => {
    const persona = juana();
    persona.agregarContacto(contacto('CELULAR', '912345678', true));
    persona.pullEvents();

    expect(persona.eliminarContacto(CELULAR_ID)).toBe(true);

    expect(persona.contactos.map((otro) => otro.valor)).toEqual(['912345678']);
    esperarUnaActualizacion(persona, 'CONTACTO');
  });

  it('el principal de otro tipo se puede desmarcar y borrar', () => {
    const persona = juana();
    const correo = contacto('CORREO', 'juana@vitrina.pe', true);
    persona.agregarContacto(correo);

    expect(persona.editarContacto(correo.id, { principal: false })).toBe(true);
    expect(persona.eliminarContacto(correo.id)).toBe(true);
    expect(persona.contactos).toHaveLength(1);
  });

  it('un id que no es de la persona → ContactoNoEncontradoError', () => {
    const persona = juana();

    expect(() => persona.editarContacto(OTRO_ID, { principal: true })).toThrow(ContactoNoEncontradoError);
    expect(() => persona.eliminarContacto(OTRO_ID)).toThrow(expect.objectContaining({ code: 'CONTACTO_NO_ENCONTRADO' }));
  });
});

describe('Persona: direcciones', () => {
  it('la primera dirección sin principal queda no principal y publica DIRECCION', () => {
    const persona = juana();

    expect(persona.agregarDireccion(direccion('Av. Ejército 710'))).toBe(true);

    expect(persona.direcciones.map((otra) => [otra.direccion, otra.principal])).toEqual([['Av. Ejército 710', false]]);
    esperarUnaActualizacion(persona, 'DIRECCION');
  });

  it('una segunda dirección principal desmarca la anterior con un solo evento', () => {
    const persona = juana();
    persona.agregarDireccion(direccion('Av. Ejército 710', true));
    persona.pullEvents();

    persona.agregarDireccion(direccion('Calle Mercaderes 120', true));

    expect(persona.direcciones.map((otra) => [otra.direccion, otra.principal])).toEqual([
      ['Av. Ejército 710', false],
      ['Calle Mercaderes 120', true],
    ]);
    esperarUnaActualizacion(persona, 'DIRECCION');
  });

  it('editar cambia texto, referencia, ubigeo con su ubicación y principal', () => {
    const persona = juana();
    const primera = direccion('Av. Ejército 710', true);
    const segunda = direccion('Calle Mercaderes 120');
    persona.agregarDireccion(primera);
    persona.agregarDireccion(segunda);
    persona.pullEvents();

    expect(persona.editarDireccion(segunda.id, { referencia: 'Segundo piso', ubigeo: '150101', ubicacion: LIMA, principal: true })).toBe(true);

    expect(persona.direcciones[0]).toMatchObject({ id: primera.id, principal: false });
    expect(persona.direcciones[1]).toMatchObject({
      id: segunda.id,
      direccion: 'Calle Mercaderes 120',
      referencia: 'Segundo piso',
      ubigeo: '150101',
      ubicacion: LIMA,
      principal: true,
    });
    esperarUnaActualizacion(persona, 'DIRECCION');
  });

  it('editar sin cambios devuelve false y no publica; un texto inválido falla sin cambios', () => {
    const persona = juana();
    const unica = direccion('Av. Ejército 710');
    persona.agregarDireccion(unica);
    persona.pullEvents();

    expect(persona.editarDireccion(unica.id, {})).toBe(false);
    expect(persona.editarDireccion(unica.id, { direccion: ' Av. Ejército 710 ', principal: false })).toBe(false);
    expect(() => persona.editarDireccion(unica.id, { direccion: 'Av 1' })).toThrow(DireccionInvalidaError);
    esperarSinCambios(persona, VERSION_REGISTRADA + 1);
  });

  it('la dirección principal se puede desmarcar y borrar', () => {
    const persona = juana();
    const principal = direccion('Av. Ejército 710', true);
    persona.agregarDireccion(principal);
    persona.pullEvents();

    expect(persona.editarDireccion(principal.id, { principal: false })).toBe(true);
    expect(persona.eliminarDireccion(principal.id)).toBe(true);

    expect(persona.direcciones).toEqual([]);
    expect(persona.pullEvents().map((evento) => evento.payload)).toEqual([
      { persona_id: PERSONA_ID, cambio: 'DIRECCION' },
      { persona_id: PERSONA_ID, cambio: 'DIRECCION' },
    ]);
  });

  it('un id que no es de la persona → DireccionNoEncontradaError', () => {
    const persona = juana();

    expect(() => persona.editarDireccion(OTRO_ID, { principal: true })).toThrow(DireccionNoEncontradaError);
    expect(() => persona.eliminarDireccion(OTRO_ID)).toThrow(expect.objectContaining({ code: 'DIRECCION_NO_ENCONTRADA' }));
  });

  it('reconstituir no comparte las listas con quien las entregó', () => {
    const direcciones = [direccion('Av. Ejército 710')];
    const contactos = [Contacto.crear({ id: CELULAR_ID, tipo: 'CELULAR', valor: '987654321', principal: true })];
    const persona = Persona.reconstituir(PERSONA_ID, 4, {
      tenantId: TENANT_ID,
      tipoPersona: 'NATURAL',
      documento: DocumentoIdentidad.reconstituir('DNI', '45781236'),
      nombres: 'Juana',
      apellidoPaterno: 'Quispe',
      apellidoMaterno: null,
      razonSocial: null,
      activo: true,
      roles: [],
      contactos,
      direcciones,
      fusion: null,
    });

    persona.agregarDireccion(direccion('Calle Mercaderes 120'));
    persona.agregarContacto(contacto('FIJO', '054234567'));

    expect([direcciones, contactos].map((lista) => lista.length)).toEqual([1, 1]);
    expect(persona.version).toBe(6);
  });
});
