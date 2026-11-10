import type { DataSource } from 'typeorm';
import type { EstadoOutbox, LectorEstadoOutbox } from '../../application/ports/estado-outbox.js';

// SQL crudo permitido (regla 11): llama a una función SECURITY DEFINER que agrega entre tenants (db/01h).
const CONSULTA_ESTADO = 'SELECT pendientes, fallidos, edad_pendiente_seg FROM sync.estado_outbox()';

interface FilaEstado {
  pendientes: string;
  fallidos: string;
  edad_pendiente_seg: number;
}

/** Fuera de toda transacción y sin tenant: la función no depende de la RLS de quien llama. */
export class LectorEstadoOutboxTypeOrm implements LectorEstadoOutbox {
  constructor(private readonly dataSource: DataSource) {}

  async leer(): Promise<EstadoOutbox> {
    const [fila] = (await this.dataSource.query(CONSULTA_ESTADO)) as FilaEstado[];
    if (!fila) throw new Error('sync.estado_outbox() no devolvió filas');
    // count(*) es bigint y pg lo entrega como texto.
    return { pendientes: Number(fila.pendientes), fallidos: Number(fila.fallidos), edadPendienteSeg: fila.edad_pendiente_seg };
  }
}
