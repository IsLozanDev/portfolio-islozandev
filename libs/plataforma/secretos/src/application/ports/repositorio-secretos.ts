export interface SecretoGuardado {
  id: string;
  tenantId: string;
  tipo: string;
  /** Texto cifrado seguido de la etiqueta GCM. */
  cifrado: Uint8Array;
  iv: Uint8Array;
  /** Sube en cada rotación: bloqueo optimista. */
  version: number;
  creadoPor: string;
  rotadoPor: string | null;
  rotadoEn: Date | null;
}

/** sec.secreto del tenant del contexto, sobre la transacción activa. */
export interface RepositorioSecretos {
  obtener(secretoId: string): Promise<SecretoGuardado | null>;
  insertar(secreto: SecretoGuardado): Promise<void>;
  /** Guarda cifrado, IV y rotación, y sube la versión. SecretoModificadoError si la versión ya no es `versionEsperada`. */
  actualizar(secreto: SecretoGuardado, versionEsperada: number): Promise<void>;
  /** `false` si no existía. */
  borrar(secretoId: string): Promise<boolean>;
}
