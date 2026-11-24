import type { INestApplication } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { PERMISO } from '@vitrina/plataforma/seguridad';
import request from 'supertest';
import { ContactosPersonaController } from '../src/interface/contactos.controller.js';
import { DireccionesPersonaController } from '../src/interface/direcciones.controller.js';
import { PersonasController } from '../src/interface/personas.controller.js';
import { crearAppPersonas, SUCURSAL } from './support/app-http.js';
import { crearDobles, TENANT_A, TENANT_B, UBIGEO_CAYMA, UBIGEO_LIMA, type Dobles } from './support/dobles.js';

const LEER = 'plat.persona.leer';
const REGISTRAR = 'plat.persona.registrar';
const EDITAR = 'plat.persona.editar';
const ID_AJENO = '32000000-0000-4000-8000-0000000000ff';
const VERSION_REGISTRADA = 1;
const DIRECCION_MAXIMA = 250;
const REFERENCIA_MAXIMA = 150;
const JUANA = {
  tipo_persona: 'NATURAL',
  tipo_documento: 'DNI',
  numero_documento: '45781236',
  nombres: 'Juana',
  apellido_paterno: 'Quispe',
  apellido_materno: 'Mamani',
  celular: '987654321',
};
const EMPRESA = {
  tipo_persona: 'JURIDICA',
  tipo_documento: 'RUC',
  numero_documento: '20100070970',
  razon_social: 'Supermercados Peruanos S.A.',
  celular: '987654321',
};
const EN_CAYMA = { direccion: 'Av. Ejército 710', ubigeo: UBIGEO_CAYMA };

interface ContactoLeido {
  id: string;
  tipo: string;
  valor: string;
  principal: boolean;
}

interface DireccionLeida {
  id: string;
  direccion: string;
  principal: boolean;
}

interface PersonaLeida {
  id: string;
  version: number;
  contactos: ContactoLeido[];
  direcciones: DireccionLeida[];
}

