import type { BitacoraIngreso, EventoIngreso, UsuarioDeIngreso } from '../../application/ports/bitacora-ingreso.port.js';
import { ipLegible } from '../origen-peticion.js';
import type { Consultable } from './registro-acceso.typeorm.js';

interface FilaUsuarioDeIngreso {
  usuario_id: string;
  tenant_id: string | null;
}

/**
 * SQL crudo porque llama a funciones `SECURITY DEFINER` (regla 11). Va fuera de UnitOfWork: el fallo
 * de contraseña llega sin tenant, no es un caso de uso con agregado y no emite eventos al outbox.
 */
export class BitacoraIngresoTypeorm implements BitacoraIngreso {
  constructor(private readonly db: Consultable) {}

  async usuarioPorCorreo(correo: string): Promise<UsuarioDeIngreso | null> {
    const filas = (await this.db.query('SELECT usuario_id, tenant_id FROM seg.usuario_para_ingreso($1)', [correo])) as FilaUsuarioDeIngreso[];
    const [fila] = filas;
    return fila ? { usuarioId: fila.usuario_id, tenantId: fila.tenant_id } : null;
  }

  async registrar(evento: EventoIngreso): Promise<void> {
    await this.db.query('SELECT seg.registrar_evento_ingreso($1, $2, $3, $4::jsonb, $5::inet)', [
      evento.tipo,
      evento.tenantId,
      evento.usuarioId,
      JSON.stringify(evento.detalle),
      ipLegible(evento.ip),
    ]);
  }
}
