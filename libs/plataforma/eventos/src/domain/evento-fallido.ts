import { EventoNoFallidoError, IntentosInvalidosError } from './errores.js';
import type { EventoEntregado } from './evento-entregado.js';

export type EstadoFallido = 'FALLIDO' | 'REPROCESANDO' | 'PROCESADO';

/** `sync.evento_fallido.error` es varchar(1000). */
export const LONGITUD_MAXIMA_ERROR = 1000;

export interface EventoFallidoProps {
  tenantId: string;
  consumidor: string;
  eventId: string;
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  error: string;
  intentos: number;
  estado: EstadoFallido;
  fallidoEn: Date;
  reprocesadoPor: string | null;
  reprocesadoEn: Date | null;
}

export interface DatosFallo {
  id: string;
  consumidor: string;
  evento: EventoEntregado;
  error: string;
  intentos: number;
  ahora: Date;
}

/**
 * Entrega que agotó sus reintentos (TR-RF-095). `REINTENTANDO` no se persiste: es el estado del trabajo
 * en BullMQ entre intentos. El error nunca lleva el payload del evento (TR-RNF-026).
 */
export class EventoFallido {
  private constructor(
    readonly id: string,
    readonly version: number,
    private props: EventoFallidoProps,
  ) {}

  static registrar(datos: DatosFallo): EventoFallido {
    validarIntentos(datos.intentos);
    return new EventoFallido(datos.id, 0, {
      tenantId: datos.evento.tenantId,
      consumidor: datos.consumidor,
      eventId: datos.evento.eventId,
      eventType: datos.evento.eventType,
      aggregateType: datos.evento.aggregateType,
      aggregateId: datos.evento.aggregateId,
      error: truncarError(datos.error),
      intentos: datos.intentos,
      estado: 'FALLIDO',
      fallidoEn: datos.ahora,
      reprocesadoPor: null,
      reprocesadoEn: null,
    });
  }

  static reconstituir(id: string, version: number, props: EventoFallidoProps): EventoFallido {
    return new EventoFallido(id, version, { ...props });
  }

  get tenantId(): string {
    return this.props.tenantId;
  }

  get consumidor(): string {
    return this.props.consumidor;
  }

  get eventId(): string {
    return this.props.eventId;
  }

  get eventType(): string {
    return this.props.eventType;
  }

  get aggregateType(): string {
    return this.props.aggregateType;
  }

  get aggregateId(): string {
    return this.props.aggregateId;
  }

  get error(): string {
    return this.props.error;
  }

  get intentos(): number {
    return this.props.intentos;
  }

  get estado(): EstadoFallido {
    return this.props.estado;
  }

  get fallidoEn(): Date {
    return this.props.fallidoEn;
  }

  get reprocesadoPor(): string | null {
    return this.props.reprocesadoPor;
  }

  get reprocesadoEn(): Date | null {
    return this.props.reprocesadoEn;
  }

  /** Un reproceso que vuelve a fallar: suma sus intentos a los anteriores y guarda el último error. */
  registrarFallo(error: string, intentos: number, ahora: Date): void {
    validarIntentos(intentos);
    this.props = {
      ...this.props,
      error: truncarError(error),
      intentos: this.props.intentos + intentos,
      estado: 'FALLIDO',
      fallidoEn: ahora,
    };
  }

  iniciarReproceso(usuarioId: string, ahora: Date): void {
    if (this.props.estado !== 'FALLIDO') throw new EventoNoFallidoError();
    this.props = { ...this.props, estado: 'REPROCESANDO', reprocesadoPor: usuarioId, reprocesadoEn: ahora };
  }

  /** false si ya estaba procesado: no hay nada que guardar. */
  marcarProcesado(): boolean {
    if (this.props.estado === 'PROCESADO') return false;
    this.props = { ...this.props, estado: 'PROCESADO' };
    return true;
  }
}

function validarIntentos(intentos: number): void {
  if (!Number.isInteger(intentos) || intentos < 1) throw new IntentosInvalidosError();
}

/** Por puntos de código, no por unidades UTF-16: cortar un par sustituto deja texto que PostgreSQL rechaza. */
function truncarError(error: string): string {
  return Array.from(error).slice(0, LONGITUD_MAXIMA_ERROR).join('');
}
