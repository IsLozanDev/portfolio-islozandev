import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { NotFoundError } from '@vitrina/plataforma/kernel';
import { AceptarInvitacion, ConsultarInvitacion } from '../src/application/aceptar-invitacion.js';
import { InvitarUsuario } from '../src/application/invitar-usuario.js';
import { FinalizarMembresia, ReactivarMembresia, RevocarAsignacion, SuspenderMembresia } from '../src/application/membresia.casos-de-uso.js';
import {
  AlcanceSuperiorError,
  ConfirmacionRequeridaError,
  IdentidadNoDisponibleError,
  InvitacionExpiradaError,
  InvitacionOtroCorreoError,
  LimiteUsuariosError,
  MfaRequeridaError,
  MotivoInvalidoError,
  PropietarioUnicoError,
} from '../src/domain/errores.js';
import { PERMISO, PUBLICO } from '../src/interface/decoradores.js';
import { InvitacionesController } from '../src/interface/invitaciones.controller.js';
import { MembresiasController } from '../src/interface/membresias.controller.js';
import { LIMITE_TASA, LimiteTasaGuard } from '../src/interface/membresias.http.js';
import { MFA_MAX_EDAD_SEG } from '../src/interface/mi-contexto.controller.js';
import { ANA, Doble, PrincipalDePrueba } from './support/dobles-http.js';

const MEMBRESIA = '0193f3a0-0000-7000-8000-000000000301';
const SUCURSAL = '0193f3a0-0000-7000-8000-000000000101';
const ROL = '0193f3a0-0000-7000-8000-000000000501';

