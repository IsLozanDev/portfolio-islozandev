import { register } from 'node:module';

// Primer --import: el hook ESM de OpenTelemetry debe existir antes de cargar pg, ioredis y Nest. Sin endpoint no se registra.
if (process.env.OTEL_EXPORTER_OTLP_ENDPOINT) register('@opentelemetry/instrumentation/hook.mjs', import.meta.url);
