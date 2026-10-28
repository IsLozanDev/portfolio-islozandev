import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { NotFoundError } from '@vitrina/plataforma/kernel';
import { ConsultarMiembro, ListarAsignables, ListarMiembros } from '../src/application/lecturas-miembros.js';
import type { MiembroDetalle, MiembroListado } from '../src/application/ports/lectura-miembros.js';
import { PERMISO } from '../src/interface/decoradores.js';
import { MiembrosController } from '../src/interface/miembros.controller.js';
import { Doble, PrincipalDePrueba } from './support/dobles-http.js';

const MEMBRESIA = '0193f3a0-0000-7000-8000-000000000301';
const USUARIO = '0193f3a0-0000-7000-8000-000000000302';
const ASIGNACION = '0193f3a0-0000-7000-8000-000000000401';
const ROL = '0193f3a0-0000-7000-8000-000000000501';
const CAJA_02 = '0193f3a0-0000-7000-8000-000000000201';

const rosa: MiembroListado = {
  membresiaId: MEMBRESIA,
  usuarioId: USUARIO,
  nombre: 'Rosa Huamán',
  correo: 'rosa.huaman@gmail.com',
  estado: 'INVITADO',
  esPropietario: false,
  asignacionesVigentes: 1,
  invitacionExpiraEn: new Date('2026-10-23T15:00:00Z'),
};

const detalleDeRosa: MiembroDetalle = {
  ...rosa,
  desde: new Date('2026-10-20T15:00:00Z'),
  hasta: null,
  asignaciones: [
    {
      id: ASIGNACION,
      rol: { id: ROL, nombre: 'Cajero' },
      perfil: null,
      alcance: 'UNIDAD',
      empresa: null,
      sucursal: null,
      unidad: { id: CAJA_02, nombre: 'CAJA-02' },
      vigenteDesde: '2026-10-15',
      vigenteHasta: '2026-10-31',
      estado: 'VIGENTE',
      revocadaEn: null,
      motivoRevocacion: null,
    },
  ],
};

