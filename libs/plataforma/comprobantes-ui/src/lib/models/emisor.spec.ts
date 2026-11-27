import { emisorDePrueba, respuestaEmisorDePrueba } from '../../testing/emisor-de-prueba';
import { aEmisor, aEmpresaConEmisor } from './emisor';
import { mensajeErrorFe, mensajePruebaRechazada } from './mensajes-emisor';

describe('mapeos desde la API', () => {
  it('aEmisor pasa a camelCase el emisor, el certificado y la prueba', () => {
    const prueba = { estado: 'RECHAZADA' as const, numero: 2, solicitada_en: 'a', resultado_en: 'b', codigo: '2800', descripcion: 'RUC' };
    expect(aEmisor(respuestaEmisorDePrueba())).toEqual(emisorDePrueba());
    expect(aEmisor(respuestaEmisorDePrueba({ prueba })).prueba).toEqual({
      estado: 'RECHAZADA',
      numero: 2,
      solicitadaEn: 'a',
      resultadoEn: 'b',
      codigo: '2800',
      descripcion: 'RUC',
    });
  });

  it('aEmpresaConEmisor: con resumen o null', () => {
    expect(aEmpresaConEmisor({ empresa_id: 'e', ruc: '20601234561', razon_social: 'ANDES SAC', emisor: null })).toEqual({
      empresaId: 'e',
      ruc: '20601234561',
      razonSocial: 'ANDES SAC',
      emisor: null,
    });
    const conEmisor = aEmpresaConEmisor({
      empresa_id: 'e',
      ruc: '20601234561',
      razon_social: 'ANDES SAC',
      emisor: { estado: 'VERIFICADO', proveedor: 'SUNAT', ambiente: 'BETA', certificado_vence_en: '2027-01-01T05:00:00.000Z', prueba_estado: 'ACEPTADA' },
    });
    expect(conEmisor.emisor).toEqual({ estado: 'VERIFICADO', proveedor: 'SUNAT', ambiente: 'BETA', certificadoVenceEn: '2027-01-01T05:00:00.000Z', pruebaEstado: 'ACEPTADA' });
  });
});

describe('mensajes', () => {
  it('código conocido → su texto; desconocido → genérico; TR-CA-134 con código y descripción', () => {
    expect(mensajeErrorFe('CERTIFICADO_OTRO_RUC')).toBe('El certificado no corresponde al RUC de la empresa.');
    expect(mensajeErrorFe('OTRA_COSA')).toBe('No se pudo completar la operación. Intenta de nuevo.');
    expect(mensajePruebaRechazada('2800', 'RUC del emisor inválido')).toBe('SUNAT rechazó el comprobante de prueba: 2800 RUC del emisor inválido');
    expect(mensajePruebaRechazada(null, null)).toBe('SUNAT rechazó el comprobante de prueba');
  });
});
