import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { IORedisInstrumentation } from '@opentelemetry/instrumentation-ioredis';
import { NestInstrumentation } from '@opentelemetry/instrumentation-nestjs-core';
import { PgInstrumentation } from '@opentelemetry/instrumentation-pg';
import { PinoInstrumentation } from '@opentelemetry/instrumentation-pino';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { BatchLogRecordProcessor } from '@opentelemetry/sdk-logs';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { z } from 'zod';
import { esquemaAmbiente } from './ambiente.js';
import { iniciarSentry } from './sentry.js';

export interface OpcionesTelemetria {
  /** `vitrina-api` o `vitrina-worker`: `service.name` en Grafana. */
  readonly servicio: string;
}

export interface TelemetriaIniciada {
  readonly openTelemetry: boolean;
  readonly sentry: boolean;
}

// Railway y GitHub dejan variables vacías: vacío equivale a no configurada.
const urlOpcional = z.preprocess((valor) => (valor === '' ? undefined : valor), z.url({ protocol: /^https?$/ }).optional());

const esquemaTelemetria = z.object({
  APP_ENV: esquemaAmbiente,
  OTEL_EXPORTER_OTLP_ENDPOINT: urlOpcional,
  SENTRY_DSN: urlOpcional,
});

const ATRIBUTO_AMBIENTE = 'deployment.environment.name';

/**
 * Arranca OpenTelemetry y luego Sentry, en ese orden (guía de Sentry para un pipeline OTel propio).
 * Se llama desde `instrumentacion.ts` de cada app, cargado con `node --import`, antes que la app.
 * Sin `OTEL_EXPORTER_OTLP_ENDPOINT` ni `SENTRY_DSN` no inicia nada: local y CI no exportan.
 */
export function iniciarTelemetria({ servicio }: OpcionesTelemetria, entorno: NodeJS.ProcessEnv = process.env): TelemetriaIniciada {
  const config = leerEntorno(entorno);
  if (config.OTEL_EXPORTER_OTLP_ENDPOINT) iniciarOpenTelemetry(servicio, config.APP_ENV);
  if (config.SENTRY_DSN) iniciarSentry(config.SENTRY_DSN, config.APP_ENV);
  return { openTelemetry: Boolean(config.OTEL_EXPORTER_OTLP_ENDPOINT), sentry: Boolean(config.SENTRY_DSN) };
}

function leerEntorno(entorno: NodeJS.ProcessEnv): z.infer<typeof esquemaTelemetria> {
  const resultado = esquemaTelemetria.safeParse(entorno);
  if (resultado.success) return resultado.data;
  // Solo la ruta: el DSN y el endpoint pueden llevar credenciales.
  const detalle = resultado.error.issues.map((problema) => `${problema.path.join('.')}: ${problema.code}`).join('; ');
  throw new Error(`Variables de telemetría inválidas: ${detalle}`);
}

/** Endpoint, cabeceras y muestreo salen de las `OTEL_*` estándar, que leen los exportadores y el SDK. */
function iniciarOpenTelemetry(servicio: string, ambiente: string): void {
  new NodeSDK({
    serviceName: servicio,
    resource: resourceFromAttributes({ [ATRIBUTO_AMBIENTE]: ambiente }),
    traceExporter: new OTLPTraceExporter(),
    metricReaders: [new PeriodicExportingMetricReader({ exporter: new OTLPMetricExporter() })],
    logRecordProcessors: [new BatchLogRecordProcessor({ exporter: new OTLPLogExporter() })],
    instrumentations: [
      new HttpInstrumentation(),
      // 0.72 solo instrumenta @nestjs/core <12: con Nest 12 queda inactiva hasta que upstream lo admita (spec 21, riesgos).
      new NestInstrumentation(),
      // Sin span padre no se traza: el relay y BullMQ consultan cada segundo y llenarían la cuota.
      new PgInstrumentation({ requireParentSpan: true }),
      new IORedisInstrumentation({ requireParentSpan: true }),
      // El trace_id del log lo pone el mixin del logger; aquí solo se envían los logs a Grafana.
      new PinoInstrumentation({ disableLogCorrelation: true }),
    ],
  }).start();
}
