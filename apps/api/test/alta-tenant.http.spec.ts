import 'reflect-metadata';
import { readFile } from 'node:fs/promises';
import type { CanActivate, ExecutionContext, INestApplication } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { ValidationError } from '@vitrina/plataforma/kernel';
import { IdentidadNoDisponibleError, PermisoGuard } from '@vitrina/plataforma/seguridad';
import { AltaTenant, RucInvalidoError, TenantDuplicadoError, type AltaTenantComando, type TenantDadoDeAlta } from '../src/org/alta-tenant.js';
import { AltaTenantController } from '../src/org/alta-tenant.controller.js';
import { OperadorRequeridoError } from '../src/org/operador.js';

const OPERADOR = '0193f3a0-0000-7000-8000-0000000000aa';
const SUCURSAL_OPERADOR = '0193f3a0-0000-7000-8000-000000000101';
const ADMIN = '0193f3a0-0000-7000-8000-000000000901';
const MFA_MAX_EDAD_SEG = 900;
const MILISEGUNDOS_POR_SEGUNDO = 1000;

const RUTA_MANIFIESTO = new URL('../../../libs/plataforma/seguridad/manifiesto/plat.manifiesto.json', import.meta.url);

const alta: TenantDadoDeAlta = {
  tenantId: '0193f3a0-0000-7000-8000-0000000000cc',
  estado: 'PRUEBA',
  suscripcionId: '0193f3a0-0000-7000-8000-0000000000c1',
  vigenteHasta: '2026-11-09',
  empresaId: '0193f3a0-0000-7000-8000-0000000000c2',
  sucursalId: '0193f3a0-0000-7000-8000-0000000000c3',
  membresiaId: '0193f3a0-0000-7000-8000-0000000000c4',
  invitacionId: '0193f3a0-0000-7000-8000-0000000000c5',
  expiraEn: new Date('2026-10-28T15:00:00Z'),
  usuarioNuevo: true,
  correoEnviado: true,
};

const cuerpoValido = {
  codigo: 'polleria-dona-rosa',
  nombre: 'Pollería Doña Rosa',
  producto_codigo: 'REST',
  plan: 'BASICO',
  modalidad: 'PRUEBA',
  ruc: '20601234565',
  razon_social: 'Pollería Doña Rosa SAC',
  correo_propietario: 'rosa.quispe@gmail.com',
  nombre_propietario: 'Rosa Quispe',
};

/** Hace lo que deja AutenticacionGuard. `x-prueba-aal` simula un token sin MFA. */
class PrincipalDePrueba implements CanActivate {
  canActivate(contexto: ExecutionContext): boolean {
    const solicitud = contexto.switchToHttp().getRequest();
    const aal = solicitud.headers['x-prueba-aal'] ?? 'aal2';
    const ahoraSeg = Math.floor(Date.now() / MILISEGUNDOS_POR_SEGUNDO);
    solicitud.principal = { usuarioId: ADMIN, tenantId: OPERADOR, tipo: 'INTERNO', aal, sesionId: 'sesion', amr: aal === 'aal2' ? [{ method: 'totp', timestamp: ahoraSeg }] : [] };
    return true;
  }
}

type DependenciasGuard = ConstructorParameters<typeof PermisoGuard>;

