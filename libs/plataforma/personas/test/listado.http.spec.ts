import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import request from 'supertest';
import type { PersonaListada } from '../src/application/ports/consulta-personas.js';
import { crearAppPersonas, SUCURSAL } from './support/app-http.js';
import { crearDobles, type Dobles } from './support/dobles.js';

const LEER = 'plat.persona.leer';
const ROL = 'plat.persona.rol';

const JUANA: PersonaListada = {
  id: '38000000-0000-4000-8000-0000000000a1',
  tipoPersona: 'NATURAL',
  tipoDocumento: 'DNI',
  numeroDocumento: '45781236',
  nombres: 'Juana',
  apellidoPaterno: 'Quispe',
  apellidoMaterno: 'Mamani',
  razonSocial: null,
  celularPrincipal: '987654321',
  correoPrincipal: null,
  roles: [{ productoCodigo: 'CLI', rol: 'PACIENTE' }],
  coincidencia: 'NOMBRE',
};

describe('HTTP GET /v1/personas y /v1/personas/productos-suscritos (spec 38)', () => {
  let app: INestApplication;
  let dobles: Dobles;
  let permisosDelActor: string[];
  const listar = (consulta: string) => request(app.getHttpServer()).get(`/v1/personas${consulta}`).set('X-Sucursal-Id', SUCURSAL);

  beforeAll(async () => {
    dobles = crearDobles();
    app = await crearAppPersonas(dobles, () => permisosDelActor);
  });

  beforeEach(() => {
    permisosDelActor = [LEER];
    dobles.consultaPersonas.criterios.length = 0;
    dobles.consultaPersonas.pagina = { items: [JUANA], total: 1 };
  });

  afterAll(() => app?.close());

  it('devuelve la página con denominación, contactos principales, roles y coincidencia', async () => {
    const respuesta = await listar('?q=quispe%20juana');

    expect([respuesta.status, respuesta.body]).toEqual([
      200,
      {
        items: [
          {
            id: JUANA.id,
            tipo_persona: 'NATURAL',
            tipo_documento: 'DNI',
            numero_documento: '45781236',
            denominacion: 'Quispe Mamani, Juana',
            celular_principal: '987654321',
            correo_principal: null,
            roles: [{ producto_codigo: 'CLI', rol: 'PACIENTE' }],
            coincidencia: 'NOMBRE',
          },
        ],
        total: 1,
        pagina: 1,
        tamano: 20,
      },
    ]);
    expect(dobles.consultaPersonas.criterios[0]?.consulta).toEqual({ clase: 'TEXTO', valor: 'quispe juana', palabras: ['quispe', 'juana'] });
  });

  it('pasa filtros, página y tamaño', async () => {
    const respuesta = await listar('?tipo_persona=NATURAL&producto=CLI&rol=PACIENTE&pagina=2&tamano=50');

    expect(respuesta.status).toBe(200);
    expect(dobles.consultaPersonas.criterios).toEqual([
      { consulta: null, tipoPersona: 'NATURAL', producto: 'CLI', rol: 'PACIENTE', pagina: 2, tamano: 50 },
    ]);
  });

  it('CONSULTA_MUY_CORTA → 422 sin el texto en la respuesta', async () => {
    for (const consulta of ['?q=ju', '?q=123']) {
      const respuesta = await listar(consulta);
      expect([respuesta.status, respuesta.body]).toEqual([422, { codigo: 'CONSULTA_MUY_CORTA', mensaje: 'Escriba al menos 3 letras o 4 dígitos' }]);
    }
    expect(dobles.consultaPersonas.criterios).toEqual([]);
  });

  it('tamaño, página o filtros fuera de lista → 400 con los campos, no los valores', async () => {
    for (const [consulta, campo] of [
      ['?tamano=51', 'tamano'],
      ['?pagina=0', 'pagina'],
      ['?producto=XYZ', 'producto'],
      ['?rol=JEFE', 'rol'],
      ['?tipo_persona=OTRA', 'tipo_persona'],
    ]) {
      const respuesta = await listar(consulta);
      expect([respuesta.status, respuesta.body]).toEqual([400, { codigo: 'SOLICITUD_INVALIDA', errores: [campo] }]);
    }
  });

  it('sin plat.persona.leer → 403', async () => {
    permisosDelActor = [];
    const respuesta = await listar('?q=quispe');
    expect(respuesta.status).toBe(403);
  });

  describe('GET /v1/personas/productos-suscritos', () => {
    const productos = () => request(app.getHttpServer()).get('/v1/personas/productos-suscritos').set('X-Sucursal-Id', SUCURSAL);

    it('TR-CA-104: devuelve solo los productos vigentes del tenant; ECO no está', async () => {
      permisosDelActor = [ROL];
      dobles.suscripciones.vigentes = ['CLI', 'GYM'];
      const respuesta = await productos();
      expect([respuesta.status, respuesta.body]).toEqual([200, [{ producto_codigo: 'CLI' }, { producto_codigo: 'GYM' }]]);
    });

    it('no la captura la ruta /{id}', async () => {
      permisosDelActor = [ROL, LEER];
      const respuesta = await productos();
      expect(respuesta.status).toBe(200);
      expect(Array.isArray(respuesta.body)).toBe(true);
    });

    it('sin plat.persona.rol → 403, aunque tenga plat.persona.leer', async () => {
      permisosDelActor = [LEER];
      expect((await productos()).status).toBe(403);
    });
  });

  it('está en OpenAPI bajo /v1 con sus respuestas', () => {
    const documento = SwaggerModule.createDocument(app, new DocumentBuilder().addBearerAuth().build());
    expect(Object.keys(documento.paths['/v1/personas']?.get?.responses ?? {}).sort()).toEqual(['200', '400', '401', '403', '422']);
    expect(Object.keys(documento.paths['/v1/personas/productos-suscritos']?.get?.responses ?? {}).sort()).toEqual(['200', '400', '401', '403']);
  });
});
