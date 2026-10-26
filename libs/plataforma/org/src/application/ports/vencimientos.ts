import type { AvisoVencimiento } from '../../domain/aviso-vencimiento.js';
import type { FechaCalendario } from '../../domain/fecha-calendario.js';

export interface SuscripcionARevisar {
  tenantId: string;
  suscripcionId: string;
}

/** Única lectura entre tenants de la tarea diaria; corre sin tenant en el contexto. */
export interface SuscripcionesARevisar {
  listar(fecha: FechaCalendario): Promise<SuscripcionARevisar[]>;
}

/** Dentro de la transacción del tenant. Devuelve false si ese aviso ya estaba registrado (TR-CA-021). */
export interface RepositorioAvisos {
  registrar(aviso: AvisoVencimiento): Promise<boolean>;
}

/** `plat.suscripcion.dias_gracia` del tenant (CFG); el adaptador vive en apps/worker. */
export interface DiasGracia {
  de(tenantId: string): Promise<number>;
}

export type Informar = (mensaje: string, datos: Record<string, unknown>) => void;
