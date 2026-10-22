import { ValidationError } from '@vitrina/plataforma/kernel';
import { Asignacion } from '../src/domain/asignacion.js';
import {
  AsignacionYaRevocadaError,
  InvitacionExpiradaError,
  InvitacionNoDisponibleError,
  MembresiaExistenteError,
  MotivoInvalidoError,
  TransicionMembresiaError,
} from '../src/domain/errores.js';
import { Invitacion } from '../src/domain/invitacion.js';
import { Membresia, type EstadoMembresia, type MembresiaProps } from '../src/domain/membresia.js';

const ID = '0193f3a0-0000-7000-8000-000000000301';
const TENANT = '0193f3a0-0000-7000-8000-000000000001';
const ROSA = '0193f3a0-0000-7000-8000-000000000902';
const ADMIN = '0193f3a0-0000-7000-8000-000000000901';
const HASH = 'a'.repeat(64);

const AHORA = new Date('2026-10-22T15:00:00Z');
const horasDespues = (h: number) => new Date(AHORA.getTime() + h * 3_600_000);
const EXPIRA = horasDespues(72);

const membresia = (estado: EstadoMembresia, cambios: Partial<MembresiaProps> = {}) =>
  Membresia.reconstituir(ID, 3, {
    usuarioId: ROSA,
    tenantId: TENANT,
    estado,
    esPropietario: false,
    invitadoPor: ADMIN,
    desde: new Date('2026-10-01T00:00:00Z'),
    hasta: estado === 'FINALIZADO' ? new Date('2026-10-10T00:00:00Z') : null,
    motivo: null,
    cambiadoPor: null,
    cambiadoEn: null,
    ...cambios,
  });

