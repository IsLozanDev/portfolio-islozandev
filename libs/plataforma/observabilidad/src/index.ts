// TR-OBS base (spec 21): logs, trazas, métricas técnicas y errores. Solo este archivo es público.
export { CAMPOS_DOCUMENTO, CAMPOS_SENSIBLES, rutasRedactadas, TEXTO_REDACTADO, valorCensurado } from './domain/campos-redactados.js';
export { hashDocumento } from './domain/hash-documento.js';
export { ObservabilidadModule, type ObservabilidadOpciones } from './interface/observabilidad.module.js';
export { usarLoggerDeObservabilidad } from './interface/usar-logger.js';
export { registrarMetricasOutbox } from './infrastructure/metricas-outbox.js';
export { camposEntornoObservabilidad, exigirSalFueraDeLocal, salDocumento } from './infrastructure/entorno-observabilidad.js';
