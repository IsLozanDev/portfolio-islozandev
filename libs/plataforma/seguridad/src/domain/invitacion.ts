import { ValidationError } from '@vitrina/plataforma/kernel';
import { InvitacionExpiradaError, InvitacionNoDisponibleError } from './errores.js';

export type EstadoInvitacion = 'VIGENTE' | 'EXPIRADA' | 'USADA' | 'ANULADA';

export interface DatosEmision {
  tenantId: string;
  membresiaId: string;
  /** sha256 hex del token; el token no se guarda. */
  tokenHash: string;
  creadaPor: string;
  ahora: Date;
  horas: number;
}

export interface InvitacionProps {
  tenantId: string;
  membresiaId: string;
  tokenHash: string;
  expiraEn: Date;
  usadaEn: Date | null;
  anuladaEn: Date | null;
  creadaPor: string;
  creadaEn: Date;
}

const HASH = /^[0-9a-f]{64}$/;

/** Invitación de un solo uso con vigencia propia (72 h por defecto), independiente del enlace de Supabase. */
export class Invitacion {
  private constructor(
    readonly id: string,
    private props: InvitacionProps,
  ) {}

  static emitir(id: string, d: DatosEmision): Invitacion {
    if (!HASH.test(d.tokenHash)) throw new ValidationError('El hash del token debe ser sha256 en hexadecimal');
    if (!Number.isInteger(d.horas) || d.horas < 1) throw new ValidationError('La vigencia de la invitación debe ser de al menos 1 hora');
    return new Invitacion(id, {
      tenantId: d.tenantId,
      membresiaId: d.membresiaId,
      tokenHash: d.tokenHash,
      expiraEn: new Date(d.ahora.getTime() + d.horas * 3_600_000),
      usadaEn: null,
      anuladaEn: null,
      creadaPor: d.creadaPor,
      creadaEn: d.ahora,
    });
  }

  static reconstituir(id: string, props: InvitacionProps): Invitacion {
    return new Invitacion(id, { ...props });
  }

  get tenantId(): string {
    return this.props.tenantId;
  }

  get membresiaId(): string {
    return this.props.membresiaId;
  }

  get tokenHash(): string {
    return this.props.tokenHash;
  }

  get expiraEn(): Date {
    return this.props.expiraEn;
  }

  get usadaEn(): Date | null {
    return this.props.usadaEn;
  }

  get anuladaEn(): Date | null {
    return this.props.anuladaEn;
  }

  get creadaPor(): string {
    return this.props.creadaPor;
  }

  get creadaEn(): Date {
    return this.props.creadaEn;
  }

  estado(ahora: Date): EstadoInvitacion {
    if (this.props.anuladaEn !== null) return 'ANULADA';
    if (this.props.usadaEn !== null) return 'USADA';
    return ahora.getTime() >= this.props.expiraEn.getTime() ? 'EXPIRADA' : 'VIGENTE';
  }

  usar(ahora: Date): void {
    const estado = this.estado(ahora);
    if (estado === 'EXPIRADA') throw new InvitacionExpiradaError();
    if (estado !== 'VIGENTE') throw new InvitacionNoDisponibleError(estado);
    this.props = { ...this.props, usadaEn: ahora };
  }

  /** Al reinvitar o finalizar. Una vencida sin usar también se anula: libera la pendiente de la membresía. */
  anular(ahora: Date): void {
    if (this.props.usadaEn !== null) throw new InvitacionNoDisponibleError('USADA');
    if (this.props.anuladaEn === null) this.props = { ...this.props, anuladaEn: ahora };
  }
}
