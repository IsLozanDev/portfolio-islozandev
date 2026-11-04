import { AggregateRoot } from '@vitrina/plataforma/kernel';
import {
  MotivoSoporteInvalidoError,
  SoporteAutoaprobacionError,
  TicketInvalidoError,
  TransicionSoporteError,
  VigenciaSoporteExcedidaError,
  VigenciaSoporteInvalidaError,
} from './errores.js';
import { EVENTOS_SEG, type SoporteAprobado, type SoporteCerrado, type SoporteExpirado, type SoporteSolicitado } from './eventos.js';
import { motivo as validarMotivo } from './texto.js';

export type ModoSoporte = 'LECTURA' | 'ESCRITURA';
export type EstadoSoporte = 'PENDIENTE' | 'APROBADO' | 'RECHAZADO' | 'REVOCADO' | 'EXPIRADO';
export type CausaCierreSoporte = 'RECHAZO' | 'ADMINISTRADOR' | 'TICKET_CERRADO' | 'VENCIMIENTO';
export type CausaRevocacionSoporte = Extract<CausaCierreSoporte, 'ADMINISTRADOR' | 'TICKET_CERRADO'>;

export const HORAS_MINIMAS_SOPORTE = 1;
export const HORAS_MAXIMAS_SOPORTE = 4;
export const HORAS_CADUCIDAD_SOLICITUD = 24;
const MOTIVO_SOPORTE_MINIMO = 10;
const MOTIVO_SOPORTE_MAXIMO = 300;
const FORMATO_TICKET = /^SOP-\d{6}$/;
const MILISEGUNDOS_POR_HORA = 3_600_000;

/** Ticket de TR-SOP (TR-RF-020): SOP-######. */
export function ticketSoporte(valor: string): string {
  const limpio = valor.trim().toUpperCase();
  if (!FORMATO_TICKET.test(limpio)) throw new TicketInvalidoError();
  return limpio;
}

export function motivoSoporte(valor: string): string {
  const limpio = valor.trim();
  if (limpio.length < MOTIVO_SOPORTE_MINIMO || limpio.length > MOTIVO_SOPORTE_MAXIMO) throw new MotivoSoporteInvalidoError();
  return limpio;
}

/** Horas enteras de 1 a 4. Más de 4 tiene su propio error (TR-CA-054). */
export function vigenciaSoporte(horas: number): number {
  if (!Number.isInteger(horas) || horas < HORAS_MINIMAS_SOPORTE) throw new VigenciaSoporteInvalidaError();
  if (horas > HORAS_MAXIMAS_SOPORTE) throw new VigenciaSoporteExcedidaError();
  return horas;
}

function sumarHoras(fecha: Date, horas: number): Date {
  return new Date(fecha.getTime() + horas * MILISEGUNDOS_POR_HORA);
}

export interface DatosSolicitudSoporte {
  tenantId: string;
  agenteId: string;
  ticket: string;
  motivo: string;
  modo: ModoSoporte;
  horas: number;
}

export interface DatosAprobacionSoporte {
  aprobadoPor: string;
  horas: number;
  membresiaId: string;
  asignacionId: string;
}

export interface AccesoSoporteProps {
  tenantId: string;
  agenteId: string;
  ticket: string;
  motivo: string;
  modo: ModoSoporte;
  horasSolicitadas: number;
  estado: EstadoSoporte;
  solicitadoEn: Date;
  caducaEn: Date;
  aprobadoPor: string | null;
  horasAprobadas: number | null;
  desde: Date | null;
  hasta: Date | null;
  membresiaId: string | null;
  asignacionId: string | null;
  cerradoPor: string | null;
  cerradoEn: Date | null;
  motivoCierre: string | null;
  causaCierre: CausaCierreSoporte | null;
}

/** Acceso temporal de un agente de soporte al tenant de un cliente (TR-RF-020, TR-RN-011). */
export class AccesoSoporte extends AggregateRoot {
  private constructor(
    id: string,
    version: number,
    private props: AccesoSoporteProps,
  ) {
    super(id, version);
  }

  static solicitar(id: string, datos: DatosSolicitudSoporte, ahora: Date): AccesoSoporte {
    const acceso = new AccesoSoporte(id, 0, {
      tenantId: datos.tenantId,
      agenteId: datos.agenteId,
      ticket: ticketSoporte(datos.ticket),
      motivo: motivoSoporte(datos.motivo),
      modo: datos.modo,
      horasSolicitadas: vigenciaSoporte(datos.horas),
      estado: 'PENDIENTE',
      solicitadoEn: ahora,
      caducaEn: sumarHoras(ahora, HORAS_CADUCIDAD_SOLICITUD),
      aprobadoPor: null,
      horasAprobadas: null,
      desde: null,
      hasta: null,
      membresiaId: null,
      asignacionId: null,
      cerradoPor: null,
      cerradoEn: null,
      motivoCierre: null,
      causaCierre: null,
    });
    const payload: SoporteSolicitado = {
      ...acceso.identidad(),
      agente_id: acceso.props.agenteId,
      ticket: acceso.props.ticket,
      modo: acceso.props.modo,
      horas_solicitadas: acceso.props.horasSolicitadas,
    };
    acceso.publicar(EVENTOS_SEG.soporteSolicitado, payload);
    return acceso;
  }

  static reconstituir(id: string, version: number, props: AccesoSoporteProps): AccesoSoporte {
    return new AccesoSoporte(id, version, { ...props });
  }

  get tenantId(): string {
    return this.props.tenantId;
  }

  get agenteId(): string {
    return this.props.agenteId;
  }

  get ticket(): string {
    return this.props.ticket;
  }

