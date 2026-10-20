import type { RegistroAcceso } from '../../application/ports/registro-acceso.port.js';

const VENTANA_MS = 15 * 60_000;

/** Lo que se usa del DataSource de TypeORM. */
export interface Consultable {
  query(sql: string, params?: unknown[]): Promise<unknown>;
}

/**
 * Escribe `seg.usuario.ultimo_acceso` como mucho una vez cada 15 min por usuario (RNF-001).
 * Va fuera de UnitOfWork: no es un caso de uso ni emite eventos, y `seg.usuario` no tiene RLS.
 */
export class RegistroAccesoTypeorm implements RegistroAcceso {
  private readonly ultimaMarca = new Map<string, number>();

  constructor(
    private readonly db: Consultable,
    private readonly ahora: () => number = Date.now,
  ) {}

  async marcar(usuarioId: string): Promise<void> {
    const ahora = this.ahora();
    const previa = this.ultimaMarca.get(usuarioId);
    if (previa !== undefined && ahora - previa < VENTANA_MS) return;

    // Se anota antes de la consulta para que peticiones simultáneas no escriban dos veces.
    this.ultimaMarca.set(usuarioId, ahora);
    try {
      await this.db.query(
        `UPDATE seg.usuario SET ultimo_acceso = now()
          WHERE id = $1 AND (ultimo_acceso IS NULL OR ultimo_acceso < now() - interval '15 minutes')`,
        [usuarioId],
      );
    } catch (e) {
      this.ultimaMarca.delete(usuarioId);
      throw e;
    }
  }
}
