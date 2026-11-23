import { z } from 'zod';
import { ESQUEMAS_NOT, registrarEsquemasNot } from '../src/infrastructure/event-schemas.js';
import { camposEntornoNotificaciones, exigirProveedorCorreoEnProduccion } from '../src/interface/entorno-notificaciones.js';
import { InMemoryEventSchemaValidator } from '@vitrina/plataforma/kernel-infra';

const esquema = z
  .object({ APP_ENV: z.string().default('local'), ...camposEntornoNotificaciones })
  .superRefine(exigirProveedorCorreoEnProduccion);

const COMPLETO = {
  RESEND_API_KEY: 're_clave',
  RESEND_WEBHOOK_SECRET: 'whsec_secreto',
  NOT_REMITENTE: 'Vitrina <no-responder@vitrina.pe>',
  NOT_SAL_DESTINO: 's'.repeat(32),
};

function problemas(entorno: Record<string, string | undefined>): string[] {
  const resultado = esquema.safeParse(entorno);
  return resultado.success ? [] : resultado.error.issues.map((problema) => `${problema.path.join('.')}: ${problema.message}`);
}

describe('entorno de notificaciones', () => {
  it('en development arranca sin las variables (o vacías)', () => {
    expect(problemas({})).toEqual([]);
    expect(problemas({ RESEND_API_KEY: '', RESEND_WEBHOOK_SECRET: '', NOT_REMITENTE: '', NOT_SAL_DESTINO: '' })).toEqual([]);
    expect(esquema.parse({ RESEND_API_KEY: '' }).RESEND_API_KEY).toBeUndefined();
  });

  it('en production las cuatro son obligatorias y el mensaje no lleva valores', () => {
    expect(problemas({ APP_ENV: 'production' })).toEqual([
      'RESEND_API_KEY: obligatoria en producción',
      'RESEND_WEBHOOK_SECRET: obligatoria en producción',
      'NOT_REMITENTE: obligatoria en producción',
      'NOT_SAL_DESTINO: obligatoria en producción',
    ]);
    expect(problemas({ APP_ENV: 'production', ...COMPLETO })).toEqual([]);
  });

  it('la sal del destino tiene al menos 32 caracteres', () => {
    expect(problemas({ NOT_SAL_DESTINO: 'corta' })).toHaveLength(1);
  });
});

describe('esquema de not.mensaje.solicitado', () => {
  const validador = new InMemoryEventSchemaValidator();
  registrarEsquemasNot(validador);
  const evento = (payload: unknown) => ({
    eventType: 'not.mensaje.solicitado',
    aggregateType: 'mensaje',
    aggregateId: '42000000-0000-7000-8000-0000000000a1',
    aggregateVersion: 1,
    schemaVersion: 1,
    payload,
    occurredAt: new Date(),
  });

  it('acepta el id y la fecha programada opcional, y rechaza el destino', () => {
    expect(Object.keys(ESQUEMAS_NOT)).toEqual(['not.mensaje.solicitado']);
    expect(() => validador.validate(evento({ mensaje_id: '42000000-0000-7000-8000-0000000000a1' }))).not.toThrow();
    expect(() => validador.validate(evento({ mensaje_id: '42000000-0000-7000-8000-0000000000a1', programado_para: '2026-11-21T13:00:00.000Z' }))).not.toThrow();
    expect(() => validador.validate(evento({ mensaje_id: '42000000-0000-7000-8000-0000000000a1', destino: 'ana@ejemplo.pe' }))).toThrow();
  });
});
