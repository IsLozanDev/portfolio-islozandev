import type { UnitOfWork } from '@vitrina/plataforma/kernel';
import type { ProveedorEditable } from '../domain/proveedor-editable.js';
import type { VerificadorOperador } from './ports/cuotas.js';
import type { RepositorioProveedores } from './ports/proveedores-editables.js';

export interface DependenciasListarProveedores {
  unidadDeTrabajo: UnitOfWork;
  verificador: VerificadorOperador;
  repositorio: Pick<RepositorioProveedores, 'listar'>;
}

/** Operador: los proveedores de identidad por prioridad. Sin credenciales: viven en el entorno (regla 9). */
export class ListarProveedores {
  constructor(private readonly dependencias: DependenciasListarProveedores) {}

  async ejecutar(): Promise<ProveedorEditable[]> {
    const { unidadDeTrabajo, verificador, repositorio } = this.dependencias;
    await verificador.exigir();
    return unidadDeTrabajo.run(() => repositorio.listar());
  }
}
