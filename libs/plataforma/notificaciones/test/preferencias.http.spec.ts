import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule, type OpenAPIObject } from '@nestjs/swagger';
import { Test } from '@nestjs/testing';
import { uuidV7 } from '@vitrina/plataforma/kernel-infra';
import { LIMITE_TASA, LimiteTasaGuard, PUBLICO } from '@vitrina/plataforma/seguridad';
import request from 'supertest';
import { EnviarNotificacion } from '../src/application/enviar-notificacion.js';
import { ConsultarPreferencias } from '../src/application/preferencias/consultar-preferencias.js';
import { RegistrarBaja } from '../src/application/preferencias/registrar-baja.js';
import { vencimientoEnlace } from '../src/domain/enlace-preferencias.js';
import { PreferenciasController } from '../src/interface/preferencias.controller.js';
import { AHORA, escenario, TENANT_A } from './support/dobles.js';

const RUTA = '/v1/notificaciones/preferencias';
const LIMITE_POR_MINUTO = 10;
const ERROR_ENLACE = { codigo: 'ENLACE_INVALIDO', mensaje: 'Enlace inválido o vencido' };

describe('HTTP /v1/notificaciones/preferencias (spec 46)', () => {
  let app: INestApplication;
  let mundo: ReturnType<typeof escenario>;
  let documento: OpenAPIObject;
  let token: string;
  const http = () => request(app.getHttpServer());

  async function levantar(): Promise<void> {
    mundo = escenario();
    const modulo = await Test.createTestingModule({
      controllers: [PreferenciasController],
      providers: [
        { provide: LIMITE_TASA, useValue: { limite: LIMITE_POR_MINUTO, ventanaMs: 60_000 } },
        LimiteTasaGuard,
        { provide: ConsultarPreferencias, useFactory: () => new ConsultarPreferencias(mundo.preferencias) },
        { provide: RegistrarBaja, useFactory: () => new RegistrarBaja(mundo.preferencias) },
      ],
    }).compile();
    app = modulo.createNestApplication({ logger: false });
    app.setGlobalPrefix('v1');
    await app.init();
    documento = SwaggerModule.createDocument(app, new DocumentBuilder().build());
    await mundo.enTenant(TENANT_A, () =>
      new EnviarNotificacion(mundo.envio).enviar({
        plantilla: 'PRUEBA_CORREO',
        destinatario: { correo: 'juana@gmail.com' },
        variables: { nombre: 'Juana', producto: 'SazónPOS' },
        finalidad: 'TRANSACCIONAL',
        claveIdempotencia: uuidV7(),
      }),
    );
    token = mundo.firmador.firmar({ tenantId: TENANT_A, canal: 'CORREO', destinoHash: 'sha256:juana@gmail.com', venceEn: vencimientoEnlace(AHORA) });
  }

  beforeEach(levantar);
  afterEach(() => app.close());

  it('consultar devuelve el destino enmascarado y las bajas; el PUT registra y responde las vigentes', async () => {
    const antes = await http().post(`${RUTA}/consultar`).send({ token });
    const baja = await http().put(RUTA).send({ token, baja: 'PROMOCIONAL' });
    const despues = await http().post(`${RUTA}/consultar`).send({ token });

    expect([antes.status, antes.body]).toEqual([200, { destinoEnmascarado: 'j***@gmail.com', canal: 'CORREO', bajas: [] }]);
    expect([baja.status, baja.body]).toEqual([200, { bajas: ['PROMOCIONAL'] }]);
    expect(despues.body.bajas).toEqual(['PROMOCIONAL']);
  });

  it('la misma baja dos veces responde 200 y deja una sola', async () => {
    await http().put(RUTA).send({ token, baja: 'CANAL' });
    const repetida = await http().put(RUTA).send({ token, baja: 'CANAL' });

    expect([repetida.status, repetida.body]).toEqual([200, { bajas: ['CANAL'] }]);
    expect(mundo.bajas.bajas).toHaveLength(1);
  });

  it('TR-CA-194: token alterado o vencido → 400 ENLACE_INVALIDO sin destino ni tenant', async () => {
    const [cuerpo, firma] = token.split('.') as [string, string];
    const alterado = `${cuerpo}.${firma.startsWith('A') ? 'B' : 'A'}${firma.slice(1)}`;
    const consulta = await http().post(`${RUTA}/consultar`).send({ token: alterado });
    const baja = await http().put(RUTA).send({ token: alterado, baja: 'CANAL' });
    mundo.reloj.avanzar(30 * 86_400_000);
    const vencido = await http().post(`${RUTA}/consultar`).send({ token });

    for (const respuesta of [consulta, baja, vencido]) {
      expect([respuesta.status, respuesta.body]).toEqual([400, ERROR_ENLACE]);
      expect(JSON.stringify(respuesta.body)).not.toMatch(/juana|j\*\*\*|42000000/);
    }
    expect(mundo.bajas.bajas).toEqual([]);
  });

  it('cuerpo sin token o con una baja desconocida → 400 SOLICITUD_INVALIDA con los campos, sin valores', async () => {
    const sinToken = await http().post(`${RUTA}/consultar`).send({});
    const bajaDesconocida = await http().put(RUTA).send({ token, baja: 'TODO' });

    expect([sinToken.status, sinToken.body]).toEqual([400, { codigo: 'SOLICITUD_INVALIDA', errores: ['token'] }]);
    expect([bajaDesconocida.status, bajaDesconocida.body]).toEqual([400, { codigo: 'SOLICITUD_INVALIDA', errores: ['baja'] }]);
  });

  it(`más de ${LIMITE_POR_MINUTO} solicitudes por minuto desde la misma IP → 429 DEMASIADAS_SOLICITUDES con Retry-After`, async () => {
    for (let intento = 0; intento < LIMITE_POR_MINUTO; intento++) await http().post(`${RUTA}/consultar`).send({ token }).expect(200);

    const excedida = await http().post(`${RUTA}/consultar`).send({ token });
    const otraRuta = await http().put(RUTA).send({ token, baja: 'PROMOCIONAL' });

    expect([excedida.status, excedida.body]).toEqual([429, { codigo: 'DEMASIADAS_SOLICITUDES' }]);
    expect(Number(excedida.headers['retry-after'])).toBeGreaterThan(0);
    expect(otraRuta.status).toBe(200);
  });

  it('las dos rutas son públicas, bajo /v1 y con OpenAPI de cuerpo, respuesta y errores', () => {
    const reflector = new Reflector();
    for (const metodo of [PreferenciasController.prototype.consultar, PreferenciasController.prototype.registrar]) {
      expect(reflector.get(PUBLICO, metodo)).toBe(true);
    }
    const consultar = documento.paths[`${RUTA}/consultar`]?.post;
    const registrar = documento.paths[RUTA]?.put;
    for (const operacion of [consultar, registrar]) {
      expect(operacion?.requestBody).toBeDefined();
      expect(Object.keys(operacion?.responses ?? {}).sort()).toEqual(['200', '400', '429']);
      expect(operacion?.parameters ?? []).toEqual([]);
    }
  });
});
