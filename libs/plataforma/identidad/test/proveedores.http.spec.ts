import 'reflect-metadata';
import type { CanActivate, ExecutionContext, INestApplication } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import request from 'supertest';
import { ForbiddenError } from '@vitrina/plataforma/kernel';
import { PermisoGuard } from '@vitrina/plataforma/seguridad';
import { ActualizarProveedor } from '../src/application/actualizar-proveedor.js';
import { ListarProveedores } from '../src/application/listar-proveedores.js';
import type { RepositorioProveedores } from '../src/application/ports/proveedores-editables.js';
import { VersionObsoletaError } from '../src/domain/errores.js';
import { agregadoDeProveedor } from '../src/domain/eventos-idn.js';
import type { ProveedorEditable } from '../src/domain/proveedor-editable.js';
import { ProveedoresController } from '../src/interface/proveedores.controller.js';
import { PublicadorMemoria } from './support/cuotas.js';
import { RelojFalso, TENANT_A, USUARIO, UnidadDeTrabajoDirecta } from './support/dobles.js';

const SUCURSAL = '0193f3a0-0000-7000-8000-000000000102';
const MFA_MAX_EDAD_SEG = 900;
const PROVEEDOR = 'plat.identidad.proveedor';
const ahoraSeg = () => Math.floor(Date.now() / 1000);

class OperadorRequeridoPrueba extends ForbiddenError {
  override readonly code = 'OPERADOR_REQUERIDO';
}

const DECOLECTA: ProveedorEditable = { codigo: 'DECOLECTA', tiposDoc: ['DNI', 'RUC'], prioridad: 1, ttlDias: 30, timeoutMs: 3000, activo: true, version: 1 };
const RENIEC: ProveedorEditable = { codigo: 'RENIEC', tiposDoc: ['DNI'], prioridad: 2, ttlDias: 15, timeoutMs: 2000, activo: true, version: 1 };

/** Mismo contrato que RepositorioProveedoresTypeOrm. */
class RepositorioProveedoresMemoria implements RepositorioProveedores {
  proveedores: ProveedorEditable[] = [];
  async listar(): Promise<ProveedorEditable[]> {
    return [...this.proveedores].sort((primero, segundo) => primero.prioridad - segundo.prioridad).map((proveedor) => ({ ...proveedor }));
  }
  async guardar(proveedor: ProveedorEditable, versionEsperada: number): Promise<void> {
    const indice = this.proveedores.findIndex((candidato) => candidato.codigo === proveedor.codigo && candidato.version === versionEsperada);
    if (indice < 0) throw new VersionObsoletaError();
    this.proveedores[indice] = { ...proveedor, version: versionEsperada + 1 };
  }
}

type DependenciasGuard = ConstructorParameters<typeof PermisoGuard>;

