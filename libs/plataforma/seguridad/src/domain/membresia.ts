import { AggregateRoot } from '@vitrina/plataforma/kernel';
import { MembresiaExistenteError, TransicionMembresiaError } from './errores.js';
import { EVENTOS_SEG, type MembresiaAceptada, type MembresiaCambiada, type MembresiaFinalizada, type MembresiaInvitada } from './eventos.js';
import { motivo as validarMotivo } from './texto.js';

export type EstadoMembresia = 'INVITADO' | 'ACTIVO' | 'SUSPENDIDO' | 'FINALIZADO';

export interface DatosInvitacionMembresia {
  usuarioId: string;
  tenantId: string;
  invitadoPor: string;
  /** Solo el alta de tenant invita al propietario (spec 12). Por defecto, false. */
  esPropietario?: boolean;
}

export interface MembresiaProps {
  usuarioId: string;
  tenantId: string;
  estado: EstadoMembresia;
  esPropietario: boolean;
  invitadoPor: string | null;
  desde: Date;
  hasta: Date | null;
  /** Último cambio de estado hecho por una persona (suspender, reactivar, finalizar). */
  motivo: string | null;
  cambiadoPor: string | null;
  cambiadoEn: Date | null;
}

/** Vínculo de un usuario con un tenant y su ciclo de vida (TR-RF-009, TR-RF-010, TR-RF-014). */
export class Membresia extends AggregateRoot {
  private constructor(
    id: string,
    version: number,
    private props: MembresiaProps,
  ) {
    super(id, version);
  }

  /** `expiraEn` es el de la invitación emitida junto con la membresía; solo va en el evento. */
  static invitar(id: string, datos: DatosInvitacionMembresia, ahora: Date, expiraEn: Date): Membresia {
    const m = new Membresia(id, 0, {
      usuarioId: datos.usuarioId,
      tenantId: datos.tenantId,
      estado: 'INVITADO',
      esPropietario: datos.esPropietario ?? false,
      invitadoPor: datos.invitadoPor,
      desde: ahora,
      hasta: null,
      motivo: null,
      cambiadoPor: null,
      cambiadoEn: null,
    });
    m.publicarInvitada(datos.invitadoPor, false, expiraEn);
    return m;
  }

  static reconstituir(id: string, version: number, props: MembresiaProps): Membresia {
    return new Membresia(id, version, { ...props });
  }

  get usuarioId(): string {
    return this.props.usuarioId;
  }

  get tenantId(): string {
    return this.props.tenantId;
  }

  get estado(): EstadoMembresia {
    return this.props.estado;
  }

  get esPropietario(): boolean {
    return this.props.esPropietario;
  }

  get invitadoPor(): string | null {
    return this.props.invitadoPor;
  }

  get desde(): Date {
    return this.props.desde;
  }

  get hasta(): Date | null {
    return this.props.hasta;
  }

  get motivo(): string | null {
    return this.props.motivo;
  }

  get cambiadoPor(): string | null {
    return this.props.cambiadoPor;
  }

  get cambiadoEn(): Date | null {
    return this.props.cambiadoEn;
  }

  /** INVITADO reenvía; FINALIZADO reingresa (sin `hasta`). ACTIVO o SUSPENDIDO ya son miembros. */
  reinvitar(por: string, ahora: Date, expiraEn: Date): void {
    const { estado } = this.props;
    if (estado === 'ACTIVO' || estado === 'SUSPENDIDO') throw new MembresiaExistenteError(estado);
    if (estado === 'FINALIZADO') {
      this.props = { ...this.props, estado: 'INVITADO', desde: ahora, hasta: null, invitadoPor: por };
    }
    this.publicarInvitada(por, true, expiraEn);
  }

  aceptar(ahora: Date): void {
    this.exigir(['INVITADO'], 'aceptar');
    this.props = { ...this.props, estado: 'ACTIVO', desde: ahora };
    const payload: MembresiaAceptada = { usuario_id: this.props.usuarioId };
    this.raise({ eventType: EVENTOS_SEG.membresiaAceptada, aggregateType: 'membresia', schemaVersion: 1, payload });
  }

  suspender(motivo: string, por: string, ahora: Date): void {
    this.exigir(['ACTIVO'], 'suspender');
    this.cambiar('SUSPENDIDO', motivo, por, ahora, EVENTOS_SEG.membresiaSuspendida);
  }

  reactivar(motivo: string, por: string, ahora: Date): void {
    this.exigir(['SUSPENDIDO'], 'reactivar');
    this.cambiar('ACTIVO', motivo, por, ahora, EVENTOS_SEG.membresiaReactivada);
  }

  /** `asignacionesRevocadas`: las que el caso de uso revoca en la misma transacción. */
  finalizar(motivo: string, por: string, ahora: Date, asignacionesRevocadas: readonly string[]): void {
    this.exigir(['INVITADO', 'ACTIVO', 'SUSPENDIDO'], 'finalizar');
    const texto = validarMotivo(motivo);
    this.props = { ...this.props, estado: 'FINALIZADO', hasta: ahora, motivo: texto, cambiadoPor: por, cambiadoEn: ahora };
    const payload: MembresiaFinalizada = {
      usuario_id: this.props.usuarioId,
      motivo: texto,
      por,
      asignaciones_revocadas: [...asignacionesRevocadas].sort(),
    };
    this.raise({ eventType: EVENTOS_SEG.membresiaFinalizada, aggregateType: 'membresia', schemaVersion: 1, payload });
  }

  private exigir(estados: readonly EstadoMembresia[], accion: string): void {
    if (!estados.includes(this.props.estado)) throw new TransicionMembresiaError(this.props.estado, accion);
  }

  private cambiar(estado: EstadoMembresia, motivo: string, por: string, ahora: Date, eventType: string): void {
    const texto = validarMotivo(motivo);
    this.props = { ...this.props, estado, motivo: texto, cambiadoPor: por, cambiadoEn: ahora };
    const payload: MembresiaCambiada = { usuario_id: this.props.usuarioId, motivo: texto, por };
    this.raise({ eventType, aggregateType: 'membresia', schemaVersion: 1, payload });
  }

  private publicarInvitada(por: string, reinvitacion: boolean, expiraEn: Date): void {
    const payload: MembresiaInvitada = {
      usuario_id: this.props.usuarioId,
      invitado_por: por,
      reinvitacion,
      expira_en: expiraEn.toISOString(),
    };
    this.raise({ eventType: EVENTOS_SEG.membresiaInvitada, aggregateType: 'membresia', schemaVersion: 1, payload });
  }
}
