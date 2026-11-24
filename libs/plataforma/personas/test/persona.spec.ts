import { ValidationError } from '@vitrina/plataforma/kernel';
import { Contacto } from '../src/domain/contacto.js';
import { DocumentoIdentidad } from '../src/domain/documento-identidad.js';
import { ContactoInvalidoError, TipoPersonaIncoherenteError } from '../src/domain/errores.js';
import { Persona, type DatosRegistroPersona } from '../src/domain/persona.js';

const PERSONA_ID = '31000000-0000-4000-8000-0000000000a1';
const TENANT_ID = '31000000-0000-4000-8000-00000000000a';
const HOY = '2026-11-18';
const NOMBRES_MAXIMO = 100;
const APELLIDO_MAXIMO = 60;
const RAZON_SOCIAL_MAXIMA = 200;

const celularPrincipal = () =>
  Contacto.crear({ id: '31000000-0000-4000-8000-0000000000c1', tipo: 'CELULAR', valor: '987654321', principal: true });
const correoPrincipal = () =>
  Contacto.crear({ id: '31000000-0000-4000-8000-0000000000c2', tipo: 'CORREO', valor: 'juana@vitrina.pe', principal: true });

function datosNatural(cambios: Partial<DatosRegistroPersona> = {}): DatosRegistroPersona {
  return {
    id: PERSONA_ID,
    tenantId: TENANT_ID,
    tipoPersona: 'NATURAL',
    documento: DocumentoIdentidad.crear('DNI', '45781236'),
    nombres: 'Juana',
    apellidoPaterno: 'Quispe',
    apellidoMaterno: 'Mamani',
    contactos: [celularPrincipal()],
    ...cambios,
  };
}

function datosJuridica(cambios: Partial<DatosRegistroPersona> = {}): DatosRegistroPersona {
  return {
    id: PERSONA_ID,
    tenantId: TENANT_ID,
    tipoPersona: 'JURIDICA',
    documento: DocumentoIdentidad.crear('RUC', '20100070970'),
    razonSocial: 'Supermercados Peruanos S.A.',
    contactos: [celularPrincipal()],
    ...cambios,
  };
}

describe('Persona.registrar', () => {
  it('registra una natural con DNI, celular y correo principales', () => {
    const persona = Persona.registrar(datosNatural({ contactos: [celularPrincipal(), correoPrincipal()] }));

    expect(persona).toMatchObject({
      id: PERSONA_ID,
      tenantId: TENANT_ID,
      tipoPersona: 'NATURAL',
      nombres: 'Juana',
      apellidoPaterno: 'Quispe',
      apellidoMaterno: 'Mamani',
      razonSocial: null,
      activo: true,
      version: 1,
    });
    expect(persona.documento).toMatchObject({ tipo: 'DNI', numero: '45781236' });
    expect(persona.contactos.map((contacto) => contacto.tipo)).toEqual(['CELULAR', 'CORREO']);
    expect(persona.roles).toEqual([]);
  });

  it('publica persona.registrada sin documento, nombres ni contactos', () => {
    const [evento, ...resto] = Persona.registrar(datosNatural()).pullEvents();

    expect(resto).toEqual([]);
    expect(evento).toMatchObject({
      eventType: 'persona.registrada',
      aggregateType: 'persona',
      aggregateId: PERSONA_ID,
      aggregateVersion: 1,
      schemaVersion: 1,
    });
    expect(evento.payload).toEqual({ persona_id: PERSONA_ID, tipo_persona: 'NATURAL', tipo_documento: 'DNI' });
  });

  it('recorta los textos y trata el vacío como ausente', () => {
    const persona = Persona.registrar(datosNatural({ nombres: '  Juana  ', apellidoMaterno: '   ', razonSocial: ' ' }));

    expect(persona.nombres).toBe('Juana');
    expect(persona.apellidoMaterno).toBeNull();
  });

  it.each([
    ['CE', '001234567'],
    ['PASAPORTE', 'AB123456'],
    ['RUC', '10467793549'],
  ])('admite una natural con %s %s y un solo apellido', (tipo, numero) => {
    const persona = Persona.registrar(
      datosNatural({ documento: DocumentoIdentidad.crear(tipo, numero), apellidoMaterno: undefined }),
    );

    expect(persona.apellidoMaterno).toBeNull();
  });

  it('rechaza una natural con RUC 20', () => {
    const datos = datosNatural({ documento: DocumentoIdentidad.crear('RUC', '20100070970') });

    expect(() => Persona.registrar(datos)).toThrow(TipoPersonaIncoherenteError);
  });

  it('rechaza una natural con razón social', () => {
    expect(() => Persona.registrar(datosNatural({ razonSocial: 'Juana Quispe EIRL' }))).toThrow(TipoPersonaIncoherenteError);
  });

  it.each([
    ['sin nombres', { nombres: ' ' }],
    ['sin apellido paterno', { apellidoPaterno: null }],
    ['con nombres de más de 100 caracteres', { nombres: 'a'.repeat(NOMBRES_MAXIMO + 1) }],
    ['con apellido paterno de más de 60 caracteres', { apellidoPaterno: 'a'.repeat(APELLIDO_MAXIMO + 1) }],
    ['con apellido materno de más de 60 caracteres', { apellidoMaterno: 'a'.repeat(APELLIDO_MAXIMO + 1) }],
  ])('rechaza una natural %s', (_caso, cambios) => {
    expect(() => Persona.registrar(datosNatural(cambios))).toThrow(ValidationError);
  });

  it('registra una jurídica con RUC 20 y razón social', () => {
    const persona = Persona.registrar(datosJuridica());

    expect(persona).toMatchObject({
      tipoPersona: 'JURIDICA',
      razonSocial: 'Supermercados Peruanos S.A.',
      nombres: null,
      apellidoPaterno: null,
      apellidoMaterno: null,
    });
  });

  it.each([
    ['RUC 10', DocumentoIdentidad.crear('RUC', '10467793549')],
    ['DNI', DocumentoIdentidad.crear('DNI', '20100070')],
  ])('rechaza una jurídica con %s', (_caso, documento) => {
    expect(() => Persona.registrar(datosJuridica({ documento }))).toThrow(TipoPersonaIncoherenteError);
  });

  it('rechaza una jurídica con nombres', () => {
    expect(() => Persona.registrar(datosJuridica({ nombres: 'Juana' }))).toThrow(TipoPersonaIncoherenteError);
  });

  it.each([
    ['sin razón social', { razonSocial: '  ' }],
    ['con razón social de más de 200 caracteres', { razonSocial: 'a'.repeat(RAZON_SOCIAL_MAXIMA + 1) }],
  ])('rechaza una jurídica %s', (_caso, cambios) => {
    expect(() => Persona.registrar(datosJuridica(cambios))).toThrow(ValidationError);
  });

  it('exige un celular principal', () => {
    const celularSecundario = Contacto.crear({
      id: '31000000-0000-4000-8000-0000000000c3',
      tipo: 'CELULAR',
      valor: '912345678',
      principal: false,
    });

    expect(() => Persona.registrar(datosNatural({ contactos: [] }))).toThrow(ContactoInvalidoError);
    expect(() => Persona.registrar(datosNatural({ contactos: [correoPrincipal(), celularSecundario] }))).toThrow(
      ContactoInvalidoError,
    );
  });

  it('rechaza dos principales del mismo tipo', () => {
    const datos = datosNatural({ contactos: [celularPrincipal(), celularPrincipal()] });

    expect(() => Persona.registrar(datos)).toThrow(ContactoInvalidoError);
  });
});

