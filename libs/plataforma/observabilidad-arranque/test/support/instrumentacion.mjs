// Como apps/*/src/instrumentacion.ts, sobre el dist de la lib (la prueba depende del build).
import { iniciarTelemetria } from '../../dist/index.js';

iniciarTelemetria({ servicio: 'vitrina-prueba' });
