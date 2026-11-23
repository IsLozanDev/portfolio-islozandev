import type { Emisor } from '../../domain/emisor.js';

/** Sobre la transacción activa y el tenant del contexto (regla 3). */
export interface RepositorioEmisores {
  porEmpresa(empresaId: string): Promise<Emisor | null>;
  porId(emisorId: string): Promise<Emisor | null>;
  /** VersionObsoletaEmisorError si otra operación creó el emisor de la empresa primero. */
  insertar(emisor: Emisor): Promise<void>;
  /** Solo si la fila sigue en `versionEsperada`; si no, VersionObsoletaEmisorError. */
  actualizar(emisor: Emisor, versionEsperada: number): Promise<void>;
}
