import type { CanalNotificacion } from './canal.js';
import { avanzar, type EstadoMensaje } from './estado-mensaje.js';
import type { FinalidadNotificacion } from './finalidad-notificacion.js';

/** Largo de `ntf.mensaje.motivo_fallo`. */
export const LARGO_MAXIMO_MOTIVO_FALLO = 300;
export const VERSION_INICIAL_MENSAJE = 1;

export interface DatosMensaje {
  id: string;
  tenantId: string;
  plantillaId: string;
  canal: CanalNotificacion;
  /** En claro: el proveedor lo necesita al reintentar. Nunca va a logs, errores ni eventos. */
  destino: string;
  destinoHash: string;
  personaId: string | null;
  finalidad: FinalidadNotificacion;
  /** Ya renderizados: un reintento envía lo mismo aunque la plantilla cambie. */
  asunto: string;
  cuerpo: string;
  claveIdempotencia: string;
  estado: EstadoMensaje;
  idExterno: string | null;
  motivoFallo: string | null;
  programadoPara: Date | null;
  enviadoEn: Date | null;
  entregadoEn: Date | null;
  version: number;
  creadoPor: string | null;
  modificadoEn: Date | null;
}

export type MensajeNuevo = Omit<DatosMensaje, 'idExterno' | 'enviadoEn' | 'entregadoEn' | 'version' | 'modificadoEn'>;

/** Un mensaje de un canal. Sus estados solo avanzan (`avanzar`); cada cambio devuelve si hubo cambio. */
export class Mensaje {
  private constructor(private datos: DatosMensaje) {}

  static registrar(nuevo: MensajeNuevo): Mensaje {
    return new Mensaje({
      ...nuevo,
      motivoFallo: recortarMotivo(nuevo.motivoFallo),
      idExterno: null,
      enviadoEn: null,
      entregadoEn: null,
      version: VERSION_INICIAL_MENSAJE,
      modificadoEn: null,
    });
  }

  static reconstituir(datos: DatosMensaje): Mensaje {
    return new Mensaje({ ...datos });
  }

  get id(): string {
    return this.datos.id;
  }

  get estado(): EstadoMensaje {
    return this.datos.estado;
  }

  get version(): number {
    return this.datos.version;
  }

  get destinoHash(): string {
    return this.datos.destinoHash;
  }

  get programadoPara(): Date | null {
    return this.datos.programadoPara;
  }

  /** Copia de los datos, para persistir y para enviar. */
  instantanea(): DatosMensaje {
    return { ...this.datos };
  }

  marcarEnviado(idExterno: string, en: Date): boolean {
    if (!this.pasarA('ENVIADO', en)) return false;
    this.datos = { ...this.datos, idExterno, enviadoEn: en };
    return true;
  }

  marcarEntregado(en: Date): boolean {
    if (!this.pasarA('ENTREGADO', en)) return false;
    this.datos = { ...this.datos, entregadoEn: en };
    return true;
  }

  marcarLeido(en: Date): boolean {
    return this.pasarA('LEIDO', en);
  }

  marcarFallido(motivo: string, en: Date): boolean {
    if (!this.pasarA('FALLIDO', en)) return false;
    this.datos = { ...this.datos, motivoFallo: recortarMotivo(motivo) };
    return true;
  }

  private pasarA(nuevo: EstadoMensaje, en: Date): boolean {
    const siguiente = avanzar(this.datos.estado, nuevo);
    if (siguiente === null) return false;
    this.datos = { ...this.datos, estado: siguiente, modificadoEn: en };
    return true;
  }
}

function recortarMotivo(motivo: string | null): string | null {
  return motivo === null ? null : motivo.slice(0, LARGO_MAXIMO_MOTIVO_FALLO);
}
