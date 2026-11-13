/** Métricas técnicas del outbox entre tenants (spec 21, TR-RNF-106). Sin datos de ningún tenant. */
export interface EstadoOutbox {
  /** Eventos que el relay principal aún no leyó. */
  readonly pendientes: number;
  /** Entregas en la cola de fallidos con estado FALLIDO. */
  readonly fallidos: number;
  /** Segundos desde que se creó el pendiente más antiguo; 0 si no hay pendientes. */
  readonly edadPendienteSeg: number;
}

export interface LectorEstadoOutbox {
  leer(): Promise<EstadoOutbox>;
}
