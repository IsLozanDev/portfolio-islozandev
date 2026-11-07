import type { EventoBitacoraExportado } from './lectura-bitacora.js';

/**
 * Archivo de la exportación, escrito al vuelo sobre la respuesta (spec 18b). `abrir` es el primer
 * byte: se llama solo después de dejar auditada la exportación.
 */
export interface EscritorBitacora {
  abrir(): void;
  escribir(eventos: readonly EventoBitacoraExportado[]): Promise<void>;
  terminar(): Promise<void>;
}

export type FabricaEscritorBitacora = (destino: NodeJS.WritableStream) => EscritorBitacora;

export const FABRICA_ESCRITOR_BITACORA = Symbol('FABRICA_ESCRITOR_BITACORA');
