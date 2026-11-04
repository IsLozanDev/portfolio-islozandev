import {
  AccesoSoporte,
  motivoSoporte,
  ticketSoporte,
  vigenciaSoporte,
  type AccesoSoporteProps,
  type DatosSolicitudSoporte,
  type EstadoSoporte,
} from '../src/domain/acceso-soporte.js';
import {
  MotivoInvalidoError,
  MotivoSoporteInvalidoError,
  SoporteAutoaprobacionError,
  TicketInvalidoError,
  TransicionMembresiaError,
  TransicionSoporteError,
  VigenciaSoporteExcedidaError,
  VigenciaSoporteInvalidaError,
} from '../src/domain/errores.js';
import { EVENTOS_SEG } from '../src/domain/eventos.js';
import { Membresia } from '../src/domain/membresia.js';
import { PERMISOS_SEG, PERMISOS_VETADOS_SOPORTE } from '../src/domain/permisos-seg.js';

const ID = '0193f3a0-0000-7000-8000-00000000a001';
const TENANT = '0193f3a0-0000-7000-8000-000000000001';
const JAVIER = '0193f3a0-0000-7000-8000-000000000990';
const ADMIN = '0193f3a0-0000-7000-8000-000000000901';
const MEMBRESIA = '0193f3a0-0000-7000-8000-000000000f01';
const ASIGNACION = '0193f3a0-0000-7000-8000-000000001001';

const AHORA = new Date('2026-11-03T14:00:00Z');
const horasDespues = (horas: number) => new Date(AHORA.getTime() + horas * 3_600_000);

const SOLICITUD: DatosSolicitudSoporte = {
  tenantId: TENANT,
  agenteId: JAVIER,
  ticket: 'SOP-000245',
  motivo: 'Revisar series de boletas',
  modo: 'LECTURA',
  horas: 2,
};

const aprobacion = (horas = 2) => ({ aprobadoPor: ADMIN, horas, membresiaId: MEMBRESIA, asignacionId: ASIGNACION });

const pendiente = () => {
  const acceso = AccesoSoporte.solicitar(ID, SOLICITUD, AHORA);
  acceso.pullEvents();
  return acceso;
};

const aprobado = (horas = 2) => {
  const acceso = pendiente();
  acceso.aprobar(aprobacion(horas), AHORA);
  acceso.pullEvents();
  return acceso;
};

const reconstituido = (estado: EstadoSoporte, cambios: Partial<AccesoSoporteProps> = {}) =>
  AccesoSoporte.reconstituir(ID, 5, {
    tenantId: TENANT,
    agenteId: JAVIER,
    ticket: 'SOP-000245',
    motivo: 'Revisar series de boletas',
    modo: 'LECTURA',
    horasSolicitadas: 2,
    estado,
    solicitadoEn: AHORA,
    caducaEn: horasDespues(24),
    aprobadoPor: null,
    horasAprobadas: null,
    desde: null,
    hasta: null,
    membresiaId: null,
    asignacionId: null,
    cerradoPor: null,
    cerradoEn: null,
    motivoCierre: null,
    causaCierre: null,
    ...cambios,
  });