/** Rutas, validación, errores y límite de tasa sin base: los casos de uso son dobles. */
describe('Rutas de invitaciones y membresías (HTTP, sin base)', () => {
  let app: INestApplication;
  const casos = {
    invitar: new Doble(),
    consultar: new Doble(),
    aceptar: new Doble(),
    suspender: new Doble(),
    reactivar: new Doble(),
    finalizar: new Doble(),
    revocar: new Doble(),
  };
  const http = () => request(app.getHttpServer());
  const cuerpoInvitar = { correo: 'rosa.huaman@gmail.com', nombre: 'Rosa Huamán', rol_id: ROL, alcance: 'SUCURSAL', sucursal_id: SUCURSAL };

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({
      controllers: [InvitacionesController, MembresiasController],
      providers: [
        { provide: LIMITE_TASA, useValue: { limite: 10, ventanaMs: 60_000 } },
        LimiteTasaGuard,
        { provide: APP_GUARD, useClass: PrincipalDePrueba },
        { provide: MFA_MAX_EDAD_SEG, useValue: 900 },
        { provide: InvitarUsuario, useValue: casos.invitar },
        { provide: ConsultarInvitacion, useValue: casos.consultar },
        { provide: AceptarInvitacion, useValue: casos.aceptar },
        { provide: SuspenderMembresia, useValue: casos.suspender },
        { provide: ReactivarMembresia, useValue: casos.reactivar },
        { provide: FinalizarMembresia, useValue: casos.finalizar },
        { provide: RevocarAsignacion, useValue: casos.revocar },
      ],
    }).compile();
    app = modulo.createNestApplication({ logger: false });
    await app.init();
  });

  afterAll(() => app.close());

  beforeEach(() => {
    for (const c of Object.values(casos)) c.reiniciar();
  });

  it('cada ruta lleva su permiso; las de aceptar no llevan @Permiso y el GET es público', () => {
    const permiso = (c: object, m: string) => Reflect.getMetadata(PERMISO, (c as Record<string, object>)[m]);
    const i = InvitacionesController.prototype;
    const m = MembresiasController.prototype;
    expect(permiso(i, 'invitar')).toBe('plat.usuario.invitar');
    expect(permiso(i, 'aceptar')).toBeUndefined();
    expect(permiso(i, 'consultar')).toBeUndefined();
    expect(Reflect.getMetadata(PUBLICO, i.consultar)).toBe(true);
    expect(Reflect.getMetadata(PUBLICO, i.aceptar)).toBeUndefined();
    for (const accion of ['suspender', 'reactivar', 'finalizar', 'revocar']) expect(permiso(m, accion)).toBe('plat.asignacion.revocar');
  });

  describe('POST /seg/invitaciones', () => {
    it('201 con la respuesta del spec; el otorgante es el sub y sin MFA vigente', async () => {
      casos.invitar.responde({
        membresiaId: MEMBRESIA,
        invitacionId: ROL,
        expiraEn: new Date('2026-10-25T15:00:00Z'),
        usuarioNuevo: true,
        correoEnviado: true,
      });

      const res = await http().post('/seg/invitaciones').send(cuerpoInvitar);

      expect(res.status).toBe(201);
      expect(res.body).toEqual({ membresia_id: MEMBRESIA, invitacion_id: ROL, expira_en: '2026-10-25T15:00:00.000Z', usuario_nuevo: true, correo_enviado: true });
      expect(casos.invitar.llamadas).toEqual([{
        correo: 'rosa.huaman@gmail.com',
        nombre: 'Rosa Huamán',
        rolId: ROL,
        perfilId: null,
        alcance: 'SUCURSAL',
        empresaId: null,
        sucursalId: SUCURSAL,
        unidadId: null,
        vigenteHasta: null,
        otorgante: { usuarioId: ANA, mfaVigente: false },
      }]);
    });

    it('400 SOLICITUD_INVALIDA nombra los campos y no repite valores', async () => {
      const res = await http().post('/seg/invitaciones').send({ correo: 123, nombre: 'Rosa', alcance: 'GALAXIA', rol_id: 'no-uuid' });

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ codigo: 'SOLICITUD_INVALIDA', errores: expect.arrayContaining(['correo', 'alcance', 'rol_id']) });
      expect(JSON.stringify(res.body)).not.toContain('GALAXIA');
      expect(casos.invitar.llamadas).toEqual([]);
    });

    it.each([
      [new AlcanceSuperiorError(), 403, 'ALCANCE_SUPERIOR', 'No puede otorgar un alcance mayor al suyo'],
      [new LimiteUsuariosError('REST', 10), 409, 'LIMITE_USUARIOS', 'El plan de REST permite 10 usuarios'],
      [new IdentidadNoDisponibleError('over_email_send_rate_limit'), 503, 'IDENTIDAD_NO_DISPONIBLE', expect.any(String)],
      [new NotFoundError('El rol no existe'), 404, 'NO_ENCONTRADO', 'El rol no existe'],
    ])('%s responde %i con {codigo, mensaje}', async (error, estado, codigo, mensaje) => {
      casos.invitar.falla(error);

      const res = await http().post('/seg/invitaciones').send(cuerpoInvitar);

      expect(res.status).toBe(estado);
      expect(res.body).toEqual({ codigo, mensaje });
    });

    it('MFA_REQUERIDA responde 401 con el desafío step-up', async () => {
      casos.invitar.falla(new MfaRequeridaError(900));

      const res = await http().post('/seg/invitaciones').send(cuerpoInvitar);

      expect(res.status).toBe(401);
      expect(res.body).toEqual({ codigo: 'MFA_REQUERIDA', max_edad: 900 });
      expect(res.headers['www-authenticate']).toBe('Bearer error="insufficient_user_authentication", acr_values="aal2", max_age=900');
    });
  });

  describe('aceptar', () => {
    it('POST /seg/invitaciones/aceptar responde 200 con el token del cuerpo y el sub', async () => {
      casos.aceptar.responde({ tenantId: SUCURSAL, membresiaId: MEMBRESIA, refrescarSesion: true });

      const res = await http().post('/seg/invitaciones/aceptar').send({ token: 'abc' });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ tenant_id: SUCURSAL, membresia_id: MEMBRESIA, refrescar_sesion: true });
      expect(casos.aceptar.llamadas).toEqual([{ token: 'abc', usuarioId: ANA }]);
    });

    it('TR-CA-029 y TR-CA-030: 410 vencida y 403 otro correo, con los mensajes del SRS', async () => {
      casos.aceptar.fallaUnaVez(new InvitacionExpiradaError()).fallaUnaVez(new InvitacionOtroCorreoError());

      const vencida = await http().post('/seg/invitaciones/aceptar').send({ token: 'abc' });
      const otro = await http().post('/seg/invitaciones/aceptar').send({ token: 'abc' });

      expect([vencida.status, vencida.body]).toEqual([410, { codigo: 'INVITACION_EXPIRADA', mensaje: 'La invitación expiró; solicite una nueva al administrador' }]);
      expect([otro.status, otro.body]).toEqual([403, { codigo: 'INVITACION_OTRO_CORREO', mensaje: 'Esta invitación pertenece a otro correo' }]);
    });

    it('GET /seg/invitaciones/:token responde la vigente y la 11.ª petición del minuto da 429', async () => {
      casos.consultar.responde({ estado: 'VIGENTE', tenantNombre: 'Gym Sur', expiraEn: new Date('2026-10-25T15:00:00Z') });

      const respuestas = [];
      for (let i = 0; i < 11; i++) respuestas.push(await http().get('/seg/invitaciones/token-de-prueba'));

      expect(respuestas[0].status).toBe(200);
      expect(respuestas[0].body).toEqual({ estado: 'VIGENTE', tenant_nombre: 'Gym Sur', expira_en: '2026-10-25T15:00:00.000Z' });
      expect(respuestas.slice(0, 10).every((r) => r.status === 200)).toBe(true);
      expect(respuestas[10].status).toBe(429);
      expect(respuestas[10].body).toEqual({ codigo: 'DEMASIADAS_SOLICITUDES' });
      expect(Number(respuestas[10].headers['retry-after'])).toBeGreaterThan(0);
      expect(casos.consultar.llamadas).toHaveLength(10);
    });
  });

  describe('membresías y asignaciones', () => {
    it('suspender pasa motivo, confirmar y actor; sin confirmar llega false al caso de uso', async () => {
      casos.suspender.responde({ estado: 'SUSPENDIDO' });

      const res = await http().post(`/seg/membresias/${MEMBRESIA}/suspender`).send({ motivo: 'Licencia médica', confirmar: true });
      await http().post(`/seg/membresias/${MEMBRESIA}/suspender`).send({ motivo: 'Licencia médica' });

      expect([res.status, res.body]).toEqual([200, { estado: 'SUSPENDIDO' }]);
      expect(casos.suspender.llamadas).toEqual([
        { membresiaId: MEMBRESIA, motivo: 'Licencia médica', confirmar: true, actorId: ANA },
        { membresiaId: MEMBRESIA, motivo: 'Licencia médica', confirmar: false, actorId: ANA },
      ]);
    });

    it('finalizar, reactivar y revocar responden con su forma', async () => {
      casos.finalizar.responde({ estado: 'FINALIZADO', asignacionesRevocadas: [ROL] });
      casos.reactivar.responde({ estado: 'ACTIVO' });
      casos.revocar.responde({ revocadaEn: new Date('2026-10-22T15:00:00Z') });
      const cuerpo = { motivo: 'Cese', confirmar: true };

      expect((await http().post(`/seg/membresias/${MEMBRESIA}/finalizar`).send(cuerpo)).body).toEqual({ estado: 'FINALIZADO', asignaciones_revocadas: [ROL] });
      expect((await http().post(`/seg/membresias/${MEMBRESIA}/reactivar`).send(cuerpo)).body).toEqual({ estado: 'ACTIVO' });
      expect((await http().post(`/seg/asignaciones/${ROL}/revocar`).send(cuerpo)).body).toEqual({ revocada_en: '2026-10-22T15:00:00.000Z' });
      expect(casos.revocar.llamadas).toEqual([{ asignacionId: ROL, motivo: 'Cese', confirmar: true, actorId: ANA }]);
    });

    it.each([
      [new ConfirmacionRequeridaError(), 400, 'CONFIRMACION_REQUERIDA'],
      [new MotivoInvalidoError(), 400, 'MOTIVO_INVALIDO'],
      [new PropietarioUnicoError(), 409, 'PROPIETARIO_UNICO'],
    ])('%s responde %i', async (error, estado, codigo) => {
      casos.suspender.falla(error);

      const res = await http().post(`/seg/membresias/${MEMBRESIA}/suspender`).send({ motivo: 'Vacaciones', confirmar: true });

      expect(res.status).toBe(estado);
      expect(res.body.codigo).toBe(codigo);
    });

    it('un id que no es UUID responde 404 sin llegar al caso de uso', async () => {
      const res = await http().post('/seg/membresias/no-es-uuid/finalizar').send({ motivo: 'Cese', confirmar: true });

      expect(res.status).toBe(404);
      expect(res.body.codigo).toBe('NO_ENCONTRADO');
      expect(casos.finalizar.llamadas).toEqual([]);
    });

    it('un cuerpo sin motivo responde 400 SOLICITUD_INVALIDA', async () => {
      const res = await http().post(`/seg/asignaciones/${ROL}/revocar`).send({ confirmar: true });

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ codigo: 'SOLICITUD_INVALIDA', errores: ['motivo'] });
    });
  });
});
