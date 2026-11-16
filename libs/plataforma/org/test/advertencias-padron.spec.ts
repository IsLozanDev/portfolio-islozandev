import { advertenciasDelPadron } from '../src/domain/advertencias-padron.js';

describe('advertenciasDelPadron (TR-RN-019)', () => {
  it('TR-CA-006: NO HABIDO advierte con el texto literal', () => {
    expect(advertenciasDelPadron({ estado: 'ACTIVO', condicion: 'NO HABIDO' })).toEqual([
      'Contribuyente NO HABIDO: no podrá emitir comprobantes hasta regularizar',
    ]);
  });

  it('un estado distinto de ACTIVO advierte', () => {
    expect(advertenciasDelPadron({ estado: 'BAJA DE OFICIO', condicion: 'HABIDO' })).toEqual([
      'Contribuyente en estado BAJA DE OFICIO: no podrá emitir comprobantes hasta regularizar',
    ]);
  });

  it('no habido y no activo devuelve las dos advertencias', () => {
    expect(advertenciasDelPadron({ estado: 'SUSPENSION TEMPORAL', condicion: 'NO HABIDO' })).toEqual([
      'Contribuyente NO HABIDO: no podrá emitir comprobantes hasta regularizar',
      'Contribuyente en estado SUSPENSION TEMPORAL: no podrá emitir comprobantes hasta regularizar',
    ]);
  });

  it('ACTIVO y HABIDO no advierte', () => {
    expect(advertenciasDelPadron({ estado: 'ACTIVO', condicion: 'HABIDO' })).toEqual([]);
  });

  it('sin padrón no advierte', () => {
    expect(advertenciasDelPadron(null)).toEqual([]);
  });
});
