import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { NotFoundError, type UnitOfWork } from '@vitrina/plataforma/kernel';
import { ConsultarBitacora, ConsultarEventoSeguridad } from '../src/application/lecturas-bitacora.js';
import type { EventoBitacora, FiltroBitacora, LecturaBitacora } from '../src/application/ports/lectura-bitacora.js';
import { RangoBitacoraInvalidoError } from '../src/domain/errores.js';
import { BitacoraController } from '../src/interface/bitacora.controller.js';
import { PERMISO } from '../src/interface/decoradores.js';
import { Doble, PrincipalDePrueba } from './support/dobles-http.js';

const USUARIO = '0193f3a0-0000-7000-8000-000000000901';

const denegado: EventoBitacora = {
  id: '1042',
  tipo: 'ACCESO_DENEGADO',
  ocurridoEn: new Date('2026-10-30T15:00:00Z'),
  usuario: { id: USUARIO, nombre: 'Ana Torres', correo: 'ana.torres@saboresdelsur.pe' },
  resumen: 'plat.rol.gestionar',
};

describe('ConsultarBitacora: rango obligatorio de hasta 92 días', () => {
  const filtros: FiltroBitacora[] = [];
  const lectura: LecturaBitacora = {
    listar: async (filtro) => {
      filtros.push(filtro);
      return { items: [], total: 0 };
    },
    detalle: async () => null,
  };
  const unidadDeTrabajo = { run: <T>(trabajo: () => Promise<T>) => trabajo() } as UnitOfWork;
  const consultar = new ConsultarBitacora({ unidadDeTrabajo, lectura });
  const pagina = { pagina: 1, tamano: 20 };

  it.each([
    ['sin desde', { hasta: '2026-10-31' }],
    ['sin hasta', { desde: '2026-10-01' }],
    ['desde posterior a hasta', { desde: '2026-10-31', hasta: '2026-10-01' }],
    ['fecha que no existe', { desde: '2026-02-30', hasta: '2026-03-02' }],
    ['formato distinto', { desde: '01/10/2026', hasta: '2026-10-31' }],
    ['93 días', { desde: '2026-08-01', hasta: '2026-11-01' }],
  ])('%s da RangoBitacoraInvalidoError', async (_caso, rango) => {
    await expect(consultar.ejecutar({ ...pagina, ...rango })).rejects.toThrow(RangoBitacoraInvalidoError);
  });

  it('acepta un solo día y 92 días justos', async () => {
    await consultar.ejecutar({ ...pagina, desde: '2026-10-31', hasta: '2026-10-31' });
    await consultar.ejecutar({ ...pagina, desde: '2026-08-02', hasta: '2026-11-01', tipo: 'ACCESO_SOPORTE', usuario: 'ana' });
    expect(filtros.at(-1)).toEqual({ ...pagina, desde: '2026-08-02', hasta: '2026-11-01', tipo: 'ACCESO_SOPORTE', usuario: 'ana' });
  });

  it('el detalle que no existe en el tenant da NotFoundError', async () => {
    await expect(new ConsultarEventoSeguridad({ unidadDeTrabajo, lectura }).ejecutar('7')).rejects.toThrow(NotFoundError);
  });
});

