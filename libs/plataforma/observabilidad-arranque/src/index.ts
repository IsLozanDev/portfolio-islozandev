// TR-OBS base (spec 21): arranque de OpenTelemetry y Sentry con `node --import`. Sin Nest ni pino: lo que se
// importe aquí se carga antes que el SDK y queda sin instrumentar. Solo este archivo es público.
export { esquemaAmbiente } from './infrastructure/ambiente.js';
export { iniciarTelemetria, type OpcionesTelemetria, type TelemetriaIniciada } from './infrastructure/telemetria.js';
