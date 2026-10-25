import type { TypeOrmUnitOfWork } from '@vitrina/plataforma/kernel-infra';
import type { LecturaDefiniciones } from '../../application/ports/repositorios.js';
import type { DefinicionParametro } from '../../domain/definicion-parametro.js';
import { ParametroDefEntidad } from './entidades.js';
import { definicionDesdeFila } from './mapeo.js';

/** Definiciones leídas con la conexión de la aplicación (la tabla es global, sin RLS). */
export class LecturaDefinicionesTypeOrm implements LecturaDefiniciones {
  constructor(private readonly unidadDeTrabajo: TypeOrmUnitOfWork) {}

  async buscar(codigo: string): Promise<DefinicionParametro | null> {
    const fila = await this.unidadDeTrabajo.manager.getRepository(ParametroDefEntidad).findOneBy({ codigo });
    return fila ? definicionDesdeFila(fila) : null;
  }
}