describe('Persona.asignarRol', () => {
  function personaRegistrada(): Persona {
    const persona = Persona.registrar(datosNatural());
    persona.pullEvents();
    return persona;
  }

  it('TR-CA-103: asigna PACIENTE en CLI y SOCIO en GYM con un evento por rol', () => {
    const persona = personaRegistrada();

    expect(persona.asignarRol('CLI', 'PACIENTE', HOY)).toBe(true);
    expect(persona.asignarRol('GYM', 'SOCIO', HOY)).toBe(true);

    expect(persona.roles).toEqual([
      { productoCodigo: 'CLI', rol: 'PACIENTE', desde: HOY, hasta: null },
      { productoCodigo: 'GYM', rol: 'SOCIO', desde: HOY, hasta: null },
    ]);
    const eventos = persona.pullEvents();
    expect(eventos.map((evento) => evento.eventType)).toEqual(['persona.rol_asignado', 'persona.rol_asignado']);
    expect(eventos.map((evento) => evento.aggregateVersion)).toEqual([2, 3]);
    expect(eventos[0].payload).toEqual({ persona_id: PERSONA_ID, producto_codigo: 'CLI', rol: 'PACIENTE', desde: HOY });
  });

  it('un rol ya vigente no se repite ni registra evento', () => {
    const persona = personaRegistrada();
    persona.asignarRol('CLI', 'PACIENTE', HOY);
    persona.pullEvents();

    expect(persona.asignarRol('CLI', 'PACIENTE', '2026-11-19')).toBe(false);

    expect(persona.roles).toHaveLength(1);
    expect(persona.pullEvents()).toEqual([]);
    expect(persona.version).toBe(2);
  });

  it('el mismo rol en otro producto y otro rol en el mismo producto sí se asignan', () => {
    const persona = personaRegistrada();
    persona.asignarRol('CLI', 'PACIENTE', HOY);

    expect(persona.asignarRol('GYM', 'PACIENTE', HOY)).toBe(true);
    expect(persona.asignarRol('CLI', 'PROVEEDOR', HOY)).toBe(true);
  });

  it('reconstituye con sus roles y no comparte la lista con quien la entregó', () => {
    const roles = [{ productoCodigo: 'CLI' as const, rol: 'PACIENTE' as const, desde: HOY, hasta: null }];
    const persona = Persona.reconstituir(PERSONA_ID, 2, {
      tenantId: TENANT_ID,
      tipoPersona: 'NATURAL',
      documento: DocumentoIdentidad.reconstituir('DNI', '45781236'),
      nombres: 'Juana',
      apellidoPaterno: 'Quispe',
      apellidoMaterno: null,
      razonSocial: null,
      activo: true,
      roles,
      contactos: [celularPrincipal()],
      direcciones: [],
      fusion: null,
    });

    expect(persona.asignarRol('CLI', 'PACIENTE', HOY)).toBe(false);
    expect(persona.asignarRol('GYM', 'SOCIO', HOY)).toBe(true);
    expect(roles).toHaveLength(1);
    expect(persona.version).toBe(3);
  });
});