  get motivo(): string {
    return this.props.motivo;
  }

  get modo(): ModoSoporte {
    return this.props.modo;
  }

  get horasSolicitadas(): number {
    return this.props.horasSolicitadas;
  }

  get estado(): EstadoSoporte {
    return this.props.estado;
  }

  get solicitadoEn(): Date {
    return this.props.solicitadoEn;
  }

  get caducaEn(): Date {
    return this.props.caducaEn;
  }

  get aprobadoPor(): string | null {
    return this.props.aprobadoPor;
  }

  get horasAprobadas(): number | null {
    return this.props.horasAprobadas;
  }

  get desde(): Date | null {
    return this.props.desde;
  }

  get hasta(): Date | null {
    return this.props.hasta;
  }

  get membresiaId(): string | null {
    return this.props.membresiaId;
  }

  get asignacionId(): string | null {
    return this.props.asignacionId;
  }

  get cerradoPor(): string | null {
    return this.props.cerradoPor;
  }

  get cerradoEn(): Date | null {
    return this.props.cerradoEn;
  }

  get motivoCierre(): string | null {
    return this.props.motivoCierre;
  }

  get causaCierre(): CausaCierreSoporte | null {
    return this.props.causaCierre;
  }

  vigente(ahora: Date): boolean {
    return this.props.estado === 'APROBADO' && this.props.hasta !== null && ahora < this.props.hasta;
  }

  /** Pendiente cuya caducidad de 24 h ya pasó. */
  caducada(ahora: Date): boolean {
    return this.props.estado === 'PENDIENTE' && this.props.caducaEn <= ahora;
  }

  /** Aprobado cuya vigencia terminó, o pendiente caducado: lo que `expirar` acepta. */
  vencible(ahora: Date): boolean {
    return (this.props.estado === 'APROBADO' && !this.vigente(ahora)) || this.caducada(ahora);
  }

  /** Devuelve la vigencia aprobada: la membresía y la asignación del agente la copian. */
  aprobar(datos: DatosAprobacionSoporte, ahora: Date): { desde: Date; hasta: Date } {
    const horas = vigenciaSoporte(datos.horas);
    this.exigir(['PENDIENTE'], 'aprobar');
    if (this.caducada(ahora)) throw new TransicionSoporteError('EXPIRADO', 'aprobar');
    if (datos.aprobadoPor === this.props.agenteId) throw new SoporteAutoaprobacionError();
    const hasta = sumarHoras(ahora, horas);
    this.props = {
      ...this.props,
      estado: 'APROBADO',
      aprobadoPor: datos.aprobadoPor,
      horasAprobadas: horas,
      desde: ahora,
      hasta,
      membresiaId: datos.membresiaId,
      asignacionId: datos.asignacionId,
    };
    const payload: SoporteAprobado = {
      ...this.identidad(),
      agente_id: this.props.agenteId,
      aprobado_por: datos.aprobadoPor,
      desde: ahora.toISOString(),
      hasta: hasta.toISOString(),
      modo: this.props.modo,
    };
    this.publicar(EVENTOS_SEG.soporteAprobado, payload);
    return { desde: ahora, hasta };
  }

  rechazar(motivo: string, por: string, ahora: Date): void {
    this.exigir(['PENDIENTE'], 'rechazar');
    this.cerrar('RECHAZADO', 'RECHAZO', validarMotivo(motivo), por, ahora, EVENTOS_SEG.soporteRechazado);
  }

  /** Un pendiente solo se cierra por ticket cerrado, y queda RECHAZADO. `por` es NULL cuando lo pide TR-SOP. */
  revocar(causa: CausaRevocacionSoporte, motivo: string, por: string | null, ahora: Date): void {
    const texto = validarMotivo(motivo);
    if (this.props.estado === 'PENDIENTE' && causa === 'TICKET_CERRADO') {
      this.cerrar('RECHAZADO', causa, texto, por, ahora, EVENTOS_SEG.soporteRechazado);
      return;
    }
    this.exigir(['APROBADO'], 'revocar');
    this.cerrar('REVOCADO', causa, texto, por, ahora, EVENTOS_SEG.soporteRevocado);
  }

  expirar(ahora: Date): void {
    const estadoAnterior = this.props.estado;
    if (!this.vencible(ahora)) throw new TransicionSoporteError(estadoAnterior, 'expirar');
    this.props = { ...this.props, estado: 'EXPIRADO', cerradoEn: ahora, causaCierre: 'VENCIMIENTO' };
    const payload: SoporteExpirado = { ...this.identidad(), estado_anterior: estadoAnterior };
    this.publicar(EVENTOS_SEG.soporteExpirado, payload);
  }

  private exigir(estados: readonly EstadoSoporte[], accion: string): void {
    if (!estados.includes(this.props.estado)) throw new TransicionSoporteError(this.props.estado, accion);
  }

  private cerrar(
    estado: EstadoSoporte,
    causa: CausaCierreSoporte,
    motivo: string,
    por: string | null,
    ahora: Date,
    eventType: string,
  ): void {
    this.props = { ...this.props, estado, cerradoPor: por, cerradoEn: ahora, motivoCierre: motivo, causaCierre: causa };
    const payload: SoporteCerrado = { ...this.identidad(), cerrado_por: por, causa };
    this.publicar(eventType, payload);
  }

  private identidad(): { acceso_id: string; tenant_id: string } {
    return { acceso_id: this.id, tenant_id: this.props.tenantId };
  }

  private publicar(eventType: string, payload: object): void {
    this.raise({ eventType, aggregateType: 'acceso_soporte', schemaVersion: 1, payload });
  }
}
