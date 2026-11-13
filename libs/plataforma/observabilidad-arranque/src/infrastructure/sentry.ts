import * as Sentry from '@sentry/nestjs';

type EventoSentry = Parameters<NonNullable<Sentry.NodeOptions['beforeSend']>>[0];

/** Sin `tracesSampleRate`: las trazas son de OpenTelemetry; Sentry solo recibe errores ligados al span activo. */
export function iniciarSentry(dsn: string, ambiente: string): void {
  Sentry.init({
    dsn,
    environment: ambiente,
    integrations: [Sentry.openTelemetryIntegration()],
    beforeSend: limpiarEventoSentry,
  });
}

/** TR-RNF-026: el evento nunca lleva body, cookies, query ni encabezados de la solicitud. */
export function limpiarEventoSentry<T extends EventoSentry>(evento: T): T {
  if (!evento.request) return evento;
  const { method, url } = evento.request;
  return { ...evento, request: { method, url: url?.split('?')[0] } };
}
