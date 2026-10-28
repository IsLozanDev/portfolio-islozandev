import 'reflect-metadata';
import type { CanActivate, ExecutionContext, INestApplication } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { ConflictError, ValidationError } from '@vitrina/plataforma/kernel';
import { PermisoGuard } from '@vitrina/plataforma/seguridad';
import { ConsolaTenantsController } from '../src/org/consola-tenants.controller.js';
import { ConsolaTenants, type FiltroTenants, type TenantDetalle } from '../src/org/consulta-tenants.js';
import { OperadorRequeridoError } from '../src/org/operador.js';

const OPERADOR = '0193f3a0-0000-7000-8000-0000000000aa';
const SUCURSAL_OPERADOR = '0193f3a0-0000-7000-8000-000000000101';
const ADMIN = '0193f3a0-0000-7000-8000-000000000901';
const GYM = '0193f3a0-0000-7000-8000-0000000000cc';
const MFA_MAX_EDAD_SEG = 900;
const MILISEGUNDOS_POR_SEGUNDO = 1000;
const PERMISO_SENSIBLE = 'plat.tenant.cambiar_estado';
const MOTIVO = 'Falta de pago de dos meses consecutivos';

const gym: TenantDetalle = {
  id: GYM,
  codigo: 'gym-fuerza-total',
  nombre: 'Gym Fuerza Total',
  estado: 'SUSPENDIDO',
  creadoEn: new Date('2026-09-01T15:00:00Z'),
  suscripciones: [{ productoCodigo: 'GYM', plan: 'PRO', estado: 'VENCIDA', vigenteHasta: '2026-10-01' }],
  estadoMotivo: 'Fin del periodo de gracia de la suscripción',
  estadoCambiadoEn: new Date('2026-10-06T11:00:00Z'),
  version: 3,
  empresaPrincipal: { id: '0193f3a0-0000-7000-8000-0000000000e1', ruc: '20512345671', razonSocial: 'Fuerza Total SAC' },
  historial: [
    { estadoAnterior: 'ACTIVO', estadoNuevo: 'SUSPENDIDO', motivo: 'Fin del periodo de gracia de la suscripción', fechaEfectiva: '2026-10-06T11:00:00+00:00', actorId: null, registradoEn: '2026-10-06T11:00:00+00:00' },
  ],
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

describe('HTTP /v1/org/tenants de la consola (TR-RF-001 y 006)', () => {
  let app: INestApplication;
  let permisosDelActor: string[];
  let esOperador: boolean;
  let falloAlCambiar: Error | null;
  const filtros: FiltroTenants[] = [];
  const detalles: string[] = [];
  const cambios: unknown[] = [];

  const servidor = () => request(app.getHttpServer());
  const conCabeceras = <T extends request.Test>(solicitud: T, cabeceras: Record<string, string> = {}) => solicitud.set('X-Sucursal-Id', SUCURSAL_OPERADOR).set(cabeceras);
  const cambiar = (cuerpo: object, cabeceras: Record<string, string> = {}) => conCabeceras(servidor().post(`/v1/org/tenants/${GYM}/estado`), cabeceras).send(cuerpo);

  beforeAll(async () => {
    const consola = new ConsolaTenants({
      exigirOperador: {
        ejecutar: async () => {
          if (!esOperador) throw new OperadorRequeridoError();
        },
      },
      consulta: {
        listar: async (filtro) => {
          filtros.push(filtro);
          return { items: [gym], total: 1 };
        },
        detalle: async (tenantId) => {
          detalles.push(tenantId);
          return tenantId === GYM ? gym : null;
        },
      },
      cambiarEstadoTenant: {
        ejecutar: async (comando) => {
          cambios.push(comando);
          if (falloAlCambiar) throw falloAlCambiar;
          return { cambiado: true };
        },
      },
    });
    const modulo = await Test.createTestingModule({
      controllers: [ConsolaTenantsController],
      providers: [{ provide: ConsolaTenants, useValue: consola }],
    }).compile();
    app = modulo.createNestApplication({ logger: false });

    const resolver = { ejecutar: async () => ({ permisos: permisosDelActor }) } as unknown as DependenciasGuard[1];
    // El manifiesto 1.6.0 declara plat.tenant.cambiar_estado sensible; lo comprueba manifiesto-plat.spec.ts.
    const catalogo = { sensible: async (codigo: string) => codigo === PERMISO_SENSIBLE } as unknown as DependenciasGuard[2];
    const bitacora = { registrar: async () => undefined } as unknown as DependenciasGuard[3];
    const unidadDeTrabajo: DependenciasGuard[4] = { run: (trabajo) => trabajo() };
    const contexto: DependenciasGuard[5] = { current: () => ({ tenantId: OPERADOR }), run: (_alcance, trabajo) => trabajo() };
    app.useGlobalGuards(new PrincipalDePrueba(), new PermisoGuard(new Reflector(), resolver, catalogo, bitacora, unidadDeTrabajo, contexto, MFA_MAX_EDAD_SEG));
    app.setGlobalPrefix('v1');
    await app.init();
  });

  beforeEach(() => {
    permisosDelActor = ['plat.tenant.consultar', PERMISO_SENSIBLE];
    esOperador = true;
    falloAlCambiar = null;
    filtros.length = 0;
    detalles.length = 0;
    cambios.length = 0;
  });

  afterAll(() => app?.close());

  it('GET filtra por SUSPENDIDO y devuelve solo cabecera y suscripciones en snake_case', async () => {
    const respuesta = await conCabeceras(servidor().get('/v1/org/tenants?estado=SUSPENDIDO&q=gym'));

    expect(respuesta.status).toBe(200);
    expect(respuesta.body).toEqual({
      items: [
        {
          id: GYM,
          codigo: 'gym-fuerza-total',
          nombre: 'Gym Fuerza Total',
          estado: 'SUSPENDIDO',
          creado_en: '2026-09-01T15:00:00.000Z',
          suscripciones: [{ producto_codigo: 'GYM', plan: 'PRO', estado: 'VENCIDA', vigente_hasta: '2026-10-01' }],
        },
      ],
      total: 1,
    });
    expect(filtros).toEqual([{ pagina: 1, tamano: 20, q: 'gym', estado: 'SUSPENDIDO', producto: undefined }]);
  });

  it.each([
    ['estado desconocido', '?estado=MOROSO'],
    ['producto PLAT', '?producto=PLAT'],
    ['tamano 101', '?tamano=101'],
  ])('GET con %s responde 400 SOLICITUD_INVALIDA', async (_caso, consulta) => {
    const respuesta = await conCabeceras(servidor().get(`/v1/org/tenants${consulta}`));
    expect(respuesta.status).toBe(400);
    expect(respuesta.body.codigo).toBe('SOLICITUD_INVALIDA');
    expect(filtros).toEqual([]);
  });

  it('GET :id trae empresa principal e historial', async () => {
    const respuesta = await conCabeceras(servidor().get(`/v1/org/tenants/${GYM}`));

    expect(respuesta.status).toBe(200);
    expect(respuesta.body).toMatchObject({
      version: 3,
      estado_cambiado_en: '2026-10-06T11:00:00.000Z',
      empresa_principal: { ruc: '20512345671', razon_social: 'Fuerza Total SAC' },
      historial: [{ estado_anterior: 'ACTIVO', estado_nuevo: 'SUSPENDIDO', actor_id: null }],
    });
  });

  it('GET :id inexistente o que no es UUID responde 404 NO_ENCONTRADO', async () => {
    const inexistente = await conCabeceras(servidor().get('/v1/org/tenants/0193f3a0-0000-7000-8000-0000000000ff'));
    const malFormado = await conCabeceras(servidor().get('/v1/org/tenants/gym'));
    expect([inexistente.status, malFormado.status]).toEqual([404, 404]);
    expect(inexistente.body).toEqual({ codigo: 'NO_ENCONTRADO', mensaje: 'El tenant no existe' });
    expect(detalles).toEqual(['0193f3a0-0000-7000-8000-0000000000ff']);
  });

  it('un actor fuera del operador recibe 403 OPERADOR_REQUERIDO en los tres endpoints, sin leer ni cambiar nada', async () => {
    esOperador = false;
    const respuestas = [
      await conCabeceras(servidor().get('/v1/org/tenants')),
      await conCabeceras(servidor().get(`/v1/org/tenants/${GYM}`)),
      await cambiar({ estado: 'ACTIVO', motivo: MOTIVO }),
    ];
    for (const respuesta of respuestas) {
      expect(respuesta.status).toBe(403);
      expect(respuesta.body).toEqual({ codigo: 'OPERADOR_REQUERIDO', mensaje: 'Solo el tenant operador puede administrar tenants' });
    }
    expect([filtros, detalles, cambios]).toEqual([[], [], []]);
  });

  it('POST :id/estado responde 200 con cambiado y pasa el actor del token', async () => {
    const respuesta = await cambiar({ estado: 'SUSPENDIDO', motivo: MOTIVO });

    expect(respuesta.status).toBe(200);
    expect(respuesta.body).toEqual({ cambiado: true, estado: 'SUSPENDIDO' });
    expect(cambios).toEqual([{ tenantId: GYM, estadoNuevo: 'SUSPENDIDO', motivo: MOTIVO, actorId: ADMIN }]);
  });

  it.each([
    ['motivo corto (TR-CA-018)', new ValidationError('El motivo es obligatorio y debe tener de 10 a 500 caracteres'), 400, 'SOLICITUD_INVALIDA'],
    ['BAJA → ACTIVO (TR-CA-017)', new ConflictError('Un tenant dado de baja no puede reactivarse; cree uno nuevo o restaure desde respaldo'), 409, 'CONFLICTO'],
  ])('%s responde %i %s', async (_caso, error, estado, codigo) => {
    falloAlCambiar = error;
    const respuesta = await cambiar({ estado: 'ACTIVO', motivo: 'corto' });
    expect(respuesta.status).toBe(estado);
    expect(respuesta.body).toEqual({ codigo, mensaje: error.message });
  });

  it('POST :id/estado sin estado válido responde 400 sin llamar al caso de uso', async () => {
    const respuesta = await cambiar({ estado: 'MOROSO', motivo: MOTIVO });
    expect(respuesta.status).toBe(400);
    expect(cambios).toEqual([]);
  });

  it('POST :id/estado con aal1 responde 401 MFA_REQUERIDA: el permiso es sensible', async () => {
    const respuesta = await cambiar({ estado: 'SUSPENDIDO', motivo: MOTIVO }, { 'x-prueba-aal': 'aal1' });
    expect(respuesta.status).toBe(401);
    expect(respuesta.body.codigo).toBe('MFA_REQUERIDA');
    expect(cambios).toEqual([]);
  });

  it('sin plat.tenant.consultar, la lista responde 403 SIN_PERMISO', async () => {
    permisosDelActor = [PERMISO_SENSIBLE];
    const respuesta = await conCabeceras(servidor().get('/v1/org/tenants'));
    expect(respuesta.status).toBe(403);
    expect(respuesta.body).toEqual({ codigo: 'SIN_PERMISO', permiso: 'plat.tenant.consultar' });
  });
});
