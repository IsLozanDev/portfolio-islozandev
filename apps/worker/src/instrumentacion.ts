import { iniciarTelemetria } from '@vitrina/plataforma/observabilidad-arranque';
import { SERVICIO } from './servicio.js';

// Segundo --import (spec 21): OpenTelemetry y Sentry arrancan antes que main.js.
iniciarTelemetria({ servicio: SERVICIO });
