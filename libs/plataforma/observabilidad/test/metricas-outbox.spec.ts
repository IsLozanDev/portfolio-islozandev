import { metrics } from '@opentelemetry/api';
import { AggregationTemporality, InMemoryMetricExporter, MeterProvider, PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import type { EstadoOutbox } from '@vitrina/plataforma/eventos';
import { registrarMetricasOutbox } from '../src/infrastructure/metricas-outbox.js';

const UNA_HORA_MS = 3_600_000;

describe('registrarMetricasOutbox (spec 21, TR-RNF-106)', () => {
  let lector: PeriodicExportingMetricReader;
  let leerEstado: () => Promise<EstadoOutbox>;
  const avisos: unknown[] = [];

  const valores = async () => {
    const { resourceMetrics } = await lector.collect();
    return Object.fromEntries(
      resourceMetrics.scopeMetrics.flatMap((alcance) => alcance.metrics.map((metrica) => [metrica.descriptor.name, metrica.dataPoints[0]?.value])),
    );
  };

  beforeAll(() => {
    lector = new PeriodicExportingMetricReader({ exporter: new InMemoryMetricExporter(AggregationTemporality.CUMULATIVE), exportIntervalMillis: UNA_HORA_MS });
    metrics.setGlobalMeterProvider(new MeterProvider({ readers: [lector] }));
    registrarMetricasOutbox({ leer: () => leerEstado() }, (error) => void avisos.push(error));
  });

  afterAll(async () => {
    await lector.shutdown();
    metrics.disable();
  });

  it('publica pendientes, fallidos y edad del pendiente más antiguo', async () => {
    leerEstado = async () => ({ pendientes: 3, fallidos: 1, edadPendienteSeg: 42 });
    expect(await valores()).toEqual({ vitrina_outbox_pendientes: 3, vitrina_outbox_fallidos: 1, vitrina_outbox_edad_pendiente_seg: 42 });
  });

  it('si la base falla, avisa y no rompe la exportación', async () => {
    const falla = new Error('base caída');
    leerEstado = async () => {
      throw falla;
    };
    await expect(lector.collect()).resolves.toBeDefined();
    expect(avisos).toEqual([falla]);
  });
});
