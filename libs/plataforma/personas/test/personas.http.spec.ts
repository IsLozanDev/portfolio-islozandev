import type { INestApplication } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { CuotaAgotadaError, ProveedorNoDisponibleError } from '@vitrina/plataforma/identidad';
import { PERMISO } from '@vitrina/plataforma/seguridad';
import request from 'supertest';
import { PersonasController } from '../src/interface/personas.controller.js';
import { crearAppPersonas, SUCURSAL } from './support/app-http.js';
import { crearDobles, HOY_EN_LIMA, respuestaDni, TENANT_A, TENANT_B, type Dobles } from './support/dobles.js';

const LEER = 'plat.persona.leer';
const REGISTRAR = 'plat.persona.registrar';
const ROL = 'plat.persona.rol';
const DNI_JUANA = '45781236';
const JUANA = {
  tipo_persona: 'NATURAL',
  tipo_documento: 'DNI',
  numero_documento: DNI_JUANA,
  nombres: 'Juana',
  apellido_paterno: 'Quispe',
  apellido_materno: 'Mamani',
  celular: '987654321',
};

describe('HTTP /v1/personas con TR-IDN falso (TR-RF-039 y 040)', () => {
  let app: INestApplication;
  let dobles: Dobles;
  let permisosDelActor: string[];
  const http = () => request(app.getHttpServer());
  const get = (ruta: string) => http().get(ruta).set('X-Sucursal-Id', SUCURSAL);
  const post = (ruta: string, cuerpo: object) => http().post(ruta).set('X-Sucursal-Id', SUCURSAL).send(cuerpo);
  const buscar = (tipo: string, numero: string) => get(`/v1/personas/busqueda?tipo=${tipo}&numero=${numero}`);

  async function registrarJuana(): Promise<string> {
    const respuesta = await post('/v1/personas', JUANA);
    return respuesta.body.id;
  }

  beforeAll(async () => {
    dobles = crearDobles();
    app = await crearAppPersonas(dobles, () => permisosDelActor);
  });

  beforeEach(() => {
    permisosDelActor = [LEER, REGISTRAR, ROL];
    dobles.contexto.alcance = { tenantId: TENANT_A };
    dobles.personas.guardadas.length = 0;
    dobles.publicador.eventos.length = 0;
    dobles.identidad.consultas.length = 0;
    dobles.identidad.resultado = respuestaDni('Juana', 'Quispe Mamani');
    dobles.suscripciones.vigentes = ['CLI', 'GYM'];
  });

  afterAll(() => app?.close());

  describe('GET /v1/personas/busqueda', () => {
    it('TR-CA-100: DNI sin persona → prellenado, y el POST con esos datos crea la persona y publica el evento', async () => {
      const busqueda = await buscar('DNI', DNI_JUANA);

      expect([busqueda.status, busqueda.body]).toEqual([
        200,
        {
          encontrada: false,
          prellenado: { nombres: 'Juana', apellido_paterno: 'Quispe', apellido_materno: 'Mamani', razon_social: null },
        },
      ]);

      const registro = await post('/v1/personas', {
        tipo_persona: 'NATURAL',
        tipo_documento: 'DNI',
        numero_documento: DNI_JUANA,
        ...busqueda.body.prellenado,
        celular: '987654321',
      });

      expect(registro.status).toBe(201);
      expect(registro.body).toMatchObject({ nombres: 'Juana', apellido_paterno: 'Quispe', apellido_materno: 'Mamani' });
      expect(dobles.publicador.tipos()).toEqual(['persona.registrada']);
    });

    it('TR-CA-101: DNI ya registrado → la persona, sin llamar a TR-IDN', async () => {
      const personaId = await registrarJuana();

      const busqueda = await buscar('DNI', DNI_JUANA);

      expect([busqueda.status, busqueda.body]).toEqual([
        200,
        {
          encontrada: true,
          persona: {
            id: personaId,
            tipo_persona: 'NATURAL',
            tipo_documento: 'DNI',
            numero_documento: DNI_JUANA,
            nombres: 'Juana',
            apellido_paterno: 'Quispe',
            apellido_materno: 'Mamani',
            razon_social: null,
            activo: true,
          },
        },
      ]);
      expect(dobles.identidad.consultas).toEqual([]);
    });

    it('TR-CA-102: CE → prellenado nulo sin llamar a TR-IDN, y el POST con nombres a mano crea la persona', async () => {
      const busqueda = await buscar('CE', '001234567');
      const registro = await post('/v1/personas', {
        tipo_persona: 'NATURAL',
        tipo_documento: 'CE',
        numero_documento: '001234567',
        nombres: 'John',
        apellido_paterno: 'Smith',
        celular: '987654321',
      });

      expect([busqueda.status, busqueda.body]).toEqual([200, { encontrada: false, prellenado: null }]);
      expect(dobles.identidad.consultas).toEqual([]);
      expect([registro.status, registro.body.apellido_materno]).toEqual([201, null]);
    });

    it.each([
      ['proveedor caído', new ProveedorNoDisponibleError(), 'IDENTIDAD_NO_DISPONIBLE'],
      ['cuota agotada', new CuotaAgotadaError(), 'CUOTA_AGOTADA'],
    ])('%s → 200 con aviso y el registro manual sigue funcionando', async (_caso, error, aviso) => {
      dobles.identidad.resultado = error;

      const busqueda = await buscar('DNI', DNI_JUANA);
      const registro = await post('/v1/personas', JUANA);

      expect([busqueda.status, busqueda.body]).toEqual([200, { encontrada: false, prellenado: null, aviso }]);
      expect(registro.status).toBe(201);
    });

    it('con plat.persona.leer y sin plat.persona.registrar no llama a TR-IDN', async () => {
      permisosDelActor = [LEER];

      const busqueda = await buscar('DNI', DNI_JUANA);

      expect([busqueda.status, busqueda.body]).toEqual([200, { encontrada: false, prellenado: null }]);
      expect(dobles.identidad.consultas).toEqual([]);
    });

    it('422 TIPO_DOCUMENTO_NO_ADMITIDO y DOCUMENTO_INVALIDO con motivo; 400 sin parámetros', async () => {
      const noAdmitido = await buscar('DOC_0', '1');
      const invalido = await buscar('DNI', '4578123A');
      const sinNumero = await get('/v1/personas/busqueda?tipo=DNI');

      expect([noAdmitido.status, noAdmitido.body.codigo]).toEqual([422, 'TIPO_DOCUMENTO_NO_ADMITIDO']);
      expect([invalido.status, invalido.body]).toMatchObject([422, { codigo: 'DOCUMENTO_INVALIDO', motivo: 'CARACTERES' }]);
      expect([sinNumero.status, sinNumero.body]).toEqual([400, { codigo: 'SOLICITUD_INVALIDA', errores: ['numero'] }]);
    });
  });

  describe('POST /v1/personas', () => {
    it('201 con la persona y sus contactos principales', async () => {
      const respuesta = await post('/v1/personas', { ...JUANA, correo: 'juana@vitrina.pe' });

      expect(respuesta.status).toBe(201);
      expect(respuesta.body).toEqual({
        id: expect.any(String),
        tipo_persona: 'NATURAL',
        tipo_documento: 'DNI',
        numero_documento: DNI_JUANA,
        nombres: 'Juana',
        apellido_paterno: 'Quispe',
        apellido_materno: 'Mamani',
        razon_social: null,
        activo: true,
        version: 1,
        direcciones: [],
        resuelta_desde: null,
        alias: [],
        roles: [],
        contactos: [
          { id: expect.any(String), tipo: 'CELULAR', valor: '987654321', principal: true },
          { id: expect.any(String), tipo: 'CORREO', valor: 'juana@vitrina.pe', principal: true },
        ],
      });
    });

    it('TR-CA-101: el mismo documento → 409 PERSONA_DUPLICADA con su persona_id', async () => {
      const personaId = await registrarJuana();

      const repetida = await post('/v1/personas', JUANA);

      expect([repetida.status, repetida.body]).toEqual([
        409,
        { codigo: 'PERSONA_DUPLICADA', mensaje: 'Ya existe una persona con ese documento', persona_id: personaId },
      ]);
    });

    it('TR-CA-106: celular 51987654 → 422 CONTACTO_INVALIDO con el mensaje del criterio', async () => {
      const respuesta = await post('/v1/personas', { ...JUANA, celular: '51987654' });

      expect([respuesta.status, respuesta.body]).toEqual([
        422,
        { codigo: 'CONTACTO_INVALIDO', mensaje: 'El celular debe tener 9 dígitos e iniciar con 9' },
      ]);
    });

    it.each([
      ['JURIDICA con RUC 10', { tipo_persona: 'JURIDICA', tipo_documento: 'RUC', numero_documento: '10467793549', razon_social: 'Pedro' }],
      ['JURIDICA con DNI', { tipo_persona: 'JURIDICA', razon_social: 'Empresa S.A.' }],
      ['NATURAL con RUC 20', { tipo_documento: 'RUC', numero_documento: '20100070970' }],
    ])('%s → 422 TIPO_PERSONA_INCOHERENTE', async (_caso, cambios) => {
      const respuesta = await post('/v1/personas', { ...JUANA, ...cambios });

      expect([respuesta.status, respuesta.body.codigo]).toEqual([422, 'TIPO_PERSONA_INCOHERENTE']);
    });

    it('DOC_0 → 422 TIPO_DOCUMENTO_NO_ADMITIDO; DNI 4578123A → 422 DOCUMENTO_INVALIDO con motivo CARACTERES', async () => {
      const noAdmitido = await post('/v1/personas', { ...JUANA, tipo_documento: 'DOC_0', numero_documento: '1' });
      const invalido = await post('/v1/personas', { ...JUANA, numero_documento: '4578123A' });

      expect([noAdmitido.status, noAdmitido.body.codigo]).toEqual([422, 'TIPO_DOCUMENTO_NO_ADMITIDO']);
      expect([invalido.status, invalido.body]).toEqual([
        422,
        { codigo: 'DOCUMENTO_INVALIDO', mensaje: 'Documento inválido: CARACTERES', motivo: 'CARACTERES' },
      ]);
    });

    it('400 SOLICITUD_INVALIDA con los campos, sin sus valores', async () => {
      const respuesta = await post('/v1/personas', { ...JUANA, tipo_persona: 'OTRA', celular: undefined });

      expect([respuesta.status, respuesta.body]).toEqual([400, { codigo: 'SOLICITUD_INVALIDA', errores: ['tipo_persona', 'celular'] }]);
    });
  });

  describe('GET /v1/personas/{id}', () => {
    it('200 con roles y contactos', async () => {
      const personaId = await registrarJuana();
      await post(`/v1/personas/${personaId}/roles`, { producto_codigo: 'CLI', rol: 'PACIENTE' });

      const respuesta = await get(`/v1/personas/${personaId}`);

      expect(respuesta.status).toBe(200);
      expect(respuesta.body).toMatchObject({
        id: personaId,
        roles: [{ producto_codigo: 'CLI', rol: 'PACIENTE', desde: HOY_EN_LIMA, hasta: null }],
        contactos: [{ tipo: 'CELULAR', valor: '987654321', principal: true }],
      });
    });

    it('una persona de otro tenant → 404 NO_ENCONTRADA', async () => {
      const personaId = await registrarJuana();
      dobles.contexto.alcance = { tenantId: TENANT_B };

      const respuesta = await get(`/v1/personas/${personaId}`);

      expect([respuesta.status, respuesta.body]).toEqual([404, { codigo: 'NO_ENCONTRADA', mensaje: 'No existe esa persona' }]);
    });

    it('un id que no es uuid → 400', async () => {
      const respuesta = await get('/v1/personas/no-es-uuid');

      expect([respuesta.status, respuesta.body]).toEqual([400, { codigo: 'SOLICITUD_INVALIDA', errores: ['id'] }]);
    });
  });

  describe('POST /v1/personas/{id}/roles', () => {
    it('TR-CA-103: PACIENTE en CLI y SOCIO en GYM → 201 cada uno, una persona, dos roles y dos eventos', async () => {
      const personaId = await registrarJuana();
      dobles.publicador.eventos.length = 0;

      const paciente = await post(`/v1/personas/${personaId}/roles`, { producto_codigo: 'CLI', rol: 'PACIENTE' });
      const socio = await post(`/v1/personas/${personaId}/roles`, { producto_codigo: 'GYM', rol: 'SOCIO' });

      expect([paciente.status, paciente.body, socio.status, socio.body]).toEqual([201, { asignado: true }, 201, { asignado: true }]);
      expect(dobles.personas.guardadas).toHaveLength(1);
      expect((await get(`/v1/personas/${personaId}`)).body.roles).toHaveLength(2);
      expect(dobles.publicador.tipos()).toEqual(['persona.rol_asignado', 'persona.rol_asignado']);
    });

    it('un rol ya vigente → 200, sin rol nuevo ni evento', async () => {
      const personaId = await registrarJuana();
      await post(`/v1/personas/${personaId}/roles`, { producto_codigo: 'CLI', rol: 'PACIENTE' });
      dobles.publicador.eventos.length = 0;

      const repetido = await post(`/v1/personas/${personaId}/roles`, { producto_codigo: 'CLI', rol: 'PACIENTE' });

      expect([repetido.status, repetido.body]).toEqual([200, { asignado: false }]);
      expect((await get(`/v1/personas/${personaId}`)).body.roles).toHaveLength(1);
      expect(dobles.publicador.eventos).toEqual([]);
    });

    it('TR-CA-104: sin suscripción vigente de ECO → 422 PRODUCTO_NO_SUSCRITO, sin rol ni evento', async () => {
      const personaId = await registrarJuana();
      dobles.publicador.eventos.length = 0;

      const respuesta = await post(`/v1/personas/${personaId}/roles`, { producto_codigo: 'ECO', rol: 'CLIENTE' });

      expect([respuesta.status, respuesta.body]).toEqual([422, { codigo: 'PRODUCTO_NO_SUSCRITO', mensaje: 'Producto no suscrito' }]);
      expect((await get(`/v1/personas/${personaId}`)).body.roles).toEqual([]);
      expect(dobles.publicador.eventos).toEqual([]);
    });

    it('persona de otro tenant → 404; producto o rol fuera de lista → 400', async () => {
      const personaId = await registrarJuana();
      const fueraDeLista = await post(`/v1/personas/${personaId}/roles`, { producto_codigo: 'XYZ', rol: 'DUEÑO' });
      dobles.contexto.alcance = { tenantId: TENANT_B };
      const deOtroTenant = await post(`/v1/personas/${personaId}/roles`, { producto_codigo: 'CLI', rol: 'PACIENTE' });

      expect([fueraDeLista.status, fueraDeLista.body]).toEqual([400, { codigo: 'SOLICITUD_INVALIDA', errores: ['producto_codigo', 'rol'] }]);
      expect([deOtroTenant.status, deOtroTenant.body.codigo]).toEqual([404, 'NO_ENCONTRADA']);
    });
  });

  describe('permisos y OpenAPI', () => {
    it('sin el permiso de cada endpoint → 403 SIN_PERMISO', async () => {
      const personaId = await registrarJuana();
      permisosDelActor = [];

      const respuestas = [
        await buscar('DNI', DNI_JUANA),
        await post('/v1/personas', JUANA),
        await get(`/v1/personas/${personaId}`),
        await post(`/v1/personas/${personaId}/roles`, { producto_codigo: 'CLI', rol: 'PACIENTE' }),
      ];

      expect(respuestas.map((respuesta) => [respuesta.status, respuesta.body.codigo])).toEqual(Array(4).fill([403, 'SIN_PERMISO']));
    });

    it('leer no alcanza para registrar ni para asignar roles', async () => {
      const personaId = await registrarJuana();
      permisosDelActor = [LEER];

      const registro = await post('/v1/personas', { ...JUANA, numero_documento: '45781237' });
      const rol = await post(`/v1/personas/${personaId}/roles`, { producto_codigo: 'CLI', rol: 'PACIENTE' });

      expect([registro.status, rol.status, (await get(`/v1/personas/${personaId}`)).status]).toEqual([403, 403, 200]);
    });

    it('cada ruta exige su permiso', () => {
      const reflector = new Reflector();
      const permisoDe = (metodo: 'buscar' | 'registrar' | 'obtener' | 'asignarRol') =>
        reflector.get(PERMISO, PersonasController.prototype[metodo]);

      expect([permisoDe('buscar'), permisoDe('registrar'), permisoDe('obtener'), permisoDe('asignarRol')]).toEqual([
        LEER,
        REGISTRAR,
        LEER,
        ROL,
      ]);
    });

    it('las cuatro rutas están en OpenAPI bajo /v1 con sus códigos de respuesta', () => {
      const documento = SwaggerModule.createDocument(app, new DocumentBuilder().addBearerAuth().build());
      const rutas = documento.paths;
      const codigos = (ruta: string, metodo: 'get' | 'post') => Object.keys(rutas[ruta][metodo]?.responses ?? {}).sort();

      expect(Object.keys(rutas)).toEqual(
        expect.arrayContaining(['/v1/personas', '/v1/personas/busqueda', '/v1/personas/{id}', '/v1/personas/{id}/roles']),
      );
      expect(codigos('/v1/personas/busqueda', 'get')).toEqual(['200', '400', '401', '403', '422']);
      expect(codigos('/v1/personas', 'post')).toEqual(['201', '400', '401', '403', '409', '422']);
      expect(codigos('/v1/personas/{id}', 'get')).toEqual(['200', '400', '401', '403', '404']);
      expect(codigos('/v1/personas/{id}/roles', 'post')).toEqual(['200', '201', '400', '401', '403', '404', '409', '422']);
    });
  });
});
