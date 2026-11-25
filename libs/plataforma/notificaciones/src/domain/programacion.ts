import type { Destinatario } from './destinatario.js';
import { FechaEnvioFueraDeHorizonteError, FechaEnvioNoFuturaError } from './errores.js';
import type { FinalidadNotificacion } from './finalidad-notificacion.js';
import type { ReferenciaProgramacion } from './referencia-programacion.js';
import type { ValoresVariables } from './renderizador-plantilla.js';

export const ESTADOS_PROGRAMACION = ['PROGRAMADA', 'ENVIADA', 'CANCELADA', 'DESCARTADA'] as const;
export type EstadoProgramacion = (typeof ESTADOS_PROGRAMACION)[number];

export const HORIZONTE_MAXIMO_DIAS = 366;
export const VERSION_INICIAL_PROGRAMACION = 1;
/** Largo de `ntf.programacion.motivo`. */
export const LARGO_MAXIMO_MOTIVO = 40;
const MILISEGUNDOS_POR_DIA = 86_400_000;

/** Lo que el llamador fija al programar y puede cambiar al reprogramar. */
export interface DatosProgramables {
  destinatario: Destinatario;
  variables: ValoresVariables;
  finalidad: FinalidadNotificacion;
  enviarEn: Date;
}

export interface DatosProgramacion extends DatosProgramables {
  id: string;
  tenantId: string;
  referencia: ReferenciaProgramacion;
  plantillaCodigo: string;
  estado: EstadoProgramacion;
  /** Estado del mensaje cuando quedó DESCARTADA. */
  motivo: string | null;
  mensajeId: string | null;
  version: number;
  creadoPor: string | null;
  modificadoEn: Date | null;
}

export type ProgramacionNueva = Pick<DatosProgramacion, 'id' | 'tenantId' | 'referencia' | 'plantillaCodigo' | 'creadoPor'> & DatosProgramables;

/**
 * Un recordatorio futuro de una referencia del producto (TR-RF-076). Solo cambia mientras está PROGRAMADA; cada
 * cambio sube la versión, que también invalida el trabajo encolado para la versión anterior. Las transiciones
 * devuelven si hubo cambio.
 */
export class Programacion {
  private constructor(private datos: DatosProgramacion) {}

  static programar(nueva: ProgramacionNueva, ahora: Date): Programacion {
    exigirFechaProgramable(nueva.enviarEn, ahora);
    return new Programacion({
      ...nueva,
      estado: 'PROGRAMADA',
      motivo: null,
      mensajeId: null,
      version: VERSION_INICIAL_PROGRAMACION,
      modificadoEn: null,
    });
  }

  static reconstituir(datos: DatosProgramacion): Programacion {
    return new Programacion({ ...datos });
  }

  get id(): string {
    return this.datos.id;
  }

  get estado(): EstadoProgramacion {
    return this.datos.estado;
  }

  get version(): number {
    return this.datos.version;
  }

  get enviarEn(): Date {
    return this.datos.enviarEn;
  }

  get estaViva(): boolean {
    return this.datos.estado === 'PROGRAMADA';
  }

  instantanea(): DatosProgramacion {
    return { ...this.datos };
  }

  reprogramar(cambios: DatosProgramables, ahora: Date): boolean {
    if (!this.estaViva) return false;
    exigirFechaProgramable(cambios.enviarEn, ahora);
    this.cambiar({ ...cambios }, ahora);
    return true;
  }

  cancelar(ahora: Date): boolean {
    return this.terminar({ estado: 'CANCELADA' }, ahora);
  }

  marcarEnviada(mensajeId: string, ahora: Date): boolean {
    return this.terminar({ estado: 'ENVIADA', mensajeId }, ahora);
  }

  descartar(motivo: string, mensajeId: string | null, ahora: Date): boolean {
    return this.terminar({ estado: 'DESCARTADA', motivo: motivo.slice(0, LARGO_MAXIMO_MOTIVO), mensajeId }, ahora);
  }

  private terminar(cambios: Partial<DatosProgramacion>, ahora: Date): boolean {
    if (!this.estaViva) return false;
    this.cambiar(cambios, ahora);
    return true;
  }

  private cambiar(cambios: Partial<DatosProgramacion>, ahora: Date): void {
    this.datos = { ...this.datos, ...cambios, version: this.datos.version + 1, modificadoEn: ahora };
  }
}

/** TR-CA-192 y horizonte de 366 días. */
function exigirFechaProgramable(enviarEn: Date, ahora: Date): void {
  if (enviarEn.getTime() <= ahora.getTime()) throw new FechaEnvioNoFuturaError();
  if (enviarEn.getTime() > ahora.getTime() + HORIZONTE_MAXIMO_DIAS * MILISEGUNDOS_POR_DIA) {
    throw new FechaEnvioFueraDeHorizonteError(HORIZONTE_MAXIMO_DIAS);
  }
}
