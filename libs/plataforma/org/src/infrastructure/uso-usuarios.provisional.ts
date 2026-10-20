import type { UsoUsuariosPort } from '../application/ports/uso-usuarios.port.js';

/** Sin seg.membresia (spec 08) no hay usuarios que contar: el límite de usuarios no se puede violar todavía. */
export class UsoUsuariosProvisional implements UsoUsuariosPort {
  async activos(): Promise<number> {
    return 0;
  }
}