describe('Valores de soporte (TR-RF-020)', () => {
  it('el ticket acepta SOP-###### y lo normaliza', () => {
    expect(ticketSoporte(' sop-000245 ')).toBe('SOP-000245');
  });

  it.each(['SOP-12', 'SOP-0002450', 'TCK-000245', ''])('el ticket «%s» es inválido', (ticket) => {
    expect(() => ticketSoporte(ticket)).toThrow(TicketInvalidoError);
  });

  it('el motivo exige de 10 a 300 caracteres sin contar los espacios de los extremos', () => {
    expect(motivoSoporte('  Revisar boletas  ')).toBe('Revisar boletas');
    expect(() => motivoSoporte('Corto 1234')).not.toThrow();
    expect(() => motivoSoporte('  Corto 123  ')).toThrow(MotivoSoporteInvalidoError);
    expect(() => motivoSoporte('x'.repeat(301))).toThrow(MotivoSoporteInvalidoError);
  });

  it('la vigencia acepta de 1 a 4 horas enteras', () => {
    expect([1, 2, 3, 4].map(vigenciaSoporte)).toEqual([1, 2, 3, 4]);
  });

  it('más de 4 horas da «La vigencia máxima es 4 horas» (TR-CA-054)', () => {
    expect(() => vigenciaSoporte(8)).toThrow(VigenciaSoporteExcedidaError);
    expect(() => vigenciaSoporte(8)).toThrow('La vigencia máxima es 4 horas');
  });

  it.each([0, -1, 1.5, Number.NaN])('la vigencia %p es inválida', (horas) => {
    expect(() => vigenciaSoporte(horas)).toThrow(VigenciaSoporteInvalidaError);
  });
});

