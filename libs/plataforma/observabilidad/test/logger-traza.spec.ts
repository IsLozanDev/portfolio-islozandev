import { context, trace } from '@opentelemetry/api';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import { TracerProvider } from '@opentelemetry/sdk-trace';
import pino from 'pino';
import { AlsTenantContext } from '@vitrina/plataforma/kernel-infra';
import { opcionesLogger } from '../src/infrastructure/logger.pino.js';

const TRACE_DEL_ALCANCE = '0af7651916cd43dd8448eb211c80319c';

describe('logger con OpenTelemetry activo (spec 21)', () => {
  const lineas: string[] = [];
  const contexto = new AlsTenantContext();
  const logger = pino(
    opcionesLogger({ servicio: 'vitrina-prueba', nivel: 'info', salDocumento: 'sal-de-prueba-0123456789-0123456789', contexto }),
    { write: (linea: string) => void lineas.push(linea) },
  );
  const ultimo = () => JSON.parse(lineas[lineas.length - 1] ?? '{}') as Record<string, unknown>;

  beforeAll(() => {
    context.setGlobalContextManager(new AsyncLocalStorageContextManager().enable());
    trace.setGlobalTracerProvider(new TracerProvider());
  });

  afterAll(() => {
    trace.disable();
    context.disable();
  });

  it('fuera de un span no agrega trace_id', () => {
    logger.info('sin span');
    expect(ultimo()).not.toHaveProperty('trace_id');
  });

  it('dentro de un span, trace_id y span_id salen del span aunque el alcance traiga otro', async () => {
    await trace.getTracer('prueba').startActiveSpan('solicitud', async (span) => {
      await contexto.run({ tenantId: 'tenant-a', traceId: TRACE_DEL_ALCANCE }, async () => logger.info('con span'));
      span.end();
      expect(ultimo()).toEqual(expect.objectContaining({ trace_id: span.spanContext().traceId, span_id: span.spanContext().spanId, tenant_id: 'tenant-a' }));
    });
  });
});
