import { Body, Controller, Global, Inject, Logger, Module, Post, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { TenantContext } from '@vitrina/plataforma/kernel';
import { AlsTenantContext, TENANT_CONTEXT } from '@vitrina/plataforma/kernel-infra';
import { ObservabilidadModule, usarLoggerDeObservabilidad } from '../src/index.js';

const DNI = '45678912';
const CORREO = 'ana@ejemplo.pe';
const TOKEN = 'eyJhbGciOiJFUzI1NiJ9.token-de-prueba.firma';
const CONTRASENA = 'Contrasena-Secreta-1';
const COOKIE = 'sb-sesion=valor-de-cookie';
const ALCANCE = {
  tenantId: '0190a000-0000-7000-8000-000000000001',
  branchId: '0190a000-0000-7000-8000-000000000002',
  actorId: '0190a000-0000-7000-8000-000000000003',
  traceId: '4bf92f3577b34da6a3ce929d0e0e4736',
};

const lineas: string[] = [];
const destino = { write: (linea: string) => void lineas.push(linea) };
const contexto = new AlsTenantContext();

@Global()
@Module({ providers: [{ provide: TENANT_CONTEXT, useValue: contexto }], exports: [TENANT_CONTEXT] })
class ContextoDePruebaModule {}

@Controller('prueba')
class PruebaController {
  private readonly logger = new Logger('Prueba');

  constructor(@Inject(TENANT_CONTEXT) private readonly tenants: TenantContext) {}

  @Post()
  async registrar(@Body() cuerpo: Record<string, unknown>): Promise<{ ok: true }> {
    await this.tenants.run(ALCANCE, async () => {
      this.logger.log({ numeroDocumento: DNI, usuario: { correo: CORREO }, cuerpo }, 'log manual');
    });
    return { ok: true };
  }
}

describe('logger de observabilidad (TR-RNF-026, TR-RNF-111)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({
      imports: [ContextoDePruebaModule, ObservabilidadModule.register({ servicio: 'vitrina-prueba', nivel: 'info', salDocumento: 'sal-de-prueba-0123456789-0123456789', destino })],
      controllers: [PruebaController],
    }).compile();
    app = modulo.createNestApplication({ bufferLogs: true });
    usarLoggerDeObservabilidad(app);
    await app.init();
    await request(app.getHttpServer())
      .post(`/prueba?correo=${encodeURIComponent(CORREO)}`)
      .set('Authorization', `Bearer ${TOKEN}`)
      .set('Cookie', COOKIE)
      .send({ dni: DNI, password: CONTRASENA })
      .expect(201);
  });

  afterAll(() => app.close());

  const registros = () => lineas.map((linea) => JSON.parse(linea) as Record<string, unknown>);
  const salida = () => lineas.join('\n');

  test('cada línea es JSON con level, time, msg y servicio', () => {
    expect(registros().length).toBeGreaterThan(0);
    for (const registro of registros()) {
      expect(registro).toEqual(expect.objectContaining({ level: expect.any(Number), time: expect.any(Number), msg: expect.any(String), servicio: 'vitrina-prueba' }));
    }
  });

  test('no salen en claro el DNI, el correo, el token, la contraseña ni la cookie', () => {
    for (const secreto of [DNI, CORREO, encodeURIComponent(CORREO), TOKEN, CONTRASENA, COOKIE]) {
      expect(salida()).not.toContain(secreto);
    }
  });

  test('el log manual de un Logger de Nest sale en JSON con el contexto del tenant y el documento como hash', () => {
    const manual = registros().find((registro) => registro.msg === 'log manual');
    expect(manual).toEqual(
      expect.objectContaining({
        context: 'Prueba',
        trace_id: ALCANCE.traceId,
        tenant_id: ALCANCE.tenantId,
        sucursal_id: ALCANCE.branchId,
        usuario_id: ALCANCE.actorId,
        numeroDocumento: expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
      }),
    );
  });

  test('el log de la solicitud lleva método, ruta sin query, estado y duración', () => {
    const solicitud = registros().find((registro) => registro.msg === 'request completed');
    expect(solicitud).toEqual(
      expect.objectContaining({ req: { metodo: 'POST', ruta: '/prueba' }, res: { estado: 201 }, duracion_ms: expect.any(Number) }),
    );
  });
});
