export const ARCHIVO_SISTEMA_PORT = Symbol('ArchivoSistemaPort');

export interface GuardarArchivoComando {
  categoria: string;
  nombreOriginal: string;
  mime: string;
  bytes: Uint8Array;
  entidadTipo: string;
  entidadId: string;
}

export interface ArchivoGuardado {
  archivoId: string;
  hashSha256: string;
  bytes: number;
}

/**
 * Archivos que sube el servidor, del tenant del contexto (spec 52): bytes que genera la plataforma o que devuelve
 * un tercero de confianza, como el XML firmado y el CDR de FE. Sin antivirus ni actor; nacen `DISPONIBLE`.
 */
export interface ArchivoSistemaPort {
  guardar(comando: GuardarArchivoComando): Promise<ArchivoGuardado>;
}
