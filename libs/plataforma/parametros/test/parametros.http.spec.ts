import 'reflect-metadata';
import type { CanActivate, ExecutionContext, INestApplication } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import request from 'supertest';
import { NotFoundError } from '@vitrina/plataforma/kernel';
import { ActorSinAlcanceError, ConfirmacionRequeridaError, PERMISO } from '@vitrina/plataforma/seguridad';
import { ConsultarNiveles } from '../src/application/consultar-niveles.js';
import { FijarValor, type FijarValorComando } from '../src/application/fijar-valor.js';
import { ListarParametros } from '../src/application/listar-parametros.js';
import { RestablecerValor, type RestablecerValorComando } from '../src/application/restablecer-valor.js';
import { DefinicionParametro } from '../src/domain/definicion-parametro.js';
import { AlcanceNoPermitidoError, ParametroNoDefinidoError, ParametroObsoletoError, ValorInvalidoError } from '../src/domain/errores.js';
import { ParametrosController } from '../src/interface/parametros.controller.js';

const ANA = '0193f3a0-0000-7000-8000-000000000901';
const JOCKEY = '0193f3a0-0000-7000-8000-000000000101';
const PROPINA = 'rest.propina.porcentaje';
const MODIFICADO_EN = new Date('2026-10-24T15:00:00.000Z');

const propina = DefinicionParametro.reconstituir({
  codigo: PROPINA,
  productoCodigo: 'REST',
  descripcion: 'Porcentaje de propina sugerida',
  tipo: 'NUMERO',
  valorDefecto: 10,
  alcanceMaximo: 'SUCURSAL',
  esquema: { minimum: 0, maximum: 20 },
  obsoleto: false,
});

/** Hace lo que deja PermisoGuard: el principal en la solicitud (la autorización real se prueba en seguridad). */
class PrincipalDePrueba implements CanActivate {
  canActivate(contexto: ExecutionContext): boolean {
    contexto.switchToHttp().getRequest().principal = { usuarioId: ANA, tenantId: '0193f3a0-0000-7000-8000-000000000001' };
    return true;
  }
}

