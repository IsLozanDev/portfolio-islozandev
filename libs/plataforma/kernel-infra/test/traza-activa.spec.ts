import { context, trace } from '@opentelemetry/api';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import { InMemorySpanExporter, SimpleSpanProcessor, TracerProvider } from '@opentelemetry/sdk-trace';
import { AlsTenantContext } from '../src/als-tenant-context.js';
import { traceIdActivo } from '../src/traza-activa.js';

const ALCANCE = { tenantId: 'tenant-a', branchId: 'sucursal-1', actorId: 'usuario-1', ip: '10.0.0.1' };

describe('traza activa (spec 21)', () => {
  it('sin SDK de OpenTelemetry no hay trace id', () => {
    expect(traceIdActivo()).toBeUndefined();
  });

  describe('con un tracer registrado', () => {
    const exportador = new InMemorySpanExporter();
    const proveedor = new TracerProvider({ spanProcessors: [new SimpleSpanProcessor({ exporter: exportador })] });
    const tracer = () => trace.getTracer('prueba');

    beforeAll(() => {
      context.setGlobalContextManager(new AsyncLocalStorageContextManager().enable());
      trace.setGlobalTracerProvider(proveedor);
    });

    afterAll(() => {
      trace.disable();
      context.disable();
    });

    it('traceIdActivo devuelve el trace id del span activo', () => {
      tracer().startActiveSpan('solicitud', (span) => {
        expect(traceIdActivo()).toBe(span.spanContext().traceId);
        span.end();
      });
    });

    it('AlsTenantContext.run anota tenant, sucursal y usuario en el span activo, sin la IP', async () => {
      await tracer().startActiveSpan('solicitud-con-tenant', async (span) => {
        await new AlsTenantContext().run(ALCANCE, async () => undefined);
        span.end();
      });
      await proveedor.forceFlush();
      const span = exportador.getFinishedSpans().find((terminado) => terminado.name === 'solicitud-con-tenant');
      expect(span?.attributes).toEqual({ 'tenant.id': 'tenant-a', 'sucursal.id': 'sucursal-1', 'usuario.id': 'usuario-1' });
    });
  });
});
