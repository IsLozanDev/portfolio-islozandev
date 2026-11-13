import { trace } from '@opentelemetry/api';
import { limpiarEventoSentry } from '../src/infrastructure/sentry.js';
import { iniciarTelemetria } from '../src/infrastructure/telemetria.js';

describe('iniciarTelemetria (spec 21)', () => {
  it('sin endpoint ni DSN no inicia nada ni registra un tracer', () => {
    expect(iniciarTelemetria({ servicio: 'vitrina-prueba' }, {})).toEqual({ openTelemetry: false, sentry: false });
    expect(trace.getTracer('prueba').startSpan('sin-sdk').isRecording()).toBe(false);
  });

  it('las variables vacías cuentan como no configuradas', () => {
    expect(iniciarTelemetria({ servicio: 'vitrina-prueba' }, { OTEL_EXPORTER_OTLP_ENDPOINT: '', SENTRY_DSN: '' })).toEqual({
      openTelemetry: false,
      sentry: false,
    });
  });

  it('una variable inválida falla sin mostrar su valor', () => {
    const dsnInvalido = 'no-es-url-clave-secreta';
    const iniciar = () => iniciarTelemetria({ servicio: 'vitrina-prueba' }, { SENTRY_DSN: dsnInvalido });
    expect(iniciar).toThrow(/SENTRY_DSN/);
    expect(iniciar).not.toThrow(new RegExp(dsnInvalido));
  });
});

describe('limpiarEventoSentry (TR-RNF-026)', () => {
  it('deja solo método y ruta sin query de la solicitud', () => {
    const evento = {
      type: undefined,
      event_id: 'e1',
      request: {
        method: 'POST',
        url: 'https://api.ejemplo/v1/usuarios?correo=ana@ejemplo.pe',
        data: { dni: '45678912' },
        cookies: { sesion: 'valor' },
        headers: { authorization: 'Bearer token' },
        query_string: 'correo=ana@ejemplo.pe',
      },
    };
    expect(limpiarEventoSentry(evento)).toEqual({ type: undefined, event_id: 'e1', request: { method: 'POST', url: 'https://api.ejemplo/v1/usuarios' } });
  });

  it('un evento sin solicitud queda igual', () => {
    const evento = { type: undefined, event_id: 'e2' };
    expect(limpiarEventoSentry(evento)).toBe(evento);
  });
});
