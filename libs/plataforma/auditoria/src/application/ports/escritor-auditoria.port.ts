import type { EventoAuditoriaListado } from '../consultar-auditoria.js';

/** Una fila de la hoja: la de la lista y las rutas que cambiaron, sin el JSON de antes ni despues. */
export interface EventoAuditoriaExportado extends EventoAuditoriaListado {
  camposCambiados: string;
}

/**
 * Archivo de la exportación, escrito al vuelo sobre la respuesta (spec 20b). `abrir` es el primer byte:
 * se llama solo después de dejar auditada la exportación.
 */
export interface EscritorAuditoria {
  abrir(): void;
  escribir(eventos: readonly EventoAuditoriaExportado[]): Promise<void>;
  terminar(): Promise<void>;
}

export type FabricaEscritorAuditoria = (destino: NodeJS.WritableStream) => EscritorAuditoria;

export const FABRICA_ESCRITOR_AUDITORIA = Symbol('FABRICA_ESCRITOR_AUDITORIA');
