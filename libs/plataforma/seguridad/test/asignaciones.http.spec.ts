import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { ConflictError, NotFoundError } from '@vitrina/plataforma/kernel';
import { OtorgarAsignacion } from '../src/application/otorgar-asignacion.js';
import { MembresiaNoAsignableError, MfaRequeridaError, OtorganteSinAlcanceError, RolOPerfilError, VigenciaInvalidaError } from '../src/domain/errores.js';
import { PERMISO } from '../src/interface/decoradores.js';
import { AsignacionesController } from '../src/interface/asignaciones.controller.js';
import { MFA_MAX_EDAD_SEG } from '../src/interface/mi-contexto.controller.js';
import { ANA, Doble, PrincipalDePrueba } from './support/dobles-http.js';

const MEMBRESIA_LUIS = '0193f3a0-0000-7000-8000-000000000301';
const ASIGNACION = '0193f3a0-0000-7000-8000-000000000401';
const CAJERO = '0193f3a0-0000-7000-8000-000000000501';
const CAJA_02 = '0193f3a0-0000-7000-8000-000000000201';

const cuerpoCaja02 = { membresia_id: MEMBRESIA_LUIS, rol_id: CAJERO, alcance: 'UNIDAD', unidad_id: CAJA_02, vigente_desde: '2026-10-15', vigente_hasta: '2026-10-31' };

/** Ruta, validación y errores sin base: el caso de uso es un doble. */
describe('POST /seg/asignaciones (HTTP, sin base)', () => {
  let app: INestApplication;
  const otorgar = new Doble();
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({
      controllers: [AsignacionesController],
      providers: [
        { provide: APP_GUARD, useClass: PrincipalDePrueba },
        { provide: MFA_MAX_EDAD_SEG, useValue: 900 },
        { provide: OtorgarAsignacion, useValue: otorgar },
      ],
    }).compile();
    app = modulo.createNestApplication({ logger: false });
    await app.init();
  });

  afterAll(() => app.close());

  beforeEach(() => otorgar.reiniciar());

  it('lleva plat.asignacion.otorgar', () => {
    expect(Reflect.getMetadata(PERMISO, AsignacionesController.prototype.otorgar)).toBe('plat.asignacion.otorgar');
  });

  it('201 con asignacion_id; el otorgante es el sub y sin MFA vigente (aal1)', async () => {
    otorgar.responde({ asignacionId: ASIGNACION });

    const respuesta = await http().post('/seg/asignaciones').send(cuerpoCaja02);

    expect(respuesta.status).toBe(201);
    expect(respuesta.body).toEqual({ asignacion_id: ASIGNACION });
    expect(otorgar.llamadas).toEqual([
      {
        membresiaId: MEMBRESIA_LUIS,
        rolId: CAJERO,
        perfilId: null,
        alcance: 'UNIDAD',
        empresaId: null,
        sucursalId: null,
        unidadId: CAJA_02,
        vigenteDesde: '2026-10-15',
        vigenteHasta: '2026-10-31',
        otorgante: { usuarioId: ANA, mfaVigente: false },
      },
    ]);
  });

  it('sin vigencias las pasa en null: vigente_desde la pone el dominio (hoy)', async () => {
    otorgar.responde({ asignacionId: ASIGNACION });

    await http().post('/seg/asignaciones').send({ membresia_id: MEMBRESIA_LUIS, rol_id: CAJERO, alcance: 'TENANT' });

    expect(otorgar.llamadas).toEqual([expect.objectContaining({ alcance: 'TENANT', vigenteDesde: null, vigenteHasta: null })]);
  });

  it('400 SOLICITUD_INVALIDA nombra los campos sin llamar al caso de uso', async () => {
    const respuesta = await http()
      .post('/seg/asignaciones')
      .send({ membresia_id: 'no-uuid', rol_id: CAJERO, alcance: 'GALAXIA', vigente_desde: '15/10/2026' });

    expect(respuesta.status).toBe(400);
    expect(respuesta.body).toEqual({ codigo: 'SOLICITUD_INVALIDA', errores: expect.arrayContaining(['membresia_id', 'alcance', 'vigente_desde']) });
    expect(otorgar.llamadas).toEqual([]);
  });

  it.each([
    [new RolOPerfilError(), 400, 'ASIGNACION_ROL_O_PERFIL', 'Seleccione un rol o un perfil, no ambos'],
    [new VigenciaInvalidaError(), 400, 'VIGENCIA_INVALIDA', 'La vigencia hasta no puede ser anterior a la vigencia desde'],
    [new OtorganteSinAlcanceError(), 403, 'OTORGANTE_SIN_ALCANCE', 'El otorgante no tiene un alcance igual o mayor sobre el destino'],
    [new NotFoundError('La membresía no existe'), 404, 'NO_ENCONTRADO', 'La membresía no existe'],
    [new MembresiaNoAsignableError('SUSPENDIDO'), 409, 'MEMBRESIA_NO_ASIGNABLE', 'La membresía está SUSPENDIDO: solo se asigna a una membresía ACTIVO o INVITADO'],
    [new ConflictError('El rol está inactivo u obsoleto'), 409, 'CONFLICTO', 'El rol está inactivo u obsoleto'],
  ])('%s responde %i con {codigo, mensaje}', async (error, estado, codigo, mensaje) => {
    otorgar.falla(error);

    const respuesta = await http().post('/seg/asignaciones').send(cuerpoCaja02);

    expect(respuesta.status).toBe(estado);
    expect(respuesta.body).toEqual({ codigo, mensaje });
  });

  it('MFA_REQUERIDA del caso de uso responde 401 con el step-up', async () => {
    otorgar.falla(new MfaRequeridaError(900));

    const respuesta = await http().post('/seg/asignaciones').send(cuerpoCaja02);

    expect(respuesta.status).toBe(401);
    expect(respuesta.body).toEqual({ codigo: 'MFA_REQUERIDA', max_edad: 900 });
    expect(respuesta.headers['www-authenticate']).toContain('acr_values="aal2"');
  });
});
