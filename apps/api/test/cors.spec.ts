import 'reflect-metadata';
import { Controller, Get, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { opcionesCors } from '../src/cors.js';

const ORIGEN_ADMIN = 'https://admin.x';
const ORIGEN_CONSOLA = 'https://consola.x';

@Controller('org')
class OrgDePrueba {
  @Get('empresas')
  listar(): { items: never[]; total: number } {
    return { items: [], total: 0 };
  }
}

async function appCon(valor: string | undefined): Promise<INestApplication> {
  const modulo = await Test.createTestingModule({ controllers: [OrgDePrueba] }).compile();
  const app = modulo.createNestApplication({ logger: false });
  const cors = opcionesCors(valor);
  if (cors) app.enableCors(cors);
  await app.init();
  return app;
}

const preflightDesde = (app: INestApplication, origen: string) =>
  request(app.getHttpServer())
    .options('/org/empresas')
    .set('Origin', origen)
    .set('Access-Control-Request-Method', 'GET')
    .set('Access-Control-Request-Headers', 'authorization,x-sucursal-id');

describe('opcionesCors (U-06)', () => {
  it.each([undefined, '', '  ,  '])('sin orígenes (%p) no hay CORS', (valor) => {
    expect(opcionesCors(valor)).toBeNull();
  });

  it('recorta los orígenes y no pide credenciales', () => {
    expect(opcionesCors(` ${ORIGEN_ADMIN} , ${ORIGEN_CONSOLA} `)).toEqual({
      origin: [ORIGEN_ADMIN, ORIGEN_CONSOLA],
      methods: ['GET', 'POST', 'PUT', 'DELETE'],
      allowedHeaders: ['Authorization', 'Content-Type', 'X-Sucursal-Id'],
      credentials: false,
    });
  });

  it.each(['https://admin.x/ruta', 'https://admin.x/', 'admin.x', '*'])('rechaza «%s» al arrancar', (entrada) => {
    expect(() => opcionesCors(`${ORIGEN_CONSOLA},${entrada}`)).toThrow(`ORIGENES_PERMITIDOS: «${entrada}» no es un origen`);
  });

  describe('preflight', () => {
    let app: INestApplication;

    afterEach(() => app?.close());

    it('un origen de la lista recibe Access-Control-Allow-Origin y uno ajeno no', async () => {
      app = await appCon(`${ORIGEN_ADMIN},${ORIGEN_CONSOLA}`);

      const permitido = await preflightDesde(app, ORIGEN_ADMIN);
      expect(permitido.status).toBe(204);
      expect(permitido.headers['access-control-allow-origin']).toBe(ORIGEN_ADMIN);
      expect(permitido.headers['access-control-allow-headers']).toBe('Authorization,Content-Type,X-Sucursal-Id');
      expect(permitido.headers['access-control-allow-credentials']).toBeUndefined();

      const ajeno = await preflightDesde(app, 'https://otro.x');
      expect(ajeno.headers['access-control-allow-origin']).toBeUndefined();
    });

    it('sin la variable no hay encabezados CORS', async () => {
      app = await appCon(undefined);

      const respuesta = await request(app.getHttpServer()).get('/org/empresas').set('Origin', ORIGEN_ADMIN);
      expect(respuesta.status).toBe(200);
      expect(respuesta.headers['access-control-allow-origin']).toBeUndefined();
    });
  });
});
