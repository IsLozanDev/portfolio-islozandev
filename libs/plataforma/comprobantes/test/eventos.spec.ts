import { InMemoryEventSchemaValidator } from '@vitrina/plataforma/kernel-infra';
import { EVENTOS_FE, VERSION_ESQUEMA_FE } from '../src/domain/eventos-fe.js';
import { ESQUEMAS_FE, registrarEsquemasFe } from '../src/infrastructure/event-schemas.js';

const EMISOR = '0193f3a0-0000-7000-8000-000000000001';
const EMPRESA = '0193f3a0-0000-7000-8000-000000000002';

const evento = (tipo: string, payload: unknown) => ({
  eventType: tipo,
  aggregateType: 'emisor_fe',
  aggregateId: EMISOR,
  aggregateVersion: 1,
  schemaVersion: VERSION_ESQUEMA_FE,
  payload,
  occurredAt: new Date(),
});

describe('Esquemas de los eventos de FE', () => {
  const validador = new InMemoryEventSchemaValidator();
  registrarEsquemasFe(validador);
  const valida = (tipo: string, payload: unknown) => () => validador.validate(evento(tipo, payload));

  it('registra un esquema por cada evento de FE', () => {
    expect(Object.keys(ESQUEMAS_FE).sort()).toEqual(Object.values(EVENTOS_FE).sort());
  });

  it('fe.emisor.verificado y fe.emisor.produccion_habilitada rechazan token, usuario o URL; fe.prueba.solicitada exige un número', () => {
    const carga = { emisor_id: EMISOR, empresa_id: EMPRESA, proveedor: 'NUBEFACT' };
    for (const tipo of [EVENTOS_FE.emisorVerificado, EVENTOS_FE.produccionHabilitada]) {
      expect(valida(tipo, carga)).not.toThrow();
      expect(valida(tipo, { ...carga, token: 'x' })).toThrow();
      expect(valida(tipo, { ...carga, url_proveedor: 'https://api.nubefact.com/api/v1/x' })).toThrow();
    }
    expect(valida(EVENTOS_FE.pruebaSolicitada, { emisor_id: EMISOR, numero_prueba: 1 })).not.toThrow();
    expect(valida(EVENTOS_FE.pruebaSolicitada, { emisor_id: EMISOR, numero_prueba: 0 })).toThrow();
  });

  it('fe.emisor.configurado acepta su carga y rechaza campos de más (usuario o clave)', () => {
    const carga = { emisor_id: EMISOR, empresa_id: EMPRESA, proveedor: 'SIMULADO', ambiente: 'BETA' };
    expect(valida(EVENTOS_FE.emisorConfigurado, carga)).not.toThrow();
    expect(valida(EVENTOS_FE.emisorConfigurado, { ...carga, clave: 'x' })).toThrow();
    expect(valida(EVENTOS_FE.emisorConfigurado, { ...carga, usuario_proveedor: 'MODDATOS' })).toThrow();
    expect(valida(EVENTOS_FE.emisorConfigurado, { ...carga, ambiente: 'PRUEBA' })).toThrow();
  });

  it('fe.certificado.por_vencer acepta días negativos (vencido) y rechaza un RUC inválido', () => {
    const carga = { emisor_id: EMISOR, empresa_id: EMPRESA, ruc: '20601234561', vence_en: '2026-11-05T05:00:00.000Z', dias_restantes: -2 };
    expect(valida(EVENTOS_FE.certificadoPorVencer, carga)).not.toThrow();
    expect(valida(EVENTOS_FE.certificadoPorVencer, { ...carga, ruc: '123' })).toThrow();
    expect(valida(EVENTOS_FE.certificadoPorVencer, { ...carga, pfx: 'AAAA' })).toThrow();
  });

  describe('cpe.aceptado y cpe.rechazado (spec 52)', () => {
    const XML = '0193f3a0-0000-7000-8000-0000000000a1';
    const comun = {
      comprobante_id: '0193f3a0-0000-7000-8000-0000000000c1',
      tipo: '03',
      serie: 'B002',
      numero: 125,
      total: '11.80',
      moneda: 'PEN',
      origen_producto: null,
      origen_id: null,
    };
    const aceptado = { ...comun, estado: 'ACEPTADO', codigo_respuesta: '0', observaciones: [], xml_archivo_id: XML, cdr_archivo_id: null };
    const rechazado = { ...comun, estado: 'RECHAZADO', codigo_respuesta: '2105', descripcion_respuesta: 'Unidad no existe', xml_archivo_id: null };

    it('aceptan su carga, con observaciones y archivos nulos', () => {
      expect(valida(EVENTOS_FE.comprobanteAceptado, aceptado)).not.toThrow();
      expect(valida(EVENTOS_FE.comprobanteAceptado, { ...aceptado, estado: 'ACEPTADO_CON_OBSERVACIONES', observaciones: ['4252 - obs'] })).not.toThrow();
      expect(valida(EVENTOS_FE.comprobanteRechazado, rechazado)).not.toThrow();
    });

    it('rechazan un estado que no les toca y los datos del adquirente', () => {
      expect(valida(EVENTOS_FE.comprobanteAceptado, { ...aceptado, estado: 'RECHAZADO' })).toThrow();
      expect(valida(EVENTOS_FE.comprobanteRechazado, { ...rechazado, estado: 'ACEPTADO' })).toThrow();
      expect(valida(EVENTOS_FE.comprobanteAceptado, { ...aceptado, adquirente_numero: '20512345678' })).toThrow();
      expect(valida(EVENTOS_FE.comprobanteRechazado, { ...rechazado, adquirente_nombre: 'CLIENTE SAC' })).toThrow();
    });
  });
});