describe('HTTP POST /v1/org/tenants (TR-RF-001)', () => {
  let app: INestApplication;
  let fallo: Error | null;
  let permisosDelActor: string[];
  const comandos: AltaTenantComando[] = [];
  const crear = (cuerpo: unknown, cabeceras: Record<string, string> = {}) =>
    request(app.getHttpServer()).post('/v1/org/tenants').set('X-Sucursal-Id', SUCURSAL_OPERADOR).set(cabeceras).send(cuerpo as object);

  beforeAll(async () => {
    const manifiesto: { permisos: { codigo: string; sensible: boolean }[] } = JSON.parse(await readFile(RUTA_MANIFIESTO, 'utf8'));
    const sensibles = new Set(manifiesto.permisos.filter((permiso) => permiso.sensible).map((permiso) => permiso.codigo));
    const modulo = await Test.createTestingModule({
      controllers: [AltaTenantController],
      providers: [
        {
          provide: AltaTenant,
          useValue: {
            ejecutar: async (comando: AltaTenantComando) => {
              comandos.push(comando);
              if (fallo) throw fallo;
              return alta;
            },
          },
        },
      ],
    }).compile();
    app = modulo.createNestApplication({ logger: false });

    const resolver = { ejecutar: async () => ({ permisos: permisosDelActor }) } as unknown as DependenciasGuard[1];
    const catalogo = { sensible: async (codigo: string) => sensibles.has(codigo) } as unknown as DependenciasGuard[2];
    const bitacora = { registrar: async () => undefined } as unknown as DependenciasGuard[3];
    const unidadDeTrabajo: DependenciasGuard[4] = { run: (trabajo) => trabajo() };
    const contexto: DependenciasGuard[5] = { current: () => ({ tenantId: OPERADOR }), run: (_alcance, trabajo) => trabajo() };
    app.useGlobalGuards(new PrincipalDePrueba(), new PermisoGuard(new Reflector(), resolver, catalogo, bitacora, unidadDeTrabajo, contexto, MFA_MAX_EDAD_SEG));
    app.setGlobalPrefix('v1');
    await app.init();
  });

  beforeEach(() => {
    fallo = null;
    permisosDelActor = ['plat.tenant.crear'];
    comandos.length = 0;
  });

  afterAll(() => app?.close());

  it('201 con el alta en snake_case, sin token, correo ni RUC; el comando lleva el actor del token', async () => {
    const respuesta = await crear(cuerpoValido);

    expect(respuesta.status).toBe(201);
    expect(respuesta.body).toEqual({
      tenant_id: alta.tenantId,
      estado: 'PRUEBA',
      suscripcion_id: alta.suscripcionId,
      vigente_hasta: '2026-11-09',
      empresa_id: alta.empresaId,
      sucursal_id: alta.sucursalId,
      membresia_id: alta.membresiaId,
      invitacion_id: alta.invitacionId,
      expira_en: '2026-10-28T15:00:00.000Z',
      usuario_nuevo: true,
      correo_enviado: true,
    });
    expect(JSON.stringify(respuesta.body)).not.toMatch(/rosa\.quispe|20601234565|token/);
    expect(comandos).toEqual([
      expect.objectContaining({ codigo: 'polleria-dona-rosa', productoCodigo: 'REST', modalidad: 'PRUEBA', vigenteHasta: null, actor: { usuarioId: ADMIN, tenantId: OPERADOR } }),
    ]);
  });

  it.each([
    ['producto PLAT', { producto_codigo: 'PLAT' }],
    ['plan desconocido', { plan: 'GRATIS' }],
    ['RUC de 10 dígitos', { ruc: '2060123456' }],
    ['fecha con otro formato', { vigente_hasta: '09/11/2026' }],
    ['sin correo del propietario', { correo_propietario: undefined }],
  ])('400 SOLICITUD_INVALIDA con %s, sin llamar al alta', async (_caso, cambios) => {
    const respuesta = await crear({ ...cuerpoValido, ...cambios });
    expect(respuesta.status).toBe(400);
    expect(respuesta.body.codigo).toBe('SOLICITUD_INVALIDA');
    expect(comandos).toEqual([]);
  });

  it.each([
    ['RUC con dígito verificador inválido', new RucInvalidoError(), 400, 'RUC_INVALIDO', 'RUC inválido'],
    ['ACTIVO sin fecha', new ValidationError('Un tenant ACTIVO exige vigente_hasta posterior a hoy'), 400, 'SOLICITUD_INVALIDA', 'Un tenant ACTIVO exige vigente_hasta posterior a hoy'],
    ['actor fuera del operador', new OperadorRequeridoError(), 403, 'OPERADOR_REQUERIDO', 'Solo el tenant operador puede administrar tenants'],
    ['código repetido', new TenantDuplicadoError(), 409, 'TENANT_DUPLICADO', 'El código de tenant ya existe'],
    ['Supabase caído', new IdentidadNoDisponibleError('timeout'), 503, 'IDENTIDAD_NO_DISPONIBLE', 'El proveedor de identidad no respondió (timeout)'],
  ])('%s responde %i %s', async (_caso, error, estado, codigo, mensaje) => {
    fallo = error;
    const respuesta = await crear(cuerpoValido);
    expect(respuesta.status).toBe(estado);
    expect(respuesta.body).toEqual({ codigo, mensaje });
  });

  it('sin plat.tenant.crear responde 403 SIN_PERMISO', async () => {
    permisosDelActor = ['plat.sesion.contexto'];
    const respuesta = await crear(cuerpoValido);
    expect(respuesta.status).toBe(403);
    expect(respuesta.body).toEqual({ codigo: 'SIN_PERMISO', permiso: 'plat.tenant.crear' });
  });

  it('con aal1 responde 401 step-up: plat.tenant.crear es sensible en el manifiesto', async () => {
    const respuesta = await crear(cuerpoValido, { 'x-prueba-aal': 'aal1' });
    expect(respuesta.status).toBe(401);
    expect(respuesta.body.codigo).toBe('MFA_REQUERIDA');
    expect(comandos).toEqual([]);
  });
});