describe('AccesoSoporte (TR-RF-020, TR-RN-011)', () => {
  it('solicitar crea PENDIENTE que caduca a las 24 h y publica soporte.solicitado sin motivo', () => {
    const acceso = AccesoSoporte.solicitar(ID, SOLICITUD, AHORA);

    expect(acceso.estado).toBe('PENDIENTE');
    expect(acceso.caducaEn).toEqual(horasDespues(24));
    expect(acceso.horasSolicitadas).toBe(2);
    const [evento] = acceso.pullEvents();
    expect(evento).toMatchObject({ eventType: EVENTOS_SEG.soporteSolicitado, aggregateType: 'acceso_soporte', schemaVersion: 1 });
    expect(evento.payload).toEqual({
      acceso_id: ID,
      tenant_id: TENANT,
      agente_id: JAVIER,
      ticket: 'SOP-000245',
      modo: 'LECTURA',
      horas_solicitadas: 2,
    });
  });

  it('solicitar valida ticket, motivo y horas', () => {
    expect(() => AccesoSoporte.solicitar(ID, { ...SOLICITUD, ticket: 'SOP-12' }, AHORA)).toThrow(TicketInvalidoError);
    expect(() => AccesoSoporte.solicitar(ID, { ...SOLICITUD, motivo: 'Corto' }, AHORA)).toThrow(MotivoSoporteInvalidoError);
    expect(() => AccesoSoporte.solicitar(ID, { ...SOLICITUD, horas: 5 }, AHORA)).toThrow(VigenciaSoporteExcedidaError);
  });

  it('aprobar por 2 h deja APROBADO con hasta = desde + 2 h (TR-CA-053)', () => {
    const acceso = pendiente();
    acceso.aprobar(aprobacion(2), AHORA);

    expect(acceso.estado).toBe('APROBADO');
    expect(acceso.desde).toEqual(AHORA);
    expect(acceso.hasta).toEqual(horasDespues(2));
    expect(acceso.horasAprobadas).toBe(2);
    expect(acceso.membresiaId).toBe(MEMBRESIA);
    expect(acceso.asignacionId).toBe(ASIGNACION);
    expect(acceso.pullEvents()[0].payload).toEqual({
      acceso_id: ID,
      tenant_id: TENANT,
      agente_id: JAVIER,
      aprobado_por: ADMIN,
      desde: AHORA.toISOString(),
      hasta: horasDespues(2).toISOString(),
      modo: 'LECTURA',
    });
  });

  it('el administrador puede cambiar las horas solicitadas al aprobar', () => {
    const acceso = pendiente();
    acceso.aprobar(aprobacion(4), AHORA);
    expect(acceso.hasta).toEqual(horasDespues(4));
  });

  it('aprobar por 8 h falla sin cambiar nada (TR-CA-054)', () => {
    const acceso = pendiente();
    expect(() => acceso.aprobar(aprobacion(8), AHORA)).toThrow('La vigencia máxima es 4 horas');
    expect(acceso.estado).toBe('PENDIENTE');
    expect(acceso.pullEvents()).toEqual([]);
  });

  it('el agente no puede aprobar su propio acceso', () => {
    expect(() => pendiente().aprobar({ ...aprobacion(), aprobadoPor: JAVIER }, AHORA)).toThrow(SoporteAutoaprobacionError);
  });

  it('no se aprueba una solicitud caducada', () => {
    expect(() => pendiente().aprobar(aprobacion(), horasDespues(24))).toThrow(TransicionSoporteError);
  });

  it.each<EstadoSoporte>(['APROBADO', 'RECHAZADO', 'REVOCADO', 'EXPIRADO'])('no se aprueba un acceso %s', (estado) => {
    expect(() => reconstituido(estado).aprobar(aprobacion(), AHORA)).toThrow(TransicionSoporteError);
  });

  it('vigente solo mientras está APROBADO y antes de hasta', () => {
    const acceso = aprobado(2);
    expect(acceso.vigente(horasDespues(1.99))).toBe(true);
    expect(acceso.vigente(horasDespues(2))).toBe(false);
    expect(pendiente().vigente(AHORA)).toBe(false);
  });

  it('rechazar deja RECHAZADO con motivo, actor y causa RECHAZO', () => {
    const acceso = pendiente();
    acceso.rechazar('  No autorizado  ', ADMIN, horasDespues(1));

    expect(acceso.estado).toBe('RECHAZADO');
    expect(acceso.motivoCierre).toBe('No autorizado');
    expect(acceso.cerradoPor).toBe(ADMIN);
    expect(acceso.cerradoEn).toEqual(horasDespues(1));
    expect(acceso.causaCierre).toBe('RECHAZO');
    const [evento] = acceso.pullEvents();
    expect(evento.eventType).toBe(EVENTOS_SEG.soporteRechazado);
    expect(evento.payload).toEqual({ acceso_id: ID, tenant_id: TENANT, cerrado_por: ADMIN, causa: 'RECHAZO' });
  });

  it('rechazar exige motivo de 4 a 300 y estado PENDIENTE', () => {
    expect(() => pendiente().rechazar('No', ADMIN, AHORA)).toThrow(MotivoInvalidoError);
    expect(() => aprobado().rechazar('No autorizado', ADMIN, AHORA)).toThrow(TransicionSoporteError);
  });

  it('revocar un aprobado lo deja REVOCADO con causa ADMINISTRADOR', () => {
    const acceso = aprobado();
    acceso.revocar('ADMINISTRADOR', 'Ya se resolvió', ADMIN, horasDespues(1));

    expect(acceso.estado).toBe('REVOCADO');
    expect(acceso.causaCierre).toBe('ADMINISTRADOR');
    expect(acceso.pullEvents()[0]).toMatchObject({
      eventType: EVENTOS_SEG.soporteRevocado,
      payload: { cerrado_por: ADMIN, causa: 'ADMINISTRADOR' },
    });
  });

  it('cerrar el ticket revoca el aprobado sin actor (TR-CA-055)', () => {
    const acceso = aprobado();
    acceso.revocar('TICKET_CERRADO', 'Ticket cerrado', null, horasDespues(1));

    expect(acceso.estado).toBe('REVOCADO');
    expect(acceso.cerradoPor).toBeNull();
    expect(acceso.causaCierre).toBe('TICKET_CERRADO');
  });

  it('cerrar el ticket deja RECHAZADO un pendiente', () => {
    const acceso = pendiente();
    acceso.revocar('TICKET_CERRADO', 'Ticket cerrado', null, AHORA);

    expect(acceso.estado).toBe('RECHAZADO');
    expect(acceso.pullEvents()[0]).toMatchObject({ eventType: EVENTOS_SEG.soporteRechazado, payload: { causa: 'TICKET_CERRADO' } });
  });

  it('el administrador no revoca un pendiente: lo rechaza', () => {
    expect(() => pendiente().revocar('ADMINISTRADOR', 'Ya no hace falta', ADMIN, AHORA)).toThrow(TransicionSoporteError);
  });

  it.each<EstadoSoporte>(['RECHAZADO', 'REVOCADO', 'EXPIRADO'])('no se revoca un acceso %s', (estado) => {
    expect(() => reconstituido(estado).revocar('TICKET_CERRADO', 'Ticket cerrado', null, AHORA)).toThrow(TransicionSoporteError);
  });

  it('expirar un aprobado vencido conserva la aprobación y publica estado_anterior', () => {
    const acceso = aprobado(2);
    acceso.expirar(horasDespues(2));

    expect(acceso.estado).toBe('EXPIRADO');
    expect(acceso.causaCierre).toBe('VENCIMIENTO');
    expect(acceso.cerradoPor).toBeNull();
    expect(acceso.aprobadoPor).toBe(ADMIN);
    expect(acceso.pullEvents()[0]).toMatchObject({
      eventType: EVENTOS_SEG.soporteExpirado,
      payload: { acceso_id: ID, tenant_id: TENANT, estado_anterior: 'APROBADO' },
    });
  });

  it('expirar un pendiente caducado', () => {
    const acceso = pendiente();
    expect(acceso.caducada(horasDespues(23.9))).toBe(false);
    acceso.expirar(horasDespues(24));
    expect(acceso.estado).toBe('EXPIRADO');
    expect(acceso.pullEvents()[0].payload).toMatchObject({ estado_anterior: 'PENDIENTE' });
  });

  it('no expira lo que sigue vigente o ya está cerrado', () => {
    expect(() => aprobado(2).expirar(horasDespues(1))).toThrow(TransicionSoporteError);
    expect(() => pendiente().expirar(horasDespues(1))).toThrow(TransicionSoporteError);
    expect(() => reconstituido('REVOCADO').expirar(horasDespues(30))).toThrow(TransicionSoporteError);
  });
});