describe('HTTP /v1/cfg/parametros (TR-RF-031 a 033)', () => {
  let app: INestApplication;
  let fallo: Error | null;
  const comandos: { fijar: FijarValorComando[]; restablecer: RestablecerValorComando[] } = { fijar: [], restablecer: [] };
  const http = () => request(app.getHttpServer());
  const lanzarSiFalla = () => {
    if (fallo) throw fallo;
  };

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({
      controllers: [ParametrosController],
      providers: [
        {
          provide: ListarParametros,
          useValue: { ejecutar: async () => [{ definicion: propina, efectivo: { valor: 0, origen: 'SUCURSAL' } }] },
        },
        {
          provide: ConsultarNiveles,
          useValue: {
            ejecutar: async (codigo: string) => {
              if (codigo !== PROPINA) throw new ParametroNoDefinidoError(codigo);
              return {
                definicion: propina,
                niveles: [{ alcance: 'SUCURSAL', empresaId: null, sucursalId: JOCKEY, entidadNombre: 'Food court Jockey', valor: 0, modificadoPor: ANA, modificadoEn: MODIFICADO_EN, fueraDeAlcance: false }],
              };
            },
          },
        },
        {
          provide: FijarValor,
          useValue: {
            ejecutar: async (comando: FijarValorComando) => {
              comandos.fijar.push(comando);
              lanzarSiFalla();
              return { alcance: comando.alcance, empresaId: null, sucursalId: comando.sucursalId ?? null, valor: comando.valor, modificadoEn: MODIFICADO_EN, cambiado: true };
            },
          },
        },
        {
          provide: RestablecerValor,
          useValue: {
            ejecutar: async (comando: RestablecerValorComando) => {
              comandos.restablecer.push(comando);
              if (!comando.confirmar) throw new ConfirmacionRequeridaError();
              lanzarSiFalla();
              return { efectivo: { valor: 10, origen: 'TENANT' } };
            },
          },
        },
      ],
    }).compile();
    app = modulo.createNestApplication({ logger: false });
    app.useGlobalGuards(new PrincipalDePrueba());
    app.setGlobalPrefix('v1');
    await app.init();
  });

  beforeEach(() => {
    fallo = null;
    comandos.fijar.length = 0;
    comandos.restablecer.length = 0;
  });

  afterAll(() => app?.close());

  it('GET lista con el efectivo en snake_case', async () => {
    const respuesta = await http().get('/v1/cfg/parametros?producto=REST&q=propina');
    expect(respuesta.status).toBe(200);
    expect(respuesta.body).toEqual([
      {
        codigo: PROPINA,
        producto_codigo: 'REST',
        descripcion: 'Porcentaje de propina sugerida',
        tipo: 'NUMERO',
        alcance_maximo: 'SUCURSAL',
        valor_defecto: 10,
        esquema: { minimum: 0, maximum: 20 },
        obsoleto: false,
        efectivo: { valor: 0, origen: 'SUCURSAL' },
      },
    ]);
  });

  it('GET por código devuelve la definición y los niveles', async () => {
    const respuesta = await http().get(`/v1/cfg/parametros/${PROPINA}`);
    expect(respuesta.status).toBe(200);
    expect(respuesta.body.niveles).toEqual([
      { alcance: 'SUCURSAL', empresa_id: null, sucursal_id: JOCKEY, entidad_nombre: 'Food court Jockey', valor: 0, modificado_por: ANA, modificado_en: MODIFICADO_EN.toISOString(), fuera_de_alcance: false },
    ]);
  });

  it('GET de un código inexistente da 404 PARAMETRO_NO_DEFINIDO', async () => {
    const respuesta = await http().get('/v1/cfg/parametros/rest.mesa.color');
    expect(respuesta.status).toBe(404);
    expect(respuesta.body).toEqual({ codigo: 'PARAMETRO_NO_DEFINIDO', mensaje: 'El parámetro rest.mesa.color no está definido' });
  });

  it('PUT fija el valor con el actor del token', async () => {
    const respuesta = await http().put(`/v1/cfg/parametros/${PROPINA}/valores`).send({ alcance: 'SUCURSAL', sucursal_id: JOCKEY, valor: 0 });
    expect(respuesta.status).toBe(200);
    expect(respuesta.body).toEqual({ alcance: 'SUCURSAL', empresa_id: null, sucursal_id: JOCKEY, valor: 0, modificado_en: MODIFICADO_EN.toISOString(), cambiado: true });
    expect(comandos.fijar[0]).toEqual({ codigo: PROPINA, alcance: 'SUCURSAL', empresaId: undefined, sucursalId: JOCKEY, valor: 0, actorId: ANA });
  });

  it.each([
    [{ sucursal_id: JOCKEY, valor: 0 }, ['alcance']],
    [{ alcance: 'UNIDAD', valor: 0 }, ['alcance']],
    [{ alcance: 'SUCURSAL', sucursal_id: 'no-es-uuid', valor: 0 }, ['sucursal_id']],
    [{ alcance: 'TENANT' }, ['valor']],
  ])('PUT con %j da 400 SOLICITUD_INVALIDA en %j', async (cuerpo, errores) => {
    const respuesta = await http().put(`/v1/cfg/parametros/${PROPINA}/valores`).send(cuerpo);
    expect(respuesta.status).toBe(400);
    expect(respuesta.body).toEqual({ codigo: 'SOLICITUD_INVALIDA', errores });
    expect(comandos.fijar).toEqual([]);
  });

  it.each([
    [new AlcanceNoPermitidoError('EMPRESA'), 400, 'ALCANCE_NO_PERMITIDO', 'Este parámetro se configura como máximo a nivel de empresa'],
    [new ValorInvalidoError('El valor debe estar entre 0 y 20'), 400, 'VALOR_INVALIDO', 'El valor debe estar entre 0 y 20'],
    [new ActorSinAlcanceError(), 403, 'ACTOR_SIN_ALCANCE', undefined],
    [new NotFoundError('La sucursal no existe'), 404, 'NO_ENCONTRADO', 'La sucursal no existe'],
    [new ParametroObsoletoError(PROPINA), 409, 'PARAMETRO_OBSOLETO', undefined],
  ])('PUT traduce %s a %i %s', async (error, estado, codigo, mensaje) => {
    fallo = error;
    const respuesta = await http().put(`/v1/cfg/parametros/${PROPINA}/valores`).send({ alcance: 'SUCURSAL', sucursal_id: JOCKEY, valor: 25 });
    expect(respuesta.status).toBe(estado);
    expect(respuesta.body.codigo).toBe(codigo);
    if (mensaje) expect(respuesta.body.mensaje).toBe(mensaje);
  });

  it('DELETE con confirmar=true restablece y devuelve lo que hereda', async () => {
    const respuesta = await http().delete(`/v1/cfg/parametros/${PROPINA}/valores?alcance=SUCURSAL&sucursal_id=${JOCKEY}&confirmar=true`);
    expect(respuesta.status).toBe(200);
    expect(respuesta.body).toEqual({ efectivo: { valor: 10, origen: 'TENANT' } });
    expect(comandos.restablecer[0]).toMatchObject({ codigo: PROPINA, alcance: 'SUCURSAL', sucursalId: JOCKEY, confirmar: true, actorId: ANA });
  });

  it('DELETE sin confirmar da 400 CONFIRMACION_REQUERIDA', async () => {
    const respuesta = await http().delete(`/v1/cfg/parametros/${PROPINA}/valores?alcance=SUCURSAL&sucursal_id=${JOCKEY}`);
    expect(respuesta.status).toBe(400);
    expect(respuesta.body.codigo).toBe('CONFIRMACION_REQUERIDA');
  });

  it('cada ruta exige su permiso: leer en los GET, editar en PUT y DELETE', () => {
    const reflector = new Reflector();
    const permisoDe = (metodo: keyof ParametrosController) => reflector.get(PERMISO, ParametrosController.prototype[metodo]);
    expect([permisoDe('listar'), permisoDe('niveles'), permisoDe('fijar'), permisoDe('restablecer')]).toEqual([
      'plat.parametro.leer',
      'plat.parametro.leer',
      'plat.parametro.editar',
      'plat.parametro.editar',
    ]);
  });

  it('las 4 rutas están en OpenAPI con sus códigos de error', () => {
    const documento = SwaggerModule.createDocument(app, new DocumentBuilder().addBearerAuth().build());
    const rutas = documento.paths;
    expect(Object.keys(rutas).sort()).toEqual(['/v1/cfg/parametros', '/v1/cfg/parametros/{codigo}', '/v1/cfg/parametros/{codigo}/valores']);
    expect(Object.keys(rutas['/v1/cfg/parametros/{codigo}/valores']).sort()).toEqual(['delete', 'put']);
    expect(Object.keys(rutas['/v1/cfg/parametros/{codigo}/valores'].put?.responses ?? {}).sort()).toEqual(['200', '400', '403', '404', '409']);
    expect(Object.keys(rutas['/v1/cfg/parametros/{codigo}'].get?.responses ?? {}).sort()).toEqual(['200', '403', '404']);
  });
});