describe('Membresia (TR-RF-009, TR-RF-010, TR-RF-014)', () => {
  it('invitar crea INVITADO y publica membresia.invitada sin correo ni nombre', () => {
    const m = Membresia.invitar(ID, { usuarioId: ROSA, tenantId: TENANT, invitadoPor: ADMIN }, AHORA, EXPIRA);

    expect(m.estado).toBe('INVITADO');
    expect(m.esPropietario).toBe(false);
    expect(m.version).toBe(1);
    expect(m.pullEvents()).toEqual([
      expect.objectContaining({
        eventType: 'membresia.invitada',
        aggregateType: 'membresia',
        aggregateId: ID,
        schemaVersion: 1,
        payload: { usuario_id: ROSA, invitado_por: ADMIN, reinvitacion: false, expira_en: '2026-10-25T15:00:00.000Z' },
      }),
    ]);
  });

  it('reinvitar un INVITADO lo deja igual y marca reinvitacion', () => {
    const m = membresia('INVITADO');
    m.reinvitar(ADMIN, AHORA, EXPIRA);

    expect(m.estado).toBe('INVITADO');
    expect(m.pullEvents()[0]?.payload).toMatchObject({ reinvitacion: true });
  });

  it('reinvitar un FINALIZADO lo devuelve a INVITADO sin hasta', () => {
    const m = membresia('FINALIZADO');
    m.reinvitar(ADMIN, AHORA, EXPIRA);

    expect(m.estado).toBe('INVITADO');
    expect(m.hasta).toBeNull();
    expect(m.desde).toEqual(AHORA);
  });

  it.each(['ACTIVO', 'SUSPENDIDO'] as const)('reinvitar un %s falla con MEMBRESIA_EXISTENTE', (estado) => {
    expect(() => membresia(estado).reinvitar(ADMIN, AHORA, EXPIRA)).toThrow(MembresiaExistenteError);
  });

  it('aceptar pasa a ACTIVO desde ahora', () => {
    const m = membresia('INVITADO');
    m.aceptar(AHORA);

    expect(m.estado).toBe('ACTIVO');
    expect(m.desde).toEqual(AHORA);
    expect(m.version).toBe(4);
    expect(m.pullEvents()).toEqual([expect.objectContaining({ eventType: 'membresia.aceptada', payload: { usuario_id: ROSA } })]);
  });

  it('suspender y reactivar guardan motivo y actor', () => {
    const m = membresia('ACTIVO');
    m.suspender('  Licencia médica  ', ADMIN, AHORA);

    expect(m.estado).toBe('SUSPENDIDO');
    expect(m.motivo).toBe('Licencia médica');
    expect(m.cambiadoPor).toBe(ADMIN);
    expect(m.cambiadoEn).toEqual(AHORA);

    m.reactivar('Fin de licencia', ADMIN, horasDespues(1));
    expect(m.estado).toBe('ACTIVO');
    expect(m.pullEvents().map((e) => [e.eventType, e.payload])).toEqual([
      ['membresia.suspendida', { usuario_id: ROSA, motivo: 'Licencia médica', por: ADMIN }],
      ['membresia.reactivada', { usuario_id: ROSA, motivo: 'Fin de licencia', por: ADMIN }],
    ]);
  });

  it.each(['INVITADO', 'ACTIVO', 'SUSPENDIDO'] as const)('finalizar un %s fija hasta y lista las asignaciones revocadas', (estado) => {
    const m = membresia(estado);
    m.finalizar('Cese', ADMIN, AHORA, ['b', 'a']);

    expect(m.estado).toBe('FINALIZADO');
    expect(m.hasta).toEqual(AHORA);
    expect(m.pullEvents()[0]).toMatchObject({
      eventType: 'membresia.finalizada',
      payload: { usuario_id: ROSA, motivo: 'Cese', por: ADMIN, asignaciones_revocadas: ['a', 'b'] },
    });
  });

  it.each([
    ['aceptar', 'ACTIVO'],
    ['aceptar', 'SUSPENDIDO'],
    ['aceptar', 'FINALIZADO'],
    ['suspender', 'INVITADO'],
    ['suspender', 'SUSPENDIDO'],
    ['suspender', 'FINALIZADO'],
    ['reactivar', 'INVITADO'],
    ['reactivar', 'ACTIVO'],
    ['reactivar', 'FINALIZADO'],
    ['finalizar', 'FINALIZADO'],
  ] as const)('%s una membresía %s falla con TRANSICION_INVALIDA', (accion, estado) => {
    const m = membresia(estado);
    const ejecutar = {
      aceptar: () => m.aceptar(AHORA),
      suspender: () => m.suspender('Motivo válido', ADMIN, AHORA),
      reactivar: () => m.reactivar('Motivo válido', ADMIN, AHORA),
      finalizar: () => m.finalizar('Motivo válido', ADMIN, AHORA, []),
    }[accion];

    expect(ejecutar).toThrow(TransicionMembresiaError);
    expect(m.estado).toBe(estado);
    expect(m.pullEvents()).toEqual([]);
  });

  it.each(['Ces', 'x'.repeat(301), '   abc   '])('el motivo %j fuera de 4 a 300 caracteres falla y no cambia nada', (texto) => {
    const m = membresia('ACTIVO');

    expect(() => m.suspender(texto, ADMIN, AHORA)).toThrow(MotivoInvalidoError);
    expect(() => m.finalizar(texto, ADMIN, AHORA, [])).toThrow(MotivoInvalidoError);
    expect(m.estado).toBe('ACTIVO');
  });

  it('TR-CA-039: «Cese» (4) y un motivo de 300 caracteres pasan', () => {
    membresia('ACTIVO').finalizar('Cese', ADMIN, AHORA, []);
    membresia('ACTIVO').suspender('x'.repeat(300), ADMIN, AHORA);
  });
});

