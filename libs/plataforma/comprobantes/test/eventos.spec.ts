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

  it('registra los dos eventos', () => {
    expect(Object.keys(ESQUEMAS_FE).sort()).toEqual([EVENTOS_FE.certificadoPorVencer, EVENTOS_FE.emisorConfigurado]);
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
});
