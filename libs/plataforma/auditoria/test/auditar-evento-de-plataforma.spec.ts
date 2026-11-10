import type { EventoEntregado } from '@vitrina/plataforma/eventos';
import { AuditarEventoDePlataforma } from '../src/application/auditar-evento-de-plataforma.js';
import type { FilaAuditoria, RegistroAuditoria } from '../src/application/ports/registro-auditoria.port.js';

const ID = '0193f3a0-0000-7000-8000-0000000000a1';

const SUCURSAL_CREADA: EventoEntregado = {
  eventId: '0193f3a0-0000-7000-8000-0000000000e1',
  seq: '41',
  tenantId: '0193f3a0-0000-7000-8000-000000000001',
  sedeId: '0193f3a0-0000-7000-8000-0000000000b1',
  aggregateType: 'sucursal',
  aggregateId: '0193f3a0-0000-7000-8000-0000000000c1',
  eventType: 'sucursal.creada',
  version: '1',
  origin: 'CLOUD',
  payload: { nombre: 'Miraflores', token: 'no-debe-guardarse' },
  schemaVersion: 1,
  occurredAt: '2026-11-09T15:00:00.000Z',
  actorId: '0193f3a0-0000-7000-8000-000000000901',
  ip: '190.42.10.8',
  traceId: '4bf92f3577b34da6a3ce929d0e0e4736',
};

function auditarCon(): { auditar: AuditarEventoDePlataforma; filas: FilaAuditoria[] } {
  const filas: FilaAuditoria[] = [];
  const registro: RegistroAuditoria = { insertar: async (fila) => void filas.push(fila) };
  return { auditar: new AuditarEventoDePlataforma({ ids: { next: () => ID }, registro }), filas };
}

describe('AuditarEventoDePlataforma (TR-RN-034)', () => {
  it('guarda el evento con origen EVENTO, su actor, sucursal, IP, trace y el payload enmascarado como después', async () => {
    const { auditar, filas } = auditarCon();
    await auditar.ejecutar(SUCURSAL_CREADA);
    expect(filas).toEqual([
      {
        id: ID,
        tenantId: SUCURSAL_CREADA.tenantId,
        tipo: 'OPERACION',
        origen: 'EVENTO',
        eventId: SUCURSAL_CREADA.eventId,
        accion: 'sucursal.creada',
        entidadTipo: 'sucursal',
        entidadId: SUCURSAL_CREADA.aggregateId,
        usuarioId: SUCURSAL_CREADA.actorId,
        sucursalId: SUCURSAL_CREADA.sedeId,
        ip: '190.42.10.8',
        traceId: SUCURSAL_CREADA.traceId,
        ocurridoEn: new Date('2026-11-09T15:00:00.000Z'),
        despues: { nombre: 'Miraflores', token: '***' },
      },
    ]);
  });

  it('un evento del sistema (sin actor, sede, IP ni trace) los deja vacíos', async () => {
    const { auditar, filas } = auditarCon();
    await auditar.ejecutar({ ...SUCURSAL_CREADA, eventType: 'tenant.creado', actorId: null, sedeId: null, ip: null, traceId: null });
    expect(filas[0]).toMatchObject({ usuarioId: undefined, sucursalId: undefined, ip: undefined, traceId: undefined });
  });
});