describe('Invitacion', () => {
  const emitir = () =>
    Invitacion.emitir('inv-1', { tenantId: TENANT, membresiaId: ID, tokenHash: HASH, creadaPor: ADMIN, ahora: AHORA, horas: 72 });

  it('expira a las 72 h', () => {
    expect(emitir().expiraEn).toEqual(EXPIRA);
  });

  it('a las 71 h sigue VIGENTE', () => {
    expect(emitir().estado(horasDespues(71))).toBe('VIGENTE');
  });

  it('TR-CA-029: a las 80 h está EXPIRADA y usarla falla con el mensaje del SRS', () => {
    const i = emitir();

    expect(i.estado(horasDespues(80))).toBe('EXPIRADA');
    expect(() => i.usar(horasDespues(80))).toThrow(new InvitacionExpiradaError());
    expect(new InvitacionExpiradaError().message).toBe('La invitación expiró; solicite una nueva al administrador');
  });

  it('usar dos veces falla la segunda', () => {
    const i = emitir();
    i.usar(horasDespues(1));

    expect(i.estado(horasDespues(2))).toBe('USADA');
    expect(() => i.usar(horasDespues(2))).toThrow(InvitacionNoDisponibleError);
  });

  it('anulada no se usa; anular es idempotente y una vencida también se anula', () => {
    const i = emitir();
    i.anular(horasDespues(1));
    i.anular(horasDespues(2));

    expect(i.anuladaEn).toEqual(horasDespues(1));
    expect(() => i.usar(horasDespues(3))).toThrow(InvitacionNoDisponibleError);

    const vencida = emitir();
    vencida.anular(horasDespues(100));
    expect(vencida.estado(horasDespues(100))).toBe('ANULADA');
  });

  it('una usada no se anula', () => {
    const i = emitir();
    i.usar(horasDespues(1));

    expect(() => i.anular(horasDespues(2))).toThrow(InvitacionNoDisponibleError);
  });

  it('rechaza un hash que no es sha256 hex y una vigencia menor a 1 h', () => {
    const base = { tenantId: TENANT, membresiaId: ID, creadaPor: ADMIN, ahora: AHORA };
    expect(() => Invitacion.emitir('x', { ...base, tokenHash: 'token-en-claro', horas: 72 })).toThrow(ValidationError);
    expect(() => Invitacion.emitir('x', { ...base, tokenHash: HASH, horas: 0 })).toThrow(ValidationError);
  });
});

describe('Asignacion.revocar (TR-RF-014)', () => {
  const asignacion = () =>
    Asignacion.reconstituir('asig-1', 1, {
      tenantId: TENANT,
      membresiaId: ID,
      rolId: 'rol-1',
      perfilId: null,
      alcance: 'TENANT',
      empresaId: null,
      sucursalId: null,
      unidadId: null,
      vigenteDesde: '2026-10-22',
      vigenteHasta: null,
      otorgadoPor: ADMIN,
    });

  it('revoca con motivo y actor, conserva la vigencia y publica asignacion.revocada', () => {
    const a = asignacion();
    a.revocar('Cambio de puesto', ADMIN, AHORA);

    expect(a.revocadaEn).toEqual(AHORA);
    expect(a.revocadaPor).toBe(ADMIN);
    expect(a.motivoRevocacion).toBe('Cambio de puesto');
    expect(a.vigenteDesde).toBe('2026-10-22');
    expect(a.version).toBe(2);
    expect(a.pullEvents()).toEqual([
      expect.objectContaining({
        eventType: 'asignacion.revocada',
        aggregateType: 'asignacion',
        payload: { membresia_id: ID, motivo: 'Cambio de puesto', por: ADMIN },
      }),
    ]);
  });

  it('revocar dos veces falla con ASIGNACION_YA_REVOCADA', () => {
    const a = asignacion();
    a.revocar('Cambio de puesto', ADMIN, AHORA);

    expect(() => a.revocar('Otra vez', ADMIN, AHORA)).toThrow(AsignacionYaRevocadaError);
  });

  it('sin motivo válido no revoca', () => {
    const a = asignacion();

    expect(() => a.revocar('no', ADMIN, AHORA)).toThrow(MotivoInvalidoError);
    expect(a.revocadaEn).toBeNull();
  });
});
