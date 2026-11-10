import { spawn, type ChildProcess } from 'node:child_process';
import { createServer, request, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { fileURLToPath } from 'node:url';

// Proceso real con los dos --import, como en el contenedor: los hooks ESM no se pueden probar dentro de Jest.
const SOPORTE = fileURLToPath(new URL('./support/', import.meta.url));
const TRACE_ID = '4bf92f3577b34da6a3ce929d0e0e4736';
const TRACEPARENT = `00-${TRACE_ID}-00f067aa0ba902b7-01`;
const ESPERA_MAXIMA_MS = 15_000;
const PAUSA_MS = 100;

interface SpanOtlp {
  traceId: string;
}
interface LogOtlp {
  traceId?: string;
  body?: { stringValue?: string };
}
interface LoteTrazas {
  resourceSpans: { scopeSpans: { spans: SpanOtlp[] }[] }[];
}
interface LoteLogs {
  resourceLogs: { scopeLogs: { logRecords: LogOtlp[] }[] }[];
}

const recibido = new Map<string, unknown[]>();

function iniciarColector(): Promise<Server> {
  const colector = createServer((solicitud, respuesta) => {
    let cuerpo = '';
    solicitud.on('data', (parte) => (cuerpo += parte));
    solicitud.on('end', () => {
      const ruta = solicitud.url ?? '';
      recibido.set(ruta, [...(recibido.get(ruta) ?? []), JSON.parse(cuerpo)]);
      respuesta.writeHead(200, { 'content-type': 'application/json' }).end('{}');
    });
  });
  return new Promise((resolver) => colector.listen(0, '127.0.0.1', () => resolver(colector)));
}

function iniciarServidorInstrumentado(colector: Server): Promise<{ proceso: ChildProcess; puerto: number }> {
  const { port } = colector.address() as AddressInfo;
  const proceso = spawn(process.execPath, ['--import', './registrar-hooks.mjs', '--import', './instrumentacion.mjs', './servidor.mjs'], {
    cwd: SOPORTE,
    env: {
      ...process.env,
      APP_ENV: 'test',
      OTEL_EXPORTER_OTLP_ENDPOINT: `http://127.0.0.1:${port}`,
      OTEL_BSP_SCHEDULE_DELAY: String(PAUSA_MS),
      OTEL_BLRP_SCHEDULE_DELAY: String(PAUSA_MS),
      SENTRY_DSN: '',
    },
  });
  return new Promise((resolver, rechazar) => {
    let errores = '';
    proceso.stderr?.on('data', (parte) => (errores += parte));
    proceso.on('exit', (codigo) => rechazar(new Error(`el servidor terminó (${codigo}): ${errores}`)));
    proceso.stdout?.on('data', (parte: Buffer) => {
      const puerto = /PUERTO (\d+)/.exec(parte.toString())?.[1];
      if (puerto) resolver({ proceso, puerto: Number(puerto) });
    });
  });
}

function pedirConTraceparent(puerto: number): Promise<void> {
  return new Promise((resolver, rechazar) => {
    request({ host: '127.0.0.1', port: puerto, path: '/v1/salud', headers: { traceparent: TRACEPARENT } }, (respuesta) => {
      respuesta.resume();
      respuesta.on('end', resolver);
    })
      .on('error', rechazar)
      .end();
  });
}

const spans = () =>
  ((recibido.get('/v1/traces') ?? []) as LoteTrazas[]).flatMap((lote) =>
    lote.resourceSpans.flatMap((recurso) => recurso.scopeSpans.flatMap((alcance) => alcance.spans)),
  );
const logs = () =>
  ((recibido.get('/v1/logs') ?? []) as LoteLogs[]).flatMap((lote) =>
    lote.resourceLogs.flatMap((recurso) => recurso.scopeLogs.flatMap((alcance) => alcance.logRecords)),
  );

async function esperarHasta(condicion: () => boolean): Promise<void> {
  const limite = Date.now() + ESPERA_MAXIMA_MS;
  while (!condicion() && Date.now() < limite) await new Promise((resolver) => setTimeout(resolver, PAUSA_MS));
}

describe('instrumentación por --import (spec 21, proceso real)', () => {
  let colector: Server;
  let proceso: ChildProcess | undefined;

  beforeAll(async () => {
    colector = await iniciarColector();
    const servidor = await iniciarServidorInstrumentado(colector);
    proceso = servidor.proceso;
    await pedirConTraceparent(servidor.puerto);
    await esperarHasta(() => spans().length > 0 && logs().length > 0);
  }, ESPERA_MAXIMA_MS * 2);

  afterAll(async () => {
    proceso?.removeAllListeners('exit');
    proceso?.kill();
    await new Promise((resolver) => colector.close(resolver));
  });

  it('la solicitud con traceparent produce un span HTTP con ese trace_id', () => {
    expect(spans()).toEqual(expect.arrayContaining([expect.objectContaining({ traceId: TRACE_ID })]));
  });

  it('el log de pino llega por OTLP con el mismo trace_id', () => {
    expect(logs()).toEqual(expect.arrayContaining([expect.objectContaining({ traceId: TRACE_ID, body: { stringValue: 'solicitud atendida' } })]));
  });
});
