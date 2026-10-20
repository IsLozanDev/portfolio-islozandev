import 'reflect-metadata';
import { Controller, Get, Logger, Post, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { Principal } from '../src/domain/principal.js';
import { REGISTRO_ACCESO, type RegistroAcceso } from '../src/application/ports/registro-acceso.port.js';
import { SeguridadModule, type SeguridadOpciones } from '../src/seguridad.module.js';
import { PrincipalActual, Publico, RequiereMfa } from '../src/interface/decoradores.js';
import { ahoraSeg, claimsBase, firmar, JwksLocal, nuevaLlave, type Llave } from './support/jwks-local.js';

const SUPABASE_URL = 'https://proyecto-prueba.supabase.co';
const STEP_UP = 'Bearer error="insufficient_user_authentication", acr_values="aal2", max_age=900';

let anulaciones = 0;

@Controller('prueba')
class PruebaController {
  @Publico()
  @Get('publica')
  publica() {
    return { ok: true };
  }

  @Get('protegida')
  protegida(@PrincipalActual() p: Principal) {
    return p;
  }

  @RequiereMfa()
  @Post('anular')
  anular() {
    anulaciones++;
    return { anulada: true };
  }
}

class RegistroAccesoMemoria implements RegistroAcceso {
  marcados: string[] = [];
  falla = false;
  async marcar(usuarioId: string): Promise<void> {
    if (this.falla) throw new Error('base caída');
    this.marcados.push(usuarioId);
  }
}

const jwks = new JwksLocal();
let llave: Llave;
let jwksUrl: string;

beforeAll(async () => {
  llave = await nuevaLlave('kid-1');
  jwksUrl = await jwks.iniciar();
  jwks.publicar(llave);
});

afterAll(() => jwks.detener());

/** Captura los warn de Nest sin imprimirlos. */
function capturarWarn() {
  const llamadas: unknown[] = [];
  const original = Logger.prototype.warn;
  Logger.prototype.warn = (mensaje: unknown) => void llamadas.push(mensaje);
  return { llamadas, restaurar: () => (Logger.prototype.warn = original) };
}

async function crearApp(registro: RegistroAcceso, op: Partial<SeguridadOpciones> = {}): Promise<INestApplication> {
  const modulo = await Test.createTestingModule({
    imports: [SeguridadModule.register({ supabaseUrl: SUPABASE_URL, mfaMaxEdadSeg: 900, jwksUrl, ...op })],
    controllers: [PruebaController],
  })
    .overrideProvider(REGISTRO_ACCESO)
    .useValue(registro)
    .compile();
  const app = modulo.createNestApplication({ logger: false });
  await app.init();
  return app;
}

const conMfaHace = (seg: number) => claimsBase({ aal: 'aal2', amr: [{ method: 'password', timestamp: ahoraSeg() - 3600 }, { method: 'totp', timestamp: ahoraSeg() - seg }] });

describe('AutenticacionGuard y MfaGuard', () => {
  let app: INestApplication;
  const registro = new RegistroAccesoMemoria();
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await crearApp(registro);
  });

  afterAll(() => app.close());

  beforeEach(() => {
    anulaciones = 0;
    registro.marcados = [];
    registro.falla = false;
  });

  it('una ruta @Publico responde 200 sin token', async () => {
    const res = await http().get('/prueba/publica');
    expect(res.status).toBe(200);
  });

  it.each([
    ['sin Authorization', undefined],
    ['con esquema Basic', 'Basic dXN1YXJpbzpjbGF2ZQ=='],
    ['con token inválido', 'Bearer no.es.jwt'],
  ])('ruta protegida %s: 401 uniforme', async (_caso, cabecera) => {
    const req = http().get('/prueba/protegida');
    const res = await (cabecera ? req.set('Authorization', cabecera) : req);
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ codigo: 'TOKEN_INVALIDO' });
    expect(res.headers['www-authenticate']).toBe('Bearer error="invalid_token"');
  });

  it('con token válido responde 200, el principal llega al handler y se marca el acceso', async () => {
    const res = await http().get('/prueba/protegida').set('Authorization', `Bearer ${await firmar(llave)}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ usuarioId: '0193f3a0-0000-7000-8000-000000000001', tipo: 'INTERNO', aal: 'aal1' });
    expect(registro.marcados).toEqual(['0193f3a0-0000-7000-8000-000000000001']);
  });

  it('si marcar el acceso falla, la petición responde igual y queda un warn', async () => {
    registro.falla = true;
    const warn = capturarWarn();
    try {
      const res = await http().get('/prueba/protegida').set('Authorization', `Bearer ${await firmar(llave)}`);
      expect(res.status).toBe(200);
      await new Promise((ok) => setImmediate(ok));
      expect(warn.llamadas).toContainEqual(expect.objectContaining({ evento: 'auth.ultimo_acceso.error' }));
    } finally {
      warn.restaurar();
    }
  });

  it('una ruta sin @RequiereMfa acepta aal1', async () => {
    const res = await http().get('/prueba/protegida').set('Authorization', `Bearer ${await firmar(llave, claimsBase({ aal: 'aal1' }))}`);
    expect(res.status).toBe(200);
  });

  it('@RequiereMfa con MFA de hace 5 min ejecuta la acción (TR-CA-047, parte backend)', async () => {
    const res = await http().post('/prueba/anular').set('Authorization', `Bearer ${await firmar(llave, conMfaHace(300))}`);
    expect(res.status).toBe(201);
    expect(anulaciones).toBe(1);
  });

  it('@RequiereMfa con MFA de hace 40 min: 401 step-up y no ejecuta (TR-CA-048, parte backend)', async () => {
    const res = await http().post('/prueba/anular').set('Authorization', `Bearer ${await firmar(llave, conMfaHace(2400))}`);
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ codigo: 'MFA_REQUERIDA', max_edad: 900 });
    expect(res.headers['www-authenticate']).toBe(STEP_UP);
    expect(anulaciones).toBe(0);
  });

  it('@RequiereMfa con aal1: 401 MFA_REQUERIDA', async () => {
    const res = await http().post('/prueba/anular').set('Authorization', `Bearer ${await firmar(llave)}`);
    expect(res.status).toBe(401);
    expect(res.body.codigo).toBe('MFA_REQUERIDA');
    expect(anulaciones).toBe(0);
  });

  it('el log de rechazo trae código y motivo, y no contiene el token ni el correo', async () => {
    const warn = capturarWarn();
    try {
      const token = await firmar(llave, { ...conMfaHace(2400), email: 'rosa.huaman@gmail.com' });
      await http().post('/prueba/anular').set('Authorization', `Bearer ${token}`);
      await http().get('/prueba/protegida').set('Authorization', `Bearer ${token}x`);
      const logs = JSON.stringify(warn.llamadas);
      expect(warn.llamadas).toContainEqual(
        expect.objectContaining({ evento: 'auth.rechazo', codigo: 'MFA_REQUERIDA', motivo: 'mfa_vencido', usuario_id: '0193f3a0-0000-7000-8000-000000000001' }),
      );
      expect(warn.llamadas).toContainEqual(expect.objectContaining({ evento: 'auth.rechazo', codigo: 'TOKEN_INVALIDO', motivo: 'firma' }));
      expect(logs).not.toContain(token.slice(0, 20));
      expect(logs).not.toContain('rosa.huaman');
    } finally {
      warn.restaurar();
    }
  });
});

describe('opciones del módulo', () => {
  it('con mfaMaxEdadSeg = 60 un MFA de hace 2 min se rechaza', async () => {
    const app = await crearApp(new RegistroAccesoMemoria(), { mfaMaxEdadSeg: 60 });
    try {
      const res = await request(app.getHttpServer()).post('/prueba/anular').set('Authorization', `Bearer ${await firmar(llave, conMfaHace(120))}`);
      expect(res.status).toBe(401);
      expect(res.body).toEqual({ codigo: 'MFA_REQUERIDA', max_edad: 60 });
    } finally {
      await app.close();
    }
  });

  it('con el JWKS caído responde 503 AUTENTICACION_NO_DISPONIBLE', async () => {
    const app = await crearApp(new RegistroAccesoMemoria(), { jwksUrl: 'http://127.0.0.1:1/auth/v1/.well-known/jwks.json' });
    try {
      const res = await request(app.getHttpServer()).get('/prueba/protegida').set('Authorization', `Bearer ${await firmar(llave)}`);
      expect(res.status).toBe(503);
      expect(res.body).toEqual({ codigo: 'AUTENTICACION_NO_DISPONIBLE' });
    } finally {
      await app.close();
    }
  });
});
