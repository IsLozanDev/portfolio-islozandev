import { ObtenerPersona } from '../src/application/obtener-persona.js';
import type { RegistrarPersonaComando } from '../src/application/ports/persona.port.js';
import { RegistrarPersona } from '../src/application/registrar-persona.js';
import {
  ContactoInvalidoError,
  DocumentoInvalidoPersonaError,
  PersonaDuplicadaError,
  PersonaNoEncontradaError,
  TipoDocumentoNoAdmitidoError,
  TipoPersonaIncoherenteError,
} from '../src/domain/errores.js';
import { crearDobles, TENANT_A, TENANT_B, type Dobles } from './support/dobles.js';

const JUANA: RegistrarPersonaComando = {
  tipoPersona: 'NATURAL',
  tipoDocumento: 'DNI',
  numeroDocumento: '45781236',
  nombres: 'Juana',
  apellidoPaterno: 'Quispe',
  apellidoMaterno: 'Mamani',
  celular: '987654321',
};

describe('RegistrarPersona', () => {
  let dobles: Dobles;
  let registrar: RegistrarPersona;

  beforeEach(() => {
    dobles = crearDobles();
    registrar = new RegistrarPersona(dobles);
  });

  it('TR-CA-100: crea la persona con su celular principal y publica persona.registrada', async () => {
    const detalle = await registrar.ejecutar(JUANA);

    expect(detalle).toMatchObject({
      tipoPersona: 'NATURAL',
      tipoDocumento: 'DNI',
      numeroDocumento: '45781236',
      nombres: 'Juana',
      apellidoPaterno: 'Quispe',
      apellidoMaterno: 'Mamani',
      razonSocial: null,
      activo: true,
      roles: [],
    });
    expect(detalle.contactos).toEqual([{ id: expect.any(String), tipo: 'CELULAR', valor: '987654321', principal: true }]);
    expect(dobles.personas.guardadas.map((persona) => persona.tenantId)).toEqual([TENANT_A]);
    expect(dobles.publicador.tipos()).toEqual(['persona.registrada']);
    expect(dobles.publicador.eventos[0].payload).toEqual({
      persona_id: detalle.id,
      tipo_persona: 'NATURAL',
      tipo_documento: 'DNI',
    });
    expect(dobles.unidadDeTrabajo.transacciones).toBe(1);
  });

  it('guarda el correo como principal y trata el correo en blanco como ausente', async () => {
    const conCorreo = await registrar.ejecutar({ ...JUANA, correo: ' juana@vitrina.pe ' });
    const sinCorreo = await registrar.ejecutar({ ...JUANA, numeroDocumento: '45781237', correo: '   ' });

    expect(conCorreo.contactos.map(({ tipo, valor, principal }) => ({ tipo, valor, principal }))).toEqual([
      { tipo: 'CELULAR', valor: '987654321', principal: true },
      { tipo: 'CORREO', valor: 'juana@vitrina.pe', principal: true },
    ]);
    expect(sinCorreo.contactos).toHaveLength(1);
  });

  it('no consulta TR-IDN', async () => {
    await registrar.ejecutar(JUANA);

    expect(dobles.identidad.consultas).toEqual([]);
  });

  it('TR-CA-102: registra un CE con nombres a mano', async () => {
    const detalle = await registrar.ejecutar({
      tipoPersona: 'NATURAL',
      tipoDocumento: 'CE',
      numeroDocumento: '001234567',
      nombres: 'John',
      apellidoPaterno: 'Smith',
      celular: '987654321',
    });

    expect(detalle).toMatchObject({ tipoDocumento: 'CE', apellidoMaterno: null });
  });

  it('registra una jurídica con RUC 20', async () => {
    const detalle = await registrar.ejecutar({
      tipoPersona: 'JURIDICA',
      tipoDocumento: 'RUC',
      numeroDocumento: '20100070970',
      razonSocial: 'Supermercados Peruanos S.A.',
      celular: '987654321',
    });

    expect(detalle).toMatchObject({ tipoPersona: 'JURIDICA', razonSocial: 'Supermercados Peruanos S.A.', nombres: null });
  });

  it('TR-CA-101: el mismo documento en el tenant → PersonaDuplicadaError con el id existente, sin evento', async () => {
    const existente = await registrar.ejecutar(JUANA);

    const repetir = registrar.ejecutar({ ...JUANA, nombres: 'Otra' });

    await expect(repetir).rejects.toBeInstanceOf(PersonaDuplicadaError);
    await expect(repetir).rejects.toMatchObject({ code: 'PERSONA_DUPLICADA', personaId: existente.id });
    expect(dobles.personas.guardadas).toHaveLength(1);
    expect(dobles.publicador.tipos()).toEqual(['persona.registrada']);
  });

  it('el mismo documento en otro tenant sí se registra', async () => {
    await registrar.ejecutar(JUANA);

    const enOtroTenant = await dobles.contexto.run({ tenantId: TENANT_B }, () => registrar.ejecutar(JUANA));

    expect(dobles.personas.guardadas.map((persona) => persona.tenantId)).toEqual([TENANT_A, TENANT_B]);
    expect(enOtroTenant.numeroDocumento).toBe('45781236');
  });

  it('DOC_0 está en el catálogo pero personas no lo admite', async () => {
    const registrarDoc0 = registrar.ejecutar({ ...JUANA, tipoDocumento: 'DOC_0', numeroDocumento: '1' });

    await expect(registrarDoc0).rejects.toBeInstanceOf(TipoDocumentoNoAdmitidoError);
    await expect(registrarDoc0).rejects.toMatchObject({ code: 'TIPO_DOCUMENTO_NO_ADMITIDO' });
    expect(dobles.catalogo.consultas).toEqual([]);
  });

  it('un tipo admitido que ya no está vigente en TIPO_DOC_IDENTIDAD se rechaza', async () => {
    dobles.catalogo.vigentes = ['DNI', 'RUC'];

    const registrarConCarnet = registrar.ejecutar({ ...JUANA, tipoDocumento: 'CE', numeroDocumento: '001234567' });

    await expect(registrarConCarnet).rejects.toBeInstanceOf(TipoDocumentoNoAdmitidoError);
    expect(dobles.catalogo.consultas).toEqual([['TIPO_DOC_IDENTIDAD', 'CE']]);
    expect(dobles.personas.guardadas).toEqual([]);
  });

  it('DNI 4578123A → DocumentoInvalidoPersonaError con motivo CARACTERES', async () => {
    const registrarInvalido = registrar.ejecutar({ ...JUANA, numeroDocumento: '4578123A' });

    await expect(registrarInvalido).rejects.toBeInstanceOf(DocumentoInvalidoPersonaError);
    await expect(registrarInvalido).rejects.toMatchObject({ code: 'DOCUMENTO_INVALIDO', motivo: 'CARACTERES' });
  });

  it('TR-CA-106: celular 51987654 → ContactoInvalidoError con el mensaje del criterio', async () => {
    const registrarSinCelular = registrar.ejecutar({ ...JUANA, celular: '51987654' });

    await expect(registrarSinCelular).rejects.toBeInstanceOf(ContactoInvalidoError);
    await expect(registrarSinCelular).rejects.toMatchObject({
      code: 'CONTACTO_INVALIDO',
      message: 'El celular debe tener 9 dígitos e iniciar con 9',
    });
    expect(dobles.personas.guardadas).toEqual([]);
    expect(dobles.publicador.eventos).toEqual([]);
  });

  it.each<[string, Partial<RegistrarPersonaComando>]>([
    ['JURIDICA con RUC 10', { tipoPersona: 'JURIDICA', tipoDocumento: 'RUC', numeroDocumento: '10467793549', razonSocial: 'Pedro' }],
    ['JURIDICA con DNI', { tipoPersona: 'JURIDICA', razonSocial: 'Empresa S.A.' }],
    ['NATURAL con RUC 20', { tipoDocumento: 'RUC', numeroDocumento: '20100070970' }],
  ])('%s → TipoPersonaIncoherenteError', async (_caso, cambios) => {
    const registrarIncoherente = registrar.ejecutar({ ...JUANA, ...cambios });

    await expect(registrarIncoherente).rejects.toBeInstanceOf(TipoPersonaIncoherenteError);
    await expect(registrarIncoherente).rejects.toMatchObject({ code: 'TIPO_PERSONA_INCOHERENTE' });
  });
});

describe('ObtenerPersona', () => {
  let dobles: Dobles;
  let obtener: ObtenerPersona;

  beforeEach(() => {
    dobles = crearDobles();
    obtener = new ObtenerPersona(dobles);
  });

  it('devuelve la persona con sus roles y contactos', async () => {
    const registrada = await new RegistrarPersona(dobles).ejecutar({ ...JUANA, correo: 'juana@vitrina.pe' });

    const detalle = await obtener.ejecutar(registrada.id);

    expect(detalle).toEqual(registrada);
    expect(detalle.contactos).toHaveLength(2);
  });

  it('una persona de otro tenant no existe', async () => {
    const registrada = await new RegistrarPersona(dobles).ejecutar(JUANA);

    const obtenerDesdeOtroTenant = dobles.contexto.run({ tenantId: TENANT_B }, () => obtener.ejecutar(registrada.id));

    await expect(obtenerDesdeOtroTenant).rejects.toBeInstanceOf(PersonaNoEncontradaError);
    await expect(obtenerDesdeOtroTenant).rejects.toMatchObject({ code: 'NO_ENCONTRADA' });
  });
});
