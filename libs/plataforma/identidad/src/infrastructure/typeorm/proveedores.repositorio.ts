import type { TypeOrmUnitOfWork } from '@vitrina/plataforma/kernel-infra';
import type { Repository } from 'typeorm';
import type { RepositorioProveedores } from '../../application/ports/proveedores-editables.js';
import type { TipoConsultable } from '../../domain/datos-identidad.js';
import { VersionObsoletaError } from '../../domain/errores.js';
import type { ProveedorEditable } from '../../domain/proveedor-editable.js';
import { ProveedorEntidad, type FilaProveedor } from './entidades.js';

/** idn.proveedor para la consola. La app solo puede escribir prioridad, ttl, timeout, activo y version. */
export class RepositorioProveedoresTypeOrm implements RepositorioProveedores {
  constructor(private readonly unidadDeTrabajo: TypeOrmUnitOfWork) {}

  async listar(): Promise<ProveedorEditable[]> {
    const filas = await this.proveedores().find({ order: { prioridad: 'ASC', codigo: 'ASC' } });
    return filas.map(proveedorDesdeFila);
  }

  async guardar(proveedor: ProveedorEditable, versionEsperada: number): Promise<void> {
    const { codigo, prioridad, ttlDias, timeoutMs, activo } = proveedor;
    const resultado = await this.proveedores().update(
      { codigo, version: versionEsperada },
      { prioridad, ttlDias, timeoutMs, activo, version: versionEsperada + 1 },
    );
    if (resultado.affected !== 1) throw new VersionObsoletaError();
  }

  private proveedores(): Repository<FilaProveedor> {
    return this.unidadDeTrabajo.manager.getRepository(ProveedorEntidad);
  }
}

// El CHECK de idn.proveedor y la configuración solo admiten DNI y RUC.
function proveedorDesdeFila(fila: FilaProveedor): ProveedorEditable {
  return {
    codigo: fila.codigo,
    tiposDoc: fila.tiposDoc as TipoConsultable[],
    prioridad: fila.prioridad,
    ttlDias: fila.ttlDias,
    timeoutMs: fila.timeoutMs,
    activo: fila.activo,
    version: fila.version,
  };
}
