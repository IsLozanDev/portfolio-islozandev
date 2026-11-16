import type { Clock, EventPublisher, UnitOfWork } from '@vitrina/plataforma/kernel';
import { ProveedorNoEncontradoError } from '../domain/errores.js';
import { eventoProveedorActualizado } from '../domain/eventos-idn.js';
import { aplicarCambiosProveedor, type CambiosProveedor, type ProveedorEditable } from '../domain/proveedor-editable.js';
import type { VerificadorOperador } from './ports/cuotas.js';
import type { RepositorioProveedores } from './ports/proveedores-editables.js';

export interface DependenciasActualizarProveedor {
  unidadDeTrabajo: UnitOfWork;
  reloj: Clock;
  verificador: VerificadorOperador;
  repositorio: RepositorioProveedores;
  publicador: EventPublisher;
}

export interface ComandoActualizarProveedor {
  codigo: string;
  cambios: CambiosProveedor;
  version: number;
  actorId: string;
}

/**
 * Operador: prioridad, TTL, timeout y estado de un proveedor. ConfiguracionProveedoresTypeOrm lee la tabla en cada
 * consulta, así que el cambio aplica desde la consulta siguiente.
 */
export class ActualizarProveedor {
  constructor(private readonly dependencias: DependenciasActualizarProveedor) {}

  async ejecutar(comando: ComandoActualizarProveedor): Promise<ProveedorEditable> {
    const { unidadDeTrabajo, verificador } = this.dependencias;
    await verificador.exigir();
    return unidadDeTrabajo.run(() => this.actualizar(comando));
  }

  private async actualizar({ codigo, cambios, version, actorId }: ComandoActualizarProveedor): Promise<ProveedorEditable> {
    const { repositorio, publicador, reloj } = this.dependencias;
    const proveedores = await repositorio.listar();
    const proveedor = proveedores.find((candidato) => candidato.codigo === codigo);
    if (!proveedor) throw new ProveedorNoEncontradoError();

    const demas = proveedores.filter((otro) => otro.codigo !== codigo);
    const actualizado = aplicarCambiosProveedor(proveedor, cambios, demas);
    await repositorio.guardar(actualizado, version);

    const guardado = { ...actualizado, version: version + 1 };
    await publicador.publish(eventoProveedorActualizado(guardado, actorId, reloj.now()));
    return guardado;
  }
}
