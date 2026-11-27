import type { Baja } from '../../domain/baja.js';
import type { CanalNotificacion } from '../../domain/canal.js';
import type { IntentoEntrega } from '../../domain/intento-entrega.js';
import type { Mensaje } from '../../domain/mensaje.js';
import type { OrigenPlantilla, Plantilla } from '../../domain/plantilla.js';
import type { Programacion } from '../../domain/programacion.js';
import type { ReferenciaProgramacion } from '../../domain/referencia-programacion.js';

// Todos corren en la transacción activa y filtran por el tenant del contexto además de la RLS (regla 3).

/** Una fila por código: la personalizada vigente si existe; si no, la base. */
export interface ResumenPlantilla {
  codigo: string;
  nombre: string;
  canal: CanalNotificacion;
  idioma: string;
  origen: OrigenPlantilla;
  version: number;
  asunto: string | null;
  actualizadoEn: Date;
}

export interface FiltroPlantillas {
  canal?: CanalNotificacion;
  /** Busca en nombre, código y asunto, sin distinguir mayúsculas. */
  texto?: string;
  /** Desde 1. */
  pagina: number;
  tamano: number;
}

export interface Pagina<Elemento> {
  items: Elemento[];
  total: number;
  pagina: number;
  tamano: number;
}

export interface RepositorioPlantillas {
  /** La del tenant activa de mayor versión; si no hay, la base activa de mayor versión. */
  vigente(codigo: string, canal: CanalNotificacion, idioma: string): Promise<Plantilla | null>;
  /** La base activa de mayor versión, si el tenant puede personalizarla. */
  basePersonalizable(codigo: string, canal: CanalNotificacion, idioma: string): Promise<Plantilla | null>;
  vigenteDelTenant(codigo: string, canal: CanalNotificacion, idioma: string): Promise<Plantilla | null>;
  /** 0 si el tenant nunca personalizó el código; cuenta las activas y las inactivas. */
  mayorVersionDelTenant(codigo: string, canal: CanalNotificacion, idioma: string): Promise<number>;
  /** Solo los códigos con base personalizable. */
  listar(filtro: FiltroPlantillas): Promise<Pagina<ResumenPlantilla>>;
  /** Las del tenant, de mayor a menor versión. */
  versiones(codigo: string, canal: CanalNotificacion, idioma: string): Promise<Plantilla[]>;
  /** Desactiva la vigente del tenant e inserta la nueva; conflicto del índice → VersionObsoletaPlantillaError. */
  guardarVersion(nueva: Plantilla, versionEsperada: number | null): Promise<void>;
  /** Pone activa = false en todas las del tenant; devuelve cuántas desactivó. */
  desactivarPersonalizacion(codigo: string, canal: CanalNotificacion, idioma: string): Promise<number>;
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
  /** El correo del mensaje más reciente con ese hash: el token del enlace de preferencias no lo lleva en claro. */
  ultimoDestino(destinoHash: string): Promise<string | null>;
}

export interface RepositorioContactosInvalidos {
  esInvalido(canal: CanalNotificacion, destinoHash: string): Promise<boolean>;
  /** Idempotente. */
  marcar(canal: CanalNotificacion, destinoHash: string, motivo: string): Promise<void>;
}

export interface RepositorioBajas {
  delDestino(canal: CanalNotificacion, destinoHash: string): Promise<Baja[]>;
  /** Idempotente: si ya existe la del mismo canal, alcance y destino, devuelve la existente. */
  registrar(baja: Baja): Promise<Baja>;
}

export interface RepositorioProgramaciones {
  obtener(programacionId: string): Promise<Programacion | null>;
  /** Las PROGRAMADA de la referencia; con plantilla, a lo más una (índice único de la viva). */
  vivas(referencia: ReferenciaProgramacion, plantillaCodigo?: string): Promise<Programacion[]>;
  /** Otra viva con la misma referencia y plantilla (carrera) → ProgramacionModificadaError. */
  insertar(programacion: Programacion): Promise<void>;
  /** ProgramacionModificadaError si la versión ya no es la esperada. */
  actualizar(programacion: Programacion, versionEsperada: number): Promise<void>;
}

/** Lo único que devuelve el barrido entre tenants. */
export interface ProgramacionAtrasada {
  programacionId: string;
  tenantId: string;
  version: number;
}

export interface LocalizadorProgramaciones {
  /** PROGRAMADA con `enviar_en` anterior a `antes`, de todos los tenants (función SECURITY DEFINER), fuera de toda transacción. */
  atrasadas(antes: Date, limite: number): Promise<ProgramacionAtrasada[]>;
}

export interface LocalizadorMensajes {
  /** Cruza tenants (función SECURITY DEFINER), fuera de toda transacción. */
  porIdExterno(idExterno: string): Promise<{ mensajeId: string; tenantId: string } | null>;
}
