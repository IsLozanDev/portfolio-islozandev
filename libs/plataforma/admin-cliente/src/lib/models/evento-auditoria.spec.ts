import { aEventoAuditoria, aEventoAuditoriaDetalle, type EventoAuditoriaDetalleRespuesta } from './evento-auditoria';
import { aVerificacionIntegridad } from './verificacion-integridad';

const RESPUESTA: EventoAuditoriaDetalleRespuesta = {
  id: 'e-1',
  numero: '18377',
  tipo: 'OPERACION',
  accion: 'rest.venta.anular',
  entidad_tipo: 'venta',
  entidad_id: 'V-000981',
  usuario: { id: 'u-1', nombre: 'Rosa Quispe', correo: 'rosa@ejemplo.pe' },
  sucursal: { id: 's-1', codigo: 'MIR', nombre: 'Miraflores' },
  motivo: 'Cliente desistió',
  finalidad: null,
  ticket: null,
  persona_titular_id: null,
  ip: '190.235.41.18',
  ocurrido_en: '2026-10-31T23:42:10Z',
  antes: { estado: 'EMITIDA' },
  despues: { estado: 'ANULADA' },
  cambios: [{ campo: 'estado', antes: 'EMITIDA', despues: 'ANULADA' }],
  trace_id: 'traza',
  event_id: 'ev-1',
  hash_anterior: 'a'.repeat(64),
  hash: 'b'.repeat(64),
};

describe('mapeos de auditoría (spec 20c)', () => {
  it('la fila de la lista pasa a camelCase y la fecha a Date', () => {
    expect(aEventoAuditoria(RESPUESTA)).toEqual({
      id: 'e-1',
      numero: '18377',
      tipo: 'OPERACION',
      accion: 'rest.venta.anular',
      entidadTipo: 'venta',
      entidadId: 'V-000981',
      usuario: RESPUESTA.usuario,
      sucursal: RESPUESTA.sucursal,
      motivo: 'Cliente desistió',
      finalidad: null,
      ticket: null,
      personaTitularId: null,
      ip: '190.235.41.18',
      ocurridoEn: new Date('2026-10-31T23:42:10Z'),
    });
  });

  it('el detalle suma antes, después, cambios y los datos de la cadena', () => {
    expect(aEventoAuditoriaDetalle(RESPUESTA)).toMatchObject({
      antes: { estado: 'EMITIDA' },
      despues: { estado: 'ANULADA' },
      cambios: [{ campo: 'estado', antes: 'EMITIDA', despues: 'ANULADA' }],
      traceId: 'traza',
      eventId: 'ev-1',
      hashAnterior: 'a'.repeat(64),
      hash: 'b'.repeat(64),
    });
  });

  it('la verificación toma estado, tramo, rotura y fecha de fin', () => {
    const verificacion = aVerificacionIntegridad({
      id: 'v-1',
      modo: 'INCREMENTAL',
      desde_numero: '17000',
      hasta_numero: '17905',
      filas: 905,
      estado: 'ROTA',
      numero_roto: '17906',
      motivo: 'HASH',
      iniciada_en: '2026-11-10T08:30:00Z',
      terminada_en: '2026-11-10T08:30:04Z',
    });
    expect(verificacion).toEqual({
      estado: 'ROTA',
      modo: 'INCREMENTAL',
      hastaNumero: '17905',
      numeroRoto: '17906',
      motivo: 'HASH',
      terminadaEn: new Date('2026-11-10T08:30:04Z'),
    });
  });
});