describe('HTTP /v1/identidad/proveedores (spec 29)', () => {
  let app: INestApplication;
  let permisosDelActor: string[];
  let conMfa: boolean;
  let esOperador: boolean;
  const repositorio = new RepositorioProveedoresMemoria();
  const publicador = new PublicadorMemoria();
  const http = () => request(app.getHttpServer());
  const get = (ruta: string) => http().get(ruta).set('X-Sucursal-Id', SUCURSAL);
  const patch = (ruta: string, cuerpo: object) => http().patch(ruta).set('X-Sucursal-Id', SUCURSAL).send(cuerpo);

  class PrincipalDePrueba implements CanActivate {
    canActivate(contexto: ExecutionContext): boolean {
      const solicitud = contexto.switchToHttp().getRequest();
      const amr = conMfa ? [{ method: 'totp', timestamp: ahoraSeg() - 60 }] : [];
      solicitud.principal = { usuarioId: USUARIO, tenantId: TENANT_A, tipo: 'INTERNO', aal: conMfa ? 'aal2' : 'aal1', sesionId: 'sesion', amr };
      return true;
    }
  }

  beforeAll(async () => {
    const unidadDeTrabajo = new UnidadDeTrabajoDirecta();
    const verificador = {
      exigir: async () => {
        if (!esOperador) throw new OperadorRequeridoPrueba('Solo el tenant operador');
      },
    };
    const modulo = await Test.createTestingModule({
      controllers: [ProveedoresController],
      providers: [
        { provide: ListarProveedores, useValue: new ListarProveedores({ unidadDeTrabajo, verificador, repositorio }) },
        {
          provide: ActualizarProveedor,
          useValue: new ActualizarProveedor({ unidadDeTrabajo, reloj: new RelojFalso(), verificador, repositorio, publicador }),
        },
      ],
    }).compile();
    app = modulo.createNestApplication({ logger: false });

    const resolver = { ejecutar: async () => ({ permisos: permisosDelActor }) } as unknown as DependenciasGuard[1];
    const catalogo = { sensible: async (permiso: string) => permiso === PROVEEDOR } as unknown as DependenciasGuard[2];
    const bitacora = { registrar: async () => undefined } as unknown as DependenciasGuard[3];
    const unidadGuard: DependenciasGuard[4] = { run: (trabajo) => trabajo() };
    const contextoGuard: DependenciasGuard[5] = { current: () => ({ tenantId: TENANT_A }), run: (_alcance, trabajo) => trabajo() };
    app.useGlobalGuards(new PrincipalDePrueba(), new PermisoGuard(new Reflector(), resolver, catalogo, bitacora, unidadGuard, contextoGuard, MFA_MAX_EDAD_SEG));
    app.setGlobalPrefix('v1');
    await app.init();
  });

  beforeEach(() => {
    permisosDelActor = [PROVEEDOR];
    conMfa = true;
    esOperador = true;
    repositorio.proveedores = [{ ...RENIEC }, { ...DECOLECTA }];
    publicador.eventos.length = 0;
  });

  afterAll(() => app?.close());

  it('GET lista por prioridad, sin credenciales', async () => {
    const respuesta = await get('/v1/identidad/proveedores');
    expect(respuesta.status).toBe(200);
    expect(respuesta.body).toEqual([
      { codigo: 'DECOLECTA', tipos_doc: ['DNI', 'RUC'], prioridad: 1, ttl_dias: 30, timeout_ms: 3000, activo: true, version: 1 },
      { codigo: 'RENIEC', tipos_doc: ['DNI'], prioridad: 2, ttl_dias: 15, timeout_ms: 2000, activo: true, version: 1 },
    ]);
    expect(JSON.stringify(respuesta.body)).not.toMatch(/token|clave|secret/i);
  });

  it('PATCH cambia la prioridad, sube la versión y publica proveedor_identidad.actualizado con agregado fijo', async () => {
    const respuesta = await patch('/v1/identidad/proveedores/RENIEC', { prioridad: 1, version: 1 });
    await patch('/v1/identidad/proveedores/DECOLECTA', { prioridad: 2, version: 1 });

    expect([respuesta.status, respuesta.body]).toEqual([
      200,
      { codigo: 'RENIEC', tipos_doc: ['DNI'], prioridad: 1, ttl_dias: 15, timeout_ms: 2000, activo: true, version: 2 },
    ]);
    expect((await get('/v1/identidad/proveedores')).body.map((proveedor: { codigo: string }) => proveedor.codigo)).toEqual(['RENIEC', 'DECOLECTA']);
    expect(publicador.eventos[0]).toMatchObject({
      eventType: 'proveedor_identidad.actualizado',
      aggregateType: 'proveedor_identidad',
      aggregateId: agregadoDeProveedor('RENIEC'),
      aggregateVersion: 2,
      payload: { codigo: 'RENIEC', prioridad: 1, ttl_dias: 15, timeout_ms: 2000, activo: true, actor_id: USUARIO },
    });
    expect(agregadoDeProveedor('RENIEC')).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(agregadoDeProveedor('RENIEC')).not.toBe(agregadoDeProveedor('DECOLECTA'));
  });

  it('desactivar el último activo de RUC da 422 ULTIMO_PROVEEDOR_ACTIVO y no cambia nada', async () => {
    const respuesta = await patch('/v1/identidad/proveedores/DECOLECTA', { activo: false, version: 1 });
    expect([respuesta.status, respuesta.body.codigo]).toEqual([422, 'ULTIMO_PROVEEDOR_ACTIVO']);
    expect(repositorio.proveedores.find((proveedor) => proveedor.codigo === 'DECOLECTA')?.activo).toBe(true);
    expect(publicador.eventos).toEqual([]);
  });

  it('desactivar uno que tiene respaldo para todos sus tipos se acepta', async () => {
    const respuesta = await patch('/v1/identidad/proveedores/RENIEC', { activo: false, version: 1 });
    expect([respuesta.status, respuesta.body.activo]).toEqual([200, false]);
  });

  it('un código que no existe da 404 PROVEEDOR_NO_ENCONTRADO', async () => {
    const respuesta = await patch('/v1/identidad/proveedores/NADIE', { prioridad: 3, version: 1 });
    expect([respuesta.status, respuesta.body.codigo]).toEqual([404, 'PROVEEDOR_NO_ENCONTRADO']);
  });

  it('con version vieja da 409 VERSION_OBSOLETA', async () => {
    await patch('/v1/identidad/proveedores/RENIEC', { timeout_ms: 2500, version: 1 });
    const respuesta = await patch('/v1/identidad/proveedores/RENIEC', { timeout_ms: 2600, version: 1 });
    expect([respuesta.status, respuesta.body.codigo]).toEqual([409, 'VERSION_OBSOLETA']);
  });

  it.each([
    ['prioridad 0', { prioridad: 0, version: 1 }, ['prioridad']],
    ['ttl de 366 días', { ttl_dias: 366, version: 1 }, ['ttl_dias']],
    ['timeout de 99 ms', { timeout_ms: 99, version: 1 }, ['timeout_ms']],
    ['sin versión', { prioridad: 2 }, ['version']],
    ['un campo que no se edita', { token: 'x', version: 1 }, ['(entrada)']],
  ])('%s da 400', async (_caso, cuerpo, errores) => {
    const respuesta = await patch('/v1/identidad/proveedores/RENIEC', cuerpo);
    expect([respuesta.status, respuesta.body]).toEqual([400, { codigo: 'SOLICITUD_INVALIDA', errores }]);
  });

  it('desde un tenant cliente da 403 OPERADOR_REQUERIDO en GET y PATCH', async () => {
    esOperador = false;
    const lista = await get('/v1/identidad/proveedores');
    const cambio = await patch('/v1/identidad/proveedores/RENIEC', { prioridad: 3, version: 1 });
    expect([lista.status, lista.body.codigo, cambio.status, cambio.body.codigo]).toEqual([403, 'OPERADOR_REQUERIDO', 403, 'OPERADOR_REQUERIDO']);
  });

  it('sin el permiso da 403 SIN_PERMISO; sin aal2, 401 MFA_REQUERIDA', async () => {
    permisosDelActor = [];
    expect((await get('/v1/identidad/proveedores')).body.codigo).toBe('SIN_PERMISO');
    permisosDelActor = [PROVEEDOR];
    conMfa = false;
    const respuesta = await patch('/v1/identidad/proveedores/RENIEC', { prioridad: 3, version: 1 });
    expect([respuesta.status, respuesta.body.codigo]).toEqual([401, 'MFA_REQUERIDA']);
  });

  it('las dos operaciones están en OpenAPI bajo /v1', () => {
    const documento = SwaggerModule.createDocument(app, new DocumentBuilder().addBearerAuth().build());
    expect(Object.keys(documento.paths).sort()).toEqual(['/v1/identidad/proveedores', '/v1/identidad/proveedores/{codigo}']);
    expect(Object.keys(documento.paths['/v1/identidad/proveedores/{codigo}'].patch?.responses ?? {}).sort()).toEqual([
      '200',
      '400',
      '401',
      '403',
      '404',
      '409',
      '422',
    ]);
  });
});
