import type { CanalNotificacion } from '../../domain/canal.js';
import type { IntentoEntrega } from '../../domain/intento-entrega.js';
import type { Mensaje } from '../../domain/mensaje.js';
import type { Plantilla } from '../../domain/plantilla.js';

// Todos corren en la transacción activa y filtran por el tenant del contexto además de la RLS (regla 3).

export interface RepositorioPlantillas {
  /** La del tenant activa de mayor versión; si no hay, la base activa de mayor versión. */
  vigente(codigo: string, canal: CanalNotificacion, idioma: string): Promise<Plantilla | null>;
}

export interface RepositorioMensajes {
  porClave(claveIdempotencia: string): Promise<Mensaje | null>;
  obtener(mensajeId: string): Promise<Mensaje | null>;
  /** Conflicto de clave (otra transacción la usó antes) → devuelve el mensaje existente, no el nuevo. */
  insertar(mensaje: Mensaje): Promise<Mensaje>;
  /** MensajeModificadoError si la versión ya no es la esperada. */
  actualizar(mensaje: Mensaje, versionEsperada: number): Promise<void>;
  registrarIntento(intento: IntentoEntrega): Promise<void>;
  /** Para numerar los avisos del proveedor después de los intentos de entrega. */
  siguienteNumeroIntento(mensajeId: string): Promise<number>;
}

export interface RepositorioContactosInvalidos {
  esInvalido(canal: CanalNotificacion, destinoHash: string): Promise<boolean>;
  /** Idempotente. */
  marcar(canal: CanalNotificacion, destinoHash: string, motivo: string): Promise<void>;
}

export interface LocalizadorMensajes {
  /** Cruza tenants (función SECURITY DEFINER), fuera de toda transacción. */
  porIdExterno(idExterno: string): Promise<{ mensajeId: string; tenantId: string } | null>;
}
