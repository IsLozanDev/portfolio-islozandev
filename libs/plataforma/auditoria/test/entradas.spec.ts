import {
  validarEntradaAccesoSensible,
  validarEntradaAuditoria,
  type EntradaAccesoSensible,
  type EntradaAuditoria,
} from '../src/domain/entradas.js';
import { AccionInvalidaError, LongitudExcedidaError, TicketRequeridoError } from '../src/domain/errores.js';

const ANULACION: EntradaAuditoria = {
  accion: 'rest.venta.anular',
  entidadTipo: 'venta',
  entidadId: 'V-000981',
  antes: { estado: 'EMITIDA' },
  despues: { estado: 'ANULADA' },
  motivo: 'cliente desistió',
};

const ACCESO_HISTORIA: EntradaAccesoSensible = {
  recursoTipo: 'HISTORIA_CLINICA',
  recursoId: 'HC-1',
  personaTitularId: '0193f3a0-0000-7000-8000-000000000501',
  finalidad: 'ATENCION',
};

describe('validarEntradaAuditoria (TR-RF-084)', () => {
  it('acepta una acción producto.recurso.accion con motivo', () => {
    expect(() => validarEntradaAuditoria(ANULACION)).not.toThrow();
    expect(() => validarEntradaAuditoria({ ...ANULACION, accion: 'sucursal.creada' })).not.toThrow();
    expect(() => validarEntradaAuditoria({ ...ANULACION, accion: 'psi.nota_sesion.firmar.lote' })).not.toThrow();
  });

  it.each(['venta', 'Rest.venta.anular', 'rest.venta.', 'rest venta anular', 'a.b.c.d.e', '1rest.venta'])(
    'rechaza la acción «%s»',
    (accion) => {
      expect(() => validarEntradaAuditoria({ ...ANULACION, accion })).toThrow(AccionInvalidaError);
    },
  );

  it('rechaza un motivo de más de 500 y un entidadId de más de 80', () => {
    expect(() => validarEntradaAuditoria({ ...ANULACION, motivo: 'x'.repeat(500) })).not.toThrow();
    expect(() => validarEntradaAuditoria({ ...ANULACION, motivo: 'x'.repeat(501) })).toThrow(LongitudExcedidaError);
    expect(() => validarEntradaAuditoria({ ...ANULACION, entidadId: 'x'.repeat(81) })).toThrow(LongitudExcedidaError);
  });
});

describe('validarEntradaAccesoSensible (TR-RF-085)', () => {
  it('TR-CA-211: acepta un acceso con finalidad ATENCION sin ticket', () => {
    expect(() => validarEntradaAccesoSensible(ACCESO_HISTORIA)).not.toThrow();
  });

  it('TR-CA-212: SOPORTE con ticket se acepta; sin ticket o en blanco falla', () => {
    const soporte: EntradaAccesoSensible = { ...ACCESO_HISTORIA, recursoTipo: 'EXPEDIENTE', finalidad: 'SOPORTE' };
    expect(() => validarEntradaAccesoSensible({ ...soporte, ticket: 'TCK-1042' })).not.toThrow();
    expect(() => validarEntradaAccesoSensible(soporte)).toThrow(TicketRequeridoError);
    expect(() => validarEntradaAccesoSensible({ ...soporte, ticket: '  ' })).toThrow(TicketRequeridoError);
  });

  it('rechaza un ticket de más de 40 y un recursoId de más de 80', () => {
    expect(() => validarEntradaAccesoSensible({ ...ACCESO_HISTORIA, ticket: 'T'.repeat(41) })).toThrow(LongitudExcedidaError);
    expect(() => validarEntradaAccesoSensible({ ...ACCESO_HISTORIA, recursoId: 'x'.repeat(81) })).toThrow(LongitudExcedidaError);
  });
});
