// Copia de apps/*/src/registrar-hooks.ts para el proceso de prueba.
import { register } from 'node:module';

if (process.env.OTEL_EXPORTER_OTLP_ENDPOINT) register('@opentelemetry/instrumentation/hook.mjs', import.meta.url);