/** Rutas, validación y mapeo sin base: los casos de uso son dobles. */
describe('Rutas de miembros y asignables (HTTP, sin base)', () => {
  let app: INestApplication;
  const casos = { listar: new Doble(), consultar: new Doble(), asignables: new Doble() };
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({
      controllers: [MiembrosController],
      providers: [
        { provide: APP_GUARD, useClass: PrincipalDePrueba },
        { provide: ListarMiembros, useValue: casos.listar },
        { provide: ConsultarMiembro, useValue: casos.consultar },
        { provide: ListarAsignables, useValue: casos.asignables },
      ],
    }).compile();
    app = modulo.createNestApplication({ logger: false });
    await app.init();
  });

  afterAll(() => app.close());

  beforeEach(() => {
    for (const caso of Object.values(casos)) caso.reiniciar();
  });

  it('las tres rutas llevan plat.usuario.invitar', () => {
    const permiso = (metodo: 'listar' | 'consultar' | 'asignables') => Reflect.getMetadata(PERMISO, MiembrosController.prototype[metodo]);
    expect(permiso('listar')).toBe('plat.usuario.invitar');
    expect(permiso('consultar')).toBe('plat.usuario.invitar');
    expect(permiso('asignables')).toBe('plat.usuario.invitar');
  });

  describe('GET /seg/miembros', () => {
    it('responde { items, total } en snake_case con los valores por defecto del filtro', async () => {
      casos.listar.responde({ items: [rosa], total: 21 });

      const respuesta = await http().get('/seg/miembros');

      expect(respuesta.status).toBe(200);
      expect(respuesta.body).toEqual({
        items: [
          {
            membresia_id: MEMBRESIA,
            usuario_id: USUARIO,
            nombre: 'Rosa Huamán',
            correo: 'rosa.huaman@gmail.com',
            estado: 'INVITADO',
            es_propietario: false,
            asignaciones_vigentes: 1,
            invitacion_expira_en: '2026-10-23T15:00:00.000Z',
          },
        ],
        total: 21,
      });
      expect(casos.listar.llamadas).toEqual([{ estado: undefined, busqueda: undefined, orden: 'nombre', direccion: 'asc', pagina: 1, tamano: 20 }]);
    });

    it('pasa estado, búsqueda recortada, orden, dirección y página', async () => {
      casos.listar.responde({ items: [], total: 0 });

      await http().get('/seg/miembros').query({ estado: 'ACTIVO', busqueda: '  pared  ', orden: 'correo', direccion: 'desc', pagina: '3', tamano: '50' });
      await http().get('/seg/miembros').query({ busqueda: '   ' });

      expect(casos.listar.llamadas).toEqual([
        { estado: 'ACTIVO', busqueda: 'pared', orden: 'correo', direccion: 'desc', pagina: 3, tamano: 50 },
        { estado: undefined, busqueda: undefined, orden: 'nombre', direccion: 'asc', pagina: 1, tamano: 20 },
      ]);
    });

    it.each([
      [{ tamano: '101' }, 'tamano'],
      [{ pagina: '0' }, 'pagina'],
      [{ orden: 'creado_en' }, 'orden'],
      [{ direccion: 'arriba' }, 'direccion'],
      [{ estado: 'BORRADO' }, 'estado'],
    ])('400 SOLICITUD_INVALIDA con %o', async (consulta, campo) => {
      const respuesta = await http().get('/seg/miembros').query(consulta);

      expect(respuesta.status).toBe(400);
      expect(respuesta.body).toEqual({ codigo: 'SOLICITUD_INVALIDA', errores: [campo] });
      expect(casos.listar.llamadas).toEqual([]);
    });
  });

  describe('GET /seg/miembros/:membresiaId', () => {
    it('responde el detalle con sus asignaciones en snake_case', async () => {
      casos.consultar.responde(detalleDeRosa);

      const respuesta = await http().get(`/seg/miembros/${MEMBRESIA}`);

      expect(respuesta.status).toBe(200);
      expect(respuesta.body).toMatchObject({ membresia_id: MEMBRESIA, desde: '2026-10-20T15:00:00.000Z', hasta: null });
      expect(respuesta.body.asignaciones).toEqual([
        {
          id: ASIGNACION,
          rol: { id: ROL, nombre: 'Cajero' },
          perfil: null,
          alcance: 'UNIDAD',
          empresa: null,
          sucursal: null,
          unidad: { id: CAJA_02, nombre: 'CAJA-02' },
          vigente_desde: '2026-10-15',
          vigente_hasta: '2026-10-31',
          estado: 'VIGENTE',
          revocada_en: null,
          motivo_revocacion: null,
        },
      ]);
      expect(casos.consultar.llamadas).toEqual([MEMBRESIA]);
    });

    it('404 NO_ENCONTRADO si no existe en el tenant', async () => {
      casos.consultar.falla(new NotFoundError('La membresía no existe'));

      const respuesta = await http().get(`/seg/miembros/${MEMBRESIA}`);

      expect(respuesta.status).toBe(404);
      expect(respuesta.body).toEqual({ codigo: 'NO_ENCONTRADO', mensaje: 'La membresía no existe' });
    });

    it('un id que no es UUID da el mismo 404 sin llamar al caso de uso', async () => {
      const respuesta = await http().get('/seg/miembros/no-es-uuid');

      expect(respuesta.status).toBe(404);
      expect(respuesta.body).toEqual({ codigo: 'NO_ENCONTRADO', mensaje: 'La membresía no existe' });
      expect(casos.consultar.llamadas).toEqual([]);
    });
  });

  it('GET /seg/asignables responde roles y perfiles en snake_case', async () => {
    casos.asignables.responde({
      roles: [{ id: ROL, codigo: 'CAJERO', nombre: 'Cajero', productoCodigo: 'REST', sensible: false }],
      perfiles: [{ id: ASIGNACION, codigo: 'TURNO', nombre: 'Turno', sensible: true }],
    });

    const respuesta = await http().get('/seg/asignables');

    expect(respuesta.status).toBe(200);
    expect(respuesta.body).toEqual({
      roles: [{ id: ROL, codigo: 'CAJERO', nombre: 'Cajero', producto_codigo: 'REST', sensible: false }],
      perfiles: [{ id: ASIGNACION, codigo: 'TURNO', nombre: 'Turno', sensible: true }],
    });
  });
});