describe('Membresía de soporte', () => {
  it('abrirSoporte crea ACTIVO con hasta, sin propietario ni invitación ni eventos', () => {
    const membresia = Membresia.abrirSoporte(MEMBRESIA, { usuarioId: JAVIER, tenantId: TENANT, hasta: horasDespues(2) }, AHORA);

    expect(membresia).toMatchObject({ estado: 'ACTIVO', esPropietario: false, invitadoPor: null, desde: AHORA, hasta: horasDespues(2) });
    expect(membresia.pullEvents()).toEqual([]);
  });

  it('reabrirSoporte vuelve a ACTIVO una membresía FINALIZADO', () => {
    const membresia = Membresia.abrirSoporte(MEMBRESIA, { usuarioId: JAVIER, tenantId: TENANT, hasta: horasDespues(2) }, AHORA);
    membresia.finalizar('Vencido', ADMIN, horasDespues(2), []);

    membresia.reabrirSoporte(horasDespues(30), horasDespues(27));
    expect(membresia).toMatchObject({ estado: 'ACTIVO', desde: horasDespues(27), hasta: horasDespues(30) });
  });

  it('reabrirSoporte no toca una membresía que no está FINALIZADO', () => {
    const membresia = Membresia.abrirSoporte(MEMBRESIA, { usuarioId: JAVIER, tenantId: TENANT, hasta: horasDespues(2) }, AHORA);
    expect(() => membresia.reabrirSoporte(horasDespues(4), AHORA)).toThrow(TransicionMembresiaError);
  });
});

describe('PERMISOS_VETADOS_SOPORTE', () => {
  it('incluye gestionar usuarios, roles, perfiles y el propio soporte, y deja la bitácora', () => {
    expect(PERMISOS_VETADOS_SOPORTE).toEqual(
      expect.arrayContaining(['plat.soporte.autorizar', 'plat.usuario.invitar', 'plat.asignacion.otorgar', 'plat.rol.gestionar']),
    );
    expect(PERMISOS_VETADOS_SOPORTE).not.toContain(PERMISOS_SEG.seguridadBitacora);
  });
});
