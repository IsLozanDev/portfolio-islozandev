import * as Sentry from '@sentry/nestjs';
import type { ReportadorErrores } from '@vitrina/plataforma/kernel-infra';

/** Sin `Sentry.init` (falta SENTRY_DSN), `captureException` no envía nada. */
export class ReportadorErroresSentry implements ReportadorErrores {
  reportar(error: unknown, contexto?: Record<string, string>): void {
    Sentry.captureException(error, contexto ? { tags: contexto } : undefined);
  }
}