/** Rutas, validación y mapeo sin base: los casos de uso son dobles. */
describe('Rutas de la bitácora (HTTP, sin base)', () => {
  let app: INestApplication;
  const casos = { listar: new Doble(), consultar: new Doble() };
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({
      controllers: [BitacoraController],
      providers: [
        { provide: APP_GUARD, useClass: PrincipalDePrueba },
        { provide: ConsultarBitacora, useValue: casos.listar },
        { provide: ConsultarEventoSeguridad, useValue: casos.consultar },
      ],
    }).compile();
    app = modulo.createNestApplication({ logger: false });
    await app.init();
  });

  afterAll(() => app.close());

  beforeEach(() => {
    for (const caso of Object.values(casos)) caso.reiniciar();
  });

  it('las dos rutas llevan plat.seguridad.bitacora', () => {
    const permiso = (metodo: 'listar' | 'consultar') => Reflect.getMetadata(PERMISO, BitacoraController.prototype[metodo]);
    expect(permiso('listar')).toBe('plat.seguridad.bitacora');
    expect(permiso('consultar')).toBe('plat.seguridad.bitacora');
  });

  it('GET /seg/bitacora responde { items, total } en snake_case y pasa el filtro', async () => {
    casos.listar.responde({ items: [denegado], total: 15 });

    const respuesta = await http().get('/seg/bitacora').query({ desde: '2026-10-27', hasta: '2026-11-02', tipo: 'ACCESO_DENEGADO', usuario: ' ana ' });

    expect(respuesta.status).toBe(200);
    expect(respuesta.body).toEqual({
      items: [
        {
          id: '1042',
          tipo: 'ACCESO_DENEGADO',
          ocurrido_en: '2026-10-30T15:00:00.000Z',
          usuario: { id: USUARIO, nombre: 'Ana Torres', correo: 'ana.torres@saboresdelsur.pe' },
          resumen: 'plat.rol.gestionar',
        },
      ],
      total: 15,
    });
    expect(casos.listar.llamadas).toEqual([
      { desde: '2026-10-27', hasta: '2026-11-02', tipo: 'ACCESO_DENEGADO', usuario: 'ana', pagina: 1, tamano: 20 },
    ]);
  });

  it('usuario vacío no filtra', async () => {
    casos.listar.responde({ items: [], total: 0 });
    await http().get('/seg/bitacora').query({ desde: '2026-10-27', hasta: '2026-11-02', usuario: '' });
    expect(casos.listar.llamadas[0]).toMatchObject({ usuario: undefined });
  });

  it('el rango inválido sale como 400 RANGO_BITACORA_INVALIDO', async () => {
    casos.listar.falla(new RangoBitacoraInvalidoError());

    const respuesta = await http().get('/seg/bitacora');

    expect(respuesta.status).toBe(400);
    expect(respuesta.body).toEqual({ codigo: 'RANGO_BITACORA_INVALIDO', mensaje: 'El rango debe tener fecha inicial y final, en orden, de hasta 92 días' });
  });

  it.each([
    ['tipo fuera del catálogo', { tipo: 'OTRO' }],
    ['usuario de 1 carácter', { usuario: 'a' }],
    ['tamano mayor a 100', { tamano: 101 }],
    ['página 0', { pagina: 0 }],
  ])('%s da 400 SOLICITUD_INVALIDA', async (_caso, query) => {
    const respuesta = await http().get('/seg/bitacora').query({ desde: '2026-10-27', hasta: '2026-11-02', ...query });
    expect(respuesta.status).toBe(400);
    expect(respuesta.body.codigo).toBe('SOLICITUD_INVALIDA');
    expect(casos.listar.llamadas).toEqual([]);
  });

  it('GET /seg/bitacora/:id trae IP y detalle', async () => {
    casos.consultar.responde({ ...denegado, ip: '10.0.0.7', detalle: { permiso: 'plat.rol.gestionar', ruta: '/v1/seg/roles' } });

    const respuesta = await http().get('/seg/bitacora/1042');

    expect(respuesta.status).toBe(200);
    expect(respuesta.body).toMatchObject({ id: '1042', ip: '10.0.0.7', detalle: { permiso: 'plat.rol.gestionar', ruta: '/v1/seg/roles' } });
    expect(casos.consultar.llamadas).toEqual(['1042']);
  });

  it('un id que no es número o no cabe en bigint da 404 sin consultar', async () => {
    for (const id of ['abc', '1e3', '9'.repeat(19)]) {
      const respuesta = await http().get(`/seg/bitacora/${id}`);
      expect(respuesta.status).toBe(404);
      expect(respuesta.body.codigo).toBe('NO_ENCONTRADO');
    }
    expect(casos.consultar.llamadas).toEqual([]);
  });

  it('el evento de otro tenant sale como 404 NO_ENCONTRADO', async () => {
    casos.consultar.falla(new NotFoundError('El evento no existe'));
    const respuesta = await http().get('/seg/bitacora/77');
    expect(respuesta.status).toBe(404);
    expect(respuesta.body).toEqual({ codigo: 'NO_ENCONTRADO', mensaje: 'El evento no existe' });
  });
});
