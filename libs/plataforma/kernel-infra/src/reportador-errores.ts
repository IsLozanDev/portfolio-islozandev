/** Puerto para avisar errores inesperados a un servicio externo (Sentry, spec 21). Lo implementa `observabilidad`. */
export interface ReportadorErrores {
  reportar(error: unknown, contexto?: Record<string, string>): void;
}

export const REPORTADOR_ERRORES = Symbol('REPORTADOR_ERRORES');

/** Sin observabilidad configurada (pruebas, CLI), los errores solo van al log. */
export const REPORTADOR_SIN_ENVIO: ReportadorErrores = { reportar: () => undefined };