describe('HTTP /v1/personas/{id}: datos básicos, contactos y direcciones (TR-RF-041)', () => {
  let app: INestApplication;
  let dobles: Dobles;
  let permisosDelActor: string[];
  const http = () => request(app.getHttpServer());
  const get = (ruta: string) => http().get(ruta).set('X-Sucursal-Id', SUCURSAL);
  const post = (ruta: string, cuerpo: object) => http().post(ruta).set('X-Sucursal-Id', SUCURSAL).send(cuerpo);
  const patch = (ruta: string, cuerpo: object) => http().patch(ruta).set('X-Sucursal-Id', SUCURSAL).send(cuerpo);
  const borrar = (ruta: string) => http().delete(ruta).set('X-Sucursal-Id', SUCURSAL);

  const rutaPersona = (personaId: string) => `/v1/personas/${personaId}`;
  const rutaContactos = (personaId: string) => `${rutaPersona(personaId)}/contactos`;
  const rutaContacto = (personaId: string, contactoId: string) => `${rutaContactos(personaId)}/${contactoId}`;
  const rutaDirecciones = (personaId: string) => `${rutaPersona(personaId)}/direcciones`;
  const rutaDireccion = (personaId: string, direccionId: string) => `${rutaDirecciones(personaId)}/${direccionId}`;

  /** Registra y descarta el evento del registro: lo que sigue son solo los de la edición. */
  async function registrar(datos: object = JUANA): Promise<PersonaLeida> {
    const respuesta = await post('/v1/personas', datos);
    dobles.publicador.eventos.length = 0;
    return respuesta.body;
  }

  const leer = async (personaId: string): Promise<PersonaLeida> => (await get(rutaPersona(personaId))).body;
  const payloads = () => dobles.publicador.eventos.map((evento) => [evento.eventType, evento.payload]);
  const actualizada = (personaId: string, cambio: string) => ['persona.actualizada', { persona_id: personaId, cambio }];
  const principalesDe = (persona: PersonaLeida, tipo: string) =>
    persona.contactos.filter((contacto) => contacto.tipo === tipo && contacto.principal).map((contacto) => contacto.valor);

  beforeAll(async () => {
    dobles = crearDobles();
    app = await crearAppPersonas(dobles, () => permisosDelActor);
  });

  beforeEach(() => {
    permisosDelActor = [LEER, REGISTRAR, EDITAR];
    dobles.contexto.alcance = { tenantId: TENANT_A };
    dobles.personas.guardadas.length = 0;
    dobles.publicador.eventos.length = 0;
    dobles.catalogo.consultas.length = 0;
    dobles.catalogo.ubigeosCerrados = [];
  });

  afterAll(() => app?.close());

  describe('direcciones', () => {
    it('TR-CA-105: dirección principal con ubigeo 040103 → 201 con CAYMA, AREQUIPA, AREQUIPA, y el GET la devuelve igual', async () => {
      const juana = await registrar();

      const respuesta = await post(rutaDirecciones(juana.id), { ...EN_CAYMA, principal: true });

      const esperada = {
        id: expect.any(String),
        direccion: 'Av. Ejército 710',
        referencia: null,
        ubigeo: '040103',
        distrito: 'CAYMA',
        provincia: 'AREQUIPA',
        departamento: 'AREQUIPA',
        principal: true,
      };
      expect(respuesta.status).toBe(201);
      expect(respuesta.body).toMatchObject({ id: juana.id, version: VERSION_REGISTRADA + 1, direcciones: [esperada] });
      expect((await leer(juana.id)).direcciones).toEqual(respuesta.body.direcciones);
      expect(payloads()).toEqual([actualizada(juana.id, 'DIRECCION')]);
    });

    it('la primera dirección sin principal queda no principal; una segunda principal desmarca la anterior con un solo evento', async () => {
      const juana = await registrar();

      const primera = await post(rutaDirecciones(juana.id), EN_CAYMA);
      await post(rutaDirecciones(juana.id), { direccion: 'Calle Mercaderes 120', ubigeo: UBIGEO_CAYMA, principal: true });
      dobles.publicador.eventos.length = 0;
      const tercera = await post(rutaDirecciones(juana.id), { direccion: 'Jr. de la Unión 300', ubigeo: UBIGEO_LIMA, principal: true });

      expect(primera.body.direcciones).toMatchObject([{ direccion: 'Av. Ejército 710', principal: false }]);
      expect(tercera.body.direcciones.map((direccion: DireccionLeida) => [direccion.direccion, direccion.principal])).toEqual([
        ['Av. Ejército 710', false],
        ['Calle Mercaderes 120', false],
        ['Jr. de la Unión 300', true],
      ]);
      expect(payloads()).toEqual([actualizada(juana.id, 'DIRECCION')]);
    });

    it('editar a principal desmarca la anterior; cambiar el ubigeo vuelve a copiar distrito, provincia y departamento', async () => {
      const juana = await registrar();
      await post(rutaDirecciones(juana.id), { ...EN_CAYMA, principal: true });
      const conDos = await post(rutaDirecciones(juana.id), { direccion: 'Calle Mercaderes 120', ubigeo: UBIGEO_CAYMA });
      const [, segunda] = conDos.body.direcciones;
      dobles.publicador.eventos.length = 0;

      const respuesta = await patch(rutaDireccion(juana.id, segunda.id), {
        version: conDos.body.version,
        ubigeo: UBIGEO_LIMA,
        referencia: 'Segundo piso',
        principal: true,
      });

      expect(respuesta.status).toBe(200);
      expect(respuesta.body.version).toBe(conDos.body.version + 1);
      expect(respuesta.body.direcciones).toMatchObject([
        { direccion: 'Av. Ejército 710', principal: false },
        {
          id: segunda.id,
          direccion: 'Calle Mercaderes 120',
          referencia: 'Segundo piso',
          ubigeo: UBIGEO_LIMA,
          distrito: 'LIMA',
          provincia: 'LIMA',
          departamento: 'LIMA',
          principal: true,
        },
      ]);
      expect(payloads()).toEqual([actualizada(juana.id, 'DIRECCION')]);
    });

    it('el ubigeo solo se valida si cambia: una dirección de un distrito con vigencia cerrada sigue editando su texto', async () => {
      const juana = await registrar();
      const creada = await post(rutaDirecciones(juana.id), EN_CAYMA);
      const [direccion] = creada.body.direcciones;
      dobles.catalogo.ubigeosCerrados = [UBIGEO_CAYMA];
      dobles.catalogo.consultas.length = 0;

      const respuesta = await patch(rutaDireccion(juana.id, direccion.id), {
        version: creada.body.version,
        direccion: 'Av. Ejército 712',
        ubigeo: UBIGEO_CAYMA,
      });

      expect([respuesta.status, respuesta.body.direcciones[0]]).toMatchObject([200, { direccion: 'Av. Ejército 712', distrito: 'CAYMA' }]);
      expect(dobles.catalogo.consultas).toEqual([]);
    });

    it('ubigeo 999999 o con vigencia cerrada → 422 UBIGEO_NO_VIGENTE; ubigeo 4010 → 422 DIRECCION_INVALIDA; sin fila ni evento', async () => {
      const juana = await registrar();
      dobles.catalogo.ubigeosCerrados = [UBIGEO_LIMA];

      const inexistente = await post(rutaDirecciones(juana.id), { ...EN_CAYMA, ubigeo: '999999' });
      const cerrado = await post(rutaDirecciones(juana.id), { ...EN_CAYMA, ubigeo: UBIGEO_LIMA });
      const malFormado = await post(rutaDirecciones(juana.id), { ...EN_CAYMA, ubigeo: '4010' });

      const noVigente = { codigo: 'UBIGEO_NO_VIGENTE', mensaje: 'El ubigeo no existe o no está vigente' };
      expect([inexistente.status, inexistente.body]).toEqual([422, noVigente]);
      expect([cerrado.status, cerrado.body]).toEqual([422, noVigente]);
      expect([malFormado.status, malFormado.body]).toEqual([422, { codigo: 'DIRECCION_INVALIDA', mensaje: 'El ubigeo debe tener 6 dígitos' }]);
      expect(await leer(juana.id)).toMatchObject({ version: VERSION_REGISTRADA, direcciones: [] });
      expect(payloads()).toEqual([]);
    });

    it.each([
      ['dirección de 4 caracteres', { direccion: 'Av 1' }],
      ['dirección de 251 caracteres', { direccion: 'a'.repeat(DIRECCION_MAXIMA + 1) }],
      ['referencia de 151 caracteres', { referencia: 'a'.repeat(REFERENCIA_MAXIMA + 1) }],
    ])('%s → 422 DIRECCION_INVALIDA al agregar y al editar', async (_caso, cambios) => {
      const juana = await registrar();
      const creada = await post(rutaDirecciones(juana.id), EN_CAYMA);
      const [direccion] = creada.body.direcciones;

      const alAgregar = await post(rutaDirecciones(juana.id), { ...EN_CAYMA, ...cambios });
      const alEditar = await patch(rutaDireccion(juana.id, direccion.id), { version: creada.body.version, ...cambios });

      expect([alAgregar.status, alAgregar.body.codigo]).toEqual([422, 'DIRECCION_INVALIDA']);
      expect([alEditar.status, alEditar.body.codigo]).toEqual([422, 'DIRECCION_INVALIDA']);
      expect((await leer(juana.id)).direcciones).toHaveLength(1);
    });

    it('DELETE borra la dirección, también la principal, y responde 204 con su evento', async () => {
      const juana = await registrar();
      const creada = await post(rutaDirecciones(juana.id), { ...EN_CAYMA, principal: true });
      const [direccion] = creada.body.direcciones;
      dobles.publicador.eventos.length = 0;

      const respuesta = await borrar(`${rutaDireccion(juana.id, direccion.id)}?version=${creada.body.version}`);

      expect([respuesta.status, respuesta.body]).toEqual([204, {}]);
      expect(await leer(juana.id)).toMatchObject({ version: creada.body.version + 1, direcciones: [] });
      expect(payloads()).toEqual([actualizada(juana.id, 'DIRECCION')]);
    });
  });

  describe('contactos', () => {
    it('TR-CA-106: CELULAR 51987654 al agregar o al editar → 422 CONTACTO_INVALIDO con el mensaje del criterio, sin fila ni evento', async () => {
      const juana = await registrar();
      const [celular] = juana.contactos;

      const alAgregar = await post(rutaContactos(juana.id), { tipo: 'CELULAR', valor: '51987654' });
      const alEditar = await patch(rutaContacto(juana.id, celular.id), { version: juana.version, valor: '51987654' });

      const invalido = { codigo: 'CONTACTO_INVALIDO', mensaje: 'El celular debe tener 9 dígitos e iniciar con 9' };
      expect([alAgregar.status, alAgregar.body]).toEqual([422, invalido]);
      expect([alEditar.status, alEditar.body]).toEqual([422, invalido]);
      expect(await leer(juana.id)).toMatchObject({ version: VERSION_REGISTRADA, contactos: [{ valor: '987654321' }] });
      expect(payloads()).toEqual([]);
    });

    it('el primer FIJO, CORREO o WHATSAPP sin principal queda no principal', async () => {
      const juana = await registrar();

      await post(rutaContactos(juana.id), { tipo: 'FIJO', valor: '054234567' });
      await post(rutaContactos(juana.id), { tipo: 'CORREO', valor: 'juana@vitrina.pe' });
      const respuesta = await post(rutaContactos(juana.id), { tipo: 'WHATSAPP', valor: '+51987654321' });

      expect(respuesta.status).toBe(201);
      expect(respuesta.body.contactos.map((contacto: ContactoLeido) => [contacto.tipo, contacto.principal])).toEqual([
        ['CELULAR', true],
        ['FIJO', false],
        ['CORREO', false],
        ['WHATSAPP', false],
      ]);
    });

    it('un segundo principal del mismo tipo, al agregar o al editar, desmarca el anterior con un solo evento', async () => {
      const juana = await registrar();

      const alAgregar = await post(rutaContactos(juana.id), { tipo: 'CELULAR', valor: '912345678', principal: true });
      const eventosAlAgregar = payloads();
      dobles.publicador.eventos.length = 0;
      const [original] = alAgregar.body.contactos;
      const alEditar = await patch(rutaContacto(juana.id, original.id), { version: alAgregar.body.version, principal: true });

      expect([alAgregar.status, principalesDe(alAgregar.body, 'CELULAR')]).toEqual([201, ['912345678']]);
      expect(eventosAlAgregar).toEqual([actualizada(juana.id, 'CONTACTO')]);
      expect([alEditar.status, principalesDe(alEditar.body, 'CELULAR')]).toEqual([200, ['987654321']]);
      expect(payloads()).toEqual([actualizada(juana.id, 'CONTACTO')]);
    });

    it('el único celular principal no se borra ni se desmarca; tras marcar otro, el anterior se puede borrar', async () => {
      const juana = await registrar();
      const [celular] = juana.contactos;

      const alBorrar = await borrar(`${rutaContacto(juana.id, celular.id)}?version=${juana.version}`);
      const alDesmarcar = await patch(rutaContacto(juana.id, celular.id), { version: juana.version, principal: false });
      const conOtro = await post(rutaContactos(juana.id), { tipo: 'CELULAR', valor: '912345678', principal: true });
      const borrado = await borrar(`${rutaContacto(juana.id, celular.id)}?version=${conOtro.body.version}`);

      const obligatorio = { codigo: 'CELULAR_PRINCIPAL_OBLIGATORIO', mensaje: 'La persona debe conservar un celular principal' };
      expect([alBorrar.status, alBorrar.body]).toEqual([422, obligatorio]);
      expect([alDesmarcar.status, alDesmarcar.body]).toEqual([422, obligatorio]);
      expect(borrado.status).toBe(204);
      expect((await leer(juana.id)).contactos).toMatchObject([{ tipo: 'CELULAR', valor: '912345678', principal: true }]);
    });

    it.each([
      ['WHATSAPP', '+51987654321'],
      ['WHATSAPP', '+14155552671'],
      ['FIJO', '054234567'],
    ])('acepta %s %s', async (tipo, valor) => {
      const juana = await registrar();

      const respuesta = await post(rutaContactos(juana.id), { tipo, valor });

      expect([respuesta.status, respuesta.body.contactos[1]]).toMatchObject([201, { tipo, valor, principal: false }]);
    });

    it.each([
      ['WHATSAPP', '987654321', 'El WhatsApp debe ir en formato internacional: + y de 8 a 15 dígitos'],
      ['WHATSAPP', '+0123456789', 'El WhatsApp debe ir en formato internacional: + y de 8 a 15 dígitos'],
      ['WHATSAPP', '+51 987 654 321', 'El WhatsApp debe ir en formato internacional: + y de 8 a 15 dígitos'],
      ['FIJO', '12345', 'El teléfono fijo debe tener de 6 a 9 dígitos'],
      ['FIJO', '054-234567', 'El teléfono fijo debe tener de 6 a 9 dígitos'],
      ['CORREO', 'juana@', 'El correo no tiene un formato válido'],
    ])('%s %s → 422 CONTACTO_INVALIDO con su mensaje', async (tipo, valor, mensaje) => {
      const juana = await registrar();

      const respuesta = await post(rutaContactos(juana.id), { tipo, valor });

      expect([respuesta.status, respuesta.body]).toEqual([422, { codigo: 'CONTACTO_INVALIDO', mensaje }]);
      expect(payloads()).toEqual([]);
    });

    it('mismo tipo y valor → 409 CONTACTO_DUPLICADO, al agregar y al editar', async () => {
      const juana = await registrar();

      const repetido = await post(rutaContactos(juana.id), { tipo: 'CELULAR', valor: '987654321' });
      const whatsapp = await post(rutaContactos(juana.id), { tipo: 'WHATSAPP', valor: '+51912345678' });
      const otroCelular = await post(rutaContactos(juana.id), { tipo: 'CELULAR', valor: '912345678' });
      const [, , segundoCelular] = otroCelular.body.contactos;
      const editadoAlRepetido = await patch(rutaContacto(juana.id, segundoCelular.id), {
        version: otroCelular.body.version,
        valor: '987654321',
      });

      const duplicado = { codigo: 'CONTACTO_DUPLICADO', mensaje: 'La persona ya tiene ese contacto' };
      expect([repetido.status, repetido.body]).toEqual([409, duplicado]);
      expect([whatsapp.status, otroCelular.status]).toEqual([201, 201]);
      expect([editadoAlRepetido.status, editadoAlRepetido.body]).toEqual([409, duplicado]);
      expect((await leer(juana.id)).contactos).toHaveLength(3);
    });

    it('el mismo valor en otro tipo sí entra: 987654321 como CELULAR y como FIJO', async () => {
      const juana = await registrar();

      const respuesta = await post(rutaContactos(juana.id), { tipo: 'FIJO', valor: '987654321' });

      expect(respuesta.status).toBe(201);
      expect(respuesta.body.contactos.map((contacto: ContactoLeido) => [contacto.tipo, contacto.valor])).toEqual([
        ['CELULAR', '987654321'],
        ['FIJO', '987654321'],
      ]);
    });

    it('DELETE borra el contacto y responde 204 con su evento', async () => {
      const juana = await registrar();
      const conCorreo = await post(rutaContactos(juana.id), { tipo: 'CORREO', valor: 'juana@vitrina.pe', principal: true });
      const [, correo] = conCorreo.body.contactos;
      dobles.publicador.eventos.length = 0;

      const respuesta = await borrar(`${rutaContacto(juana.id, correo.id)}?version=${conCorreo.body.version}`);

      expect([respuesta.status, respuesta.body]).toEqual([204, {}]);
      expect(await leer(juana.id)).toMatchObject({ version: conCorreo.body.version + 1, contactos: [{ tipo: 'CELULAR' }] });
      expect((await leer(juana.id)).contactos).toHaveLength(1);
      expect(payloads()).toEqual([actualizada(juana.id, 'CONTACTO')]);
    });
  });

  describe('PATCH /v1/personas/{id}', () => {
    it('cambia nombres y apellidos de una NATURAL; apellido_materno nulo lo borra; el documento y el tipo no cambian', async () => {
      const juana = await registrar();

      const respuesta = await patch(rutaPersona(juana.id), {
        version: juana.version,
        nombres: 'Juana María',
        apellido_paterno: 'Quispe',
        apellido_materno: null,
      });

      expect(respuesta.status).toBe(200);
      expect(respuesta.body).toMatchObject({
        id: juana.id,
        version: VERSION_REGISTRADA + 1,
        tipo_persona: 'NATURAL',
        tipo_documento: 'DNI',
        numero_documento: '45781236',
        nombres: 'Juana María',
        apellido_paterno: 'Quispe',
        apellido_materno: null,
        razon_social: null,
      });
      expect(payloads()).toEqual([actualizada(juana.id, 'DATOS_BASICOS')]);
    });

    it('cambia la razón social de una JURIDICA', async () => {
      const empresa = await registrar(EMPRESA);

      const respuesta = await patch(rutaPersona(empresa.id), { version: empresa.version, razon_social: 'Supermercados Peruanos S.A.C.' });

      expect([respuesta.status, respuesta.body]).toMatchObject([
        200,
        { tipo_persona: 'JURIDICA', numero_documento: '20100070970', razon_social: 'Supermercados Peruanos S.A.C.', nombres: null },
      ]);
    });

    it.each(['tipo_persona', 'tipo_documento', 'numero_documento'])('enviar %s → 400 SOLICITUD_INVALIDA, sin cambios', async (campo) => {
      const juana = await registrar();

      const respuesta = await patch(rutaPersona(juana.id), { version: juana.version, nombres: 'Otra', [campo]: 'RUC' });

      expect([respuesta.status, respuesta.body.codigo]).toEqual([400, 'SOLICITUD_INVALIDA']);
      expect(JSON.stringify(respuesta.body)).not.toContain('Otra');
      expect(await leer(juana.id)).toMatchObject({ version: VERSION_REGISTRADA, nombres: 'Juana' });
    });

    it('razón social en una NATURAL o nombres en una JURIDICA → 422 TIPO_PERSONA_INCOHERENTE; nombres vacío → 422', async () => {
      const juana = await registrar();
      const empresa = await registrar(EMPRESA);

      const naturalConRazonSocial = await patch(rutaPersona(juana.id), { version: juana.version, razon_social: 'Juana EIRL' });
      const juridicaConNombres = await patch(rutaPersona(empresa.id), { version: empresa.version, nombres: 'Juana' });
      const sinNombres = await patch(rutaPersona(juana.id), { version: juana.version, nombres: '' });

      expect([naturalConRazonSocial.status, naturalConRazonSocial.body.codigo]).toEqual([422, 'TIPO_PERSONA_INCOHERENTE']);
      expect([juridicaConNombres.status, juridicaConNombres.body.codigo]).toEqual([422, 'TIPO_PERSONA_INCOHERENTE']);
      expect([sinNombres.status, sinNombres.body]).toEqual([
        422,
        { codigo: 'validation_error', mensaje: 'El campo nombres es obligatorio' },
      ]);
      expect(payloads()).toEqual([]);
    });
  });

  describe('versión y cambios', () => {
    it('editar o borrar con una versión distinta de la actual → 409 VERSION_OBSOLETA, sin cambios ni evento', async () => {
      const juana = await registrar();
      const conDireccion = await post(rutaDirecciones(juana.id), EN_CAYMA);
      const conCorreo = await post(rutaContactos(juana.id), { tipo: 'CORREO', valor: 'juana@vitrina.pe' });
      const [direccion] = conDireccion.body.direcciones;
      const [, correo] = conCorreo.body.contactos;
      const vieja = juana.version;
      dobles.publicador.eventos.length = 0;

      const respuestas = [
        await patch(rutaPersona(juana.id), { version: vieja, nombres: 'Otra' }),
        await patch(rutaContacto(juana.id, correo.id), { version: vieja, principal: true }),
        await borrar(`${rutaContacto(juana.id, correo.id)}?version=${vieja}`),
        await patch(rutaDireccion(juana.id, direccion.id), { version: vieja, principal: true }),
        await borrar(`${rutaDireccion(juana.id, direccion.id)}?version=${vieja}`),
      ];

      const obsoleta = { codigo: 'VERSION_OBSOLETA', mensaje: 'La persona cambió desde que se leyó; vuelva a cargarla' };
      expect(respuestas.map((respuesta) => [respuesta.status, respuesta.body])).toEqual(Array(respuestas.length).fill([409, obsoleta]));
      expect(await leer(juana.id)).toMatchObject({
        version: conCorreo.body.version,
        nombres: 'Juana',
        contactos: [{ principal: true }, { tipo: 'CORREO', principal: false }],
        direcciones: [{ principal: false }],
      });
      expect(payloads()).toEqual([]);
    });

    it('editar o borrar sin versión → 400 con el campo', async () => {
      const juana = await registrar();
      const [celular] = juana.contactos;

      const respuestas = [
        await patch(rutaPersona(juana.id), { nombres: 'Otra' }),
        await patch(rutaContacto(juana.id, celular.id), { valor: '912345678' }),
        await borrar(rutaContacto(juana.id, celular.id)),
        await patch(rutaDireccion(juana.id, ID_AJENO), { principal: true }),
        await borrar(rutaDireccion(juana.id, ID_AJENO)),
      ];

      const sinVersion = { codigo: 'SOLICITUD_INVALIDA', errores: ['version'] };
      expect(respuestas.map((respuesta) => [respuesta.status, respuesta.body])).toEqual(Array(respuestas.length).fill([400, sinVersion]));
    });

    it('agregar no pide versión', async () => {
      const juana = await registrar();

      const contacto = await post(rutaContactos(juana.id), { tipo: 'FIJO', valor: '054234567' });
      const direccion = await post(rutaDirecciones(juana.id), EN_CAYMA);

      expect([contacto.status, direccion.status, direccion.body.version]).toEqual([201, 201, VERSION_REGISTRADA + 2]);
    });

    it('una edición que no cambia nada → 200 con la misma versión, sin evento', async () => {
      const juana = await registrar();
      const conDireccion = await post(rutaDirecciones(juana.id), EN_CAYMA);
      const [direccion] = conDireccion.body.direcciones;
      const [celular] = juana.contactos;
      const version = conDireccion.body.version;
      dobles.publicador.eventos.length = 0;

      const respuestas = [
        await patch(rutaPersona(juana.id), { version, nombres: 'Juana', apellido_materno: 'Mamani' }),
        await patch(rutaPersona(juana.id), { version }),
        await patch(rutaContacto(juana.id, celular.id), { version, valor: '987654321', principal: true }),
        await patch(rutaDireccion(juana.id, direccion.id), { version, direccion: 'Av. Ejército 710', ubigeo: UBIGEO_CAYMA }),
      ];

      expect(respuestas.map((respuesta) => [respuesta.status, respuesta.body.version])).toEqual(Array(respuestas.length).fill([200, version]));
      expect(payloads()).toEqual([]);
    });

    it('cada cambio publica un persona.actualizada con su cambio, sin datos personales en el payload', async () => {
      const juana = await registrar();

      await patch(rutaPersona(juana.id), { version: VERSION_REGISTRADA, nombres: 'Juana María' });
      await post(rutaContactos(juana.id), { tipo: 'CORREO', valor: 'juana@vitrina.pe' });
      await post(rutaDirecciones(juana.id), { ...EN_CAYMA, referencia: 'Frente al parque' });

      expect(payloads()).toEqual([
        actualizada(juana.id, 'DATOS_BASICOS'),
        actualizada(juana.id, 'CONTACTO'),
        actualizada(juana.id, 'DIRECCION'),
      ]);
      const enTexto = JSON.stringify(dobles.publicador.eventos.map((evento) => evento.payload));
      for (const dato of ['Juana', 'juana@vitrina.pe', 'Ejército', 'parque', UBIGEO_CAYMA, 'CAYMA']) expect(enTexto).not.toContain(dato);
      expect(dobles.publicador.eventos.map((evento) => evento.aggregateVersion)).toEqual([2, 3, 4]);
    });
  });

  describe('aislamiento, permisos y OpenAPI', () => {
    /** Las siete operaciones de edición sobre una persona, un contacto y una dirección dados. */
    const sieteEndpoints = (personaId: string, contactoId: string, direccionId: string) => [
      () => patch(rutaPersona(personaId), { version: 1, nombres: 'Otra' }),
      () => post(rutaContactos(personaId), { tipo: 'FIJO', valor: '054234567' }),
      () => patch(rutaContacto(personaId, contactoId), { version: 1, principal: true }),
      () => borrar(`${rutaContacto(personaId, contactoId)}?version=1`),
      () => post(rutaDirecciones(personaId), EN_CAYMA),
      () => patch(rutaDireccion(personaId, direccionId), { version: 1, principal: true }),
      () => borrar(`${rutaDireccion(personaId, direccionId)}?version=1`),
    ];

    async function llamar(endpoints: (() => request.Test)[]): Promise<[number, string][]> {
      const respuestas: [number, string][] = [];
      for (const endpoint of endpoints) {
        const respuesta = await endpoint();
        respuestas.push([respuesta.status, respuesta.body.codigo]);
      }
      return respuestas;
    }

    it('persona de otro tenant en los siete endpoints → 404 NO_ENCONTRADA, sin cambios ni evento', async () => {
      const juana = await registrar();
      const [celular] = juana.contactos;
      dobles.contexto.alcance = { tenantId: TENANT_B };

      const respuestas = await llamar(sieteEndpoints(juana.id, celular.id, ID_AJENO));

      expect(respuestas).toEqual(Array(7).fill([404, 'NO_ENCONTRADA']));
      dobles.contexto.alcance = { tenantId: TENANT_A };
      expect(await leer(juana.id)).toMatchObject({ version: VERSION_REGISTRADA, nombres: 'Juana', direcciones: [] });
      expect(payloads()).toEqual([]);
    });

    it('contactoId o direccionId de otra persona → 404, sin tocar a ninguna de las dos', async () => {
      const juana = await registrar();
      const pedro = await registrar({ ...JUANA, numero_documento: '45781237', nombres: 'Pedro', celular: '912345678' });
      const conDireccion = await post(rutaDirecciones(pedro.id), EN_CAYMA);
      const [celularDePedro] = pedro.contactos;
      const [direccionDePedro] = conDireccion.body.direcciones;
      dobles.publicador.eventos.length = 0;

      const respuestas = await llamar([
        () => patch(rutaContacto(juana.id, celularDePedro.id), { version: juana.version, principal: false }),
        () => borrar(`${rutaContacto(juana.id, celularDePedro.id)}?version=${juana.version}`),
        () => patch(rutaDireccion(juana.id, direccionDePedro.id), { version: juana.version, principal: true }),
        () => borrar(`${rutaDireccion(juana.id, direccionDePedro.id)}?version=${juana.version}`),
      ]);

      expect(respuestas).toEqual([
        [404, 'CONTACTO_NO_ENCONTRADO'],
        [404, 'CONTACTO_NO_ENCONTRADO'],
        [404, 'DIRECCION_NO_ENCONTRADA'],
        [404, 'DIRECCION_NO_ENCONTRADA'],
      ]);
      expect((await leer(pedro.id)).direcciones).toHaveLength(1);
      expect(payloads()).toEqual([]);
    });

    it('sin plat.persona.editar → 403 en los siete endpoints; leer y registrar no alcanzan', async () => {
      const juana = await registrar();
      const [celular] = juana.contactos;
      permisosDelActor = [LEER, REGISTRAR];

      const respuestas = await llamar(sieteEndpoints(juana.id, celular.id, ID_AJENO));

      expect(respuestas).toEqual(Array(7).fill([403, 'SIN_PERMISO']));
      expect((await get(rutaPersona(juana.id))).status).toBe(200);
    });

    it('cada ruta de edición exige plat.persona.editar', () => {
      const reflector = new Reflector();
      const metodos = [
        PersonasController.prototype.actualizar,
        ContactosPersonaController.prototype.agregar,
        ContactosPersonaController.prototype.editar,
        ContactosPersonaController.prototype.eliminar,
        DireccionesPersonaController.prototype.agregar,
        DireccionesPersonaController.prototype.editar,
        DireccionesPersonaController.prototype.eliminar,
      ];

      expect(metodos.map((metodo) => reflector.get(PERMISO, metodo))).toEqual(Array(7).fill(EDITAR));
    });

    it('los 400 listan campos, nunca valores', async () => {
      const juana = await registrar();

      const contacto = await post(rutaContactos(juana.id), { tipo: 'TELEGRAM', valor: 987654321 });
      const direccion = await post(rutaDirecciones(juana.id), { direccion: 'Av. Ejército 710', principal: 'sí' });
      const idInvalido = await patch(rutaContacto(juana.id, 'no-es-uuid'), { version: 1 });

      expect([contacto.status, contacto.body]).toEqual([400, { codigo: 'SOLICITUD_INVALIDA', errores: ['tipo', 'valor'] }]);
      expect([direccion.status, direccion.body]).toEqual([400, { codigo: 'SOLICITUD_INVALIDA', errores: ['ubigeo', 'principal'] }]);
      expect([idInvalido.status, idInvalido.body]).toEqual([400, { codigo: 'SOLICITUD_INVALIDA', errores: ['contactoId'] }]);
    });

    it('las siete rutas están en OpenAPI bajo /v1 con sus códigos de respuesta, y el detalle trae version y direcciones', () => {
      const documento = SwaggerModule.createDocument(app, new DocumentBuilder().addBearerAuth().build());
      const rutas = documento.paths;
      const codigos = (ruta: string, metodo: 'post' | 'patch' | 'delete') => Object.keys(rutas[ruta][metodo]?.responses ?? {}).sort();
      const detalle = documento.components?.schemas?.['PersonaDetalleDto'] as { properties: object };

      expect(Object.keys(rutas).sort()).toEqual([
        '/v1/consentimientos/textos',
        '/v1/personas',
        '/v1/personas/busqueda',
        '/v1/personas/duplicados',
        '/v1/personas/duplicados/descartes',
        '/v1/personas/duplicados/descartes/{a}/{b}',
        '/v1/personas/duplicados/{a}/{b}',
        '/v1/personas/fusiones',
        '/v1/personas/productos-suscritos',
        '/v1/personas/{id}',
        '/v1/personas/{id}/consentimientos',
        '/v1/personas/{id}/consentimientos/{finalidad}/revocar',
        '/v1/personas/{id}/contactos',
        '/v1/personas/{id}/contactos/{contactoId}',
        '/v1/personas/{id}/direcciones',
        '/v1/personas/{id}/direcciones/{direccionId}',
        '/v1/personas/{id}/roles',
      ]);
      expect(codigos('/v1/personas/{id}', 'patch')).toEqual(['200', '400', '401', '403', '404', '409', '422']);
      expect(codigos('/v1/personas/{id}/contactos', 'post')).toEqual(['201', '400', '401', '403', '404', '409', '422']);
      expect(codigos('/v1/personas/{id}/contactos/{contactoId}', 'patch')).toEqual(['200', '400', '401', '403', '404', '409', '422']);
      expect(codigos('/v1/personas/{id}/contactos/{contactoId}', 'delete')).toEqual(['204', '400', '401', '403', '404', '409', '422']);
      expect(codigos('/v1/personas/{id}/direcciones', 'post')).toEqual(['201', '400', '401', '403', '404', '409', '422']);
      expect(codigos('/v1/personas/{id}/direcciones/{direccionId}', 'patch')).toEqual(['200', '400', '401', '403', '404', '409', '422']);
      expect(codigos('/v1/personas/{id}/direcciones/{direccionId}', 'delete')).toEqual(['204', '400', '401', '403', '404', '409']);
      expect(Object.keys(detalle.properties)).toEqual(expect.arrayContaining(['version', 'direcciones']));
    });
  });
});
