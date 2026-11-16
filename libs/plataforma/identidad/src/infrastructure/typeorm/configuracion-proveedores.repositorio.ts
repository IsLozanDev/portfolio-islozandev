import type { TypeOrmUnitOfWork } from '@vitrina/plataforma/kernel-infra';
import { ArrayContains } from 'typeorm';
import type { ConfiguracionProveedores, ProveedorConfigurado } from '../../application/ports/proveedores.js';
import type { TipoConsultable } from '../../domain/datos-identidad.js';
import { ProveedorEntidad } from './entidades.js';

export class ConfiguracionProveedoresTypeOrm implements ConfiguracionProveedores {
  constructor(private readonly unidadDeTrabajo: TypeOrmUnitOfWork) {}

  async activosPara(tipo: TipoConsultable): Promise<ProveedorConfigurado[]> {
    const filas = await this.unidadDeTrabajo.manager.getRepository(ProveedorEntidad).find({
      where: { activo: true, tiposDoc: ArrayContains([tipo]) },
      order: { prioridad: 'ASC' },
    });
    return filas.map(({ codigo, prioridad, ttlDias, timeoutMs }) => ({ codigo, prioridad, ttlDias, timeoutMs }));
  }
}
