import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { context, trace } from '@opentelemetry/api';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import { TracerProvider } from '@opentelemetry/sdk-trace';
import { AlsTenantContext } from '@vitrina/plataforma/kernel-infra';
import { lastValueFrom, of } from 'rxjs';
import { ContextoTenantInterceptor } from '../src/interface/contexto-tenant.interceptor.js';

const TRACE_DEL_ENCABEZADO = '4bf92f3577b34da6a3ce929d0e0e4736';

function solicitudCon(traceparent: string): ExecutionContext {
  const solicitud = { principal: { tenantId: 'tenant-a', usuarioId: 'usuario-1' }, headers: { traceparent } };
  return { switchToHttp: () => ({ getRequest: () => solicitud }) } as unknown as ExecutionContext;
}

async function traceIdVistoPorElHandler(): Promise<string | undefined> {
  const contexto = new AlsTenantContext();
  const handler: CallHandler = { handle: () => of(contexto.current().traceId) };
  const interceptor = new ContextoTenantInterceptor(contexto);
  return lastValueFrom(interceptor.intercept(solicitudCon(`00-${TRACE_DEL_ENCABEZADO}-00f067aa0ba902b7-01`), handler)) as Promise<string | undefined>;
}

describe('ContextoTenantInterceptor: trace id (spec 21)', () => {
  it('sin OpenTelemetry usa el del traceparent', async () => {
    expect(await traceIdVistoPorElHandler()).toBe(TRACE_DEL_ENCABEZADO);
  });

  describe('con OpenTelemetry', () => {
    beforeAll(() => {
      context.setGlobalContextManager(new AsyncLocalStorageContextManager().enable());
      trace.setGlobalTracerProvider(new TracerProvider());
    });

    afterAll(() => {
      trace.disable();
      context.disable();
    });

    it('usa el del span activo', async () => {
      await trace.getTracer('prueba').startActiveSpan('solicitud', async (span) => {
        expect(await traceIdVistoPorElHandler()).toBe(span.spanContext().traceId);
        span.end();
      });
    });
  });
});
