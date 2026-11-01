import { NotFoundError, type UnitOfWork } from '@vitrina/plataforma/kernel';
import type { ListarRoles } from './lecturas-roles.js';
import type { LecturaPerfiles, PerfilDetalle, PerfilListado } from './ports/lectura-perfiles.js';
import type { RolListado } from './ports/lectura-roles.js';

export interface DependenciasLecturaPerfiles {
  unidadDeTrabajo: UnitOfWork;
  lectura: LecturaPerfiles;
}

/** Perfiles propios y predefinidos del tenant del contexto (spec 16c, TR-RF-012). */
export class ListarPerfiles {
  constructor(private readonly dependencias: DependenciasLecturaPerfiles) {}

  ejecutar(): Promise<PerfilListado[]> {
    const { unidadDeTrabajo, lectura } = this.dependencias;
    return unidadDeTrabajo.run(() => lectura.listar());
  }
}

export class ConsultarPerfil {
  constructor(private readonly dependencias: DependenciasLecturaPerfiles) {}

  /** Un perfil de otro tenant no se ve: responde que no existe (404, no 403). */
  ejecutar(perfilId: string): Promise<PerfilDetalle> {
    const { unidadDeTrabajo, lectura } = this.dependencias;
    return unidadDeTrabajo.run(async () => {
      const detalle = await lectura.detalle(perfilId);
      if (!detalle) throw new NotFoundError('El perfil no existe');
      return detalle;
    });
  }
}

/**
 * Roles que se pueden poner en un perfil: los de `ListarRoles` (PLAT dentro del techo y productos
 * contratados, TR-CA-035) que siguen activos. Mismo orden: producto y nombre.
 */
export class ListarRolesDisponibles {
  constructor(private readonly listarRoles: Pick<ListarRoles, 'ejecutar'>) {}

  async ejecutar(): Promise<RolListado[]> {
    return (await this.listarRoles.ejecutar()).filter((rol) => rol.activo);
  }
}
