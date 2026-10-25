import type { TypeOrmUnitOfWork } from '@vitrina/plataforma/kernel-infra';
import { ILike, In, type FindOptionsWhere } from 'typeorm';
import type { BusquedaDefiniciones, FiltroDefiniciones } from '../../application/ports/repositorios.js';
import type { DefinicionParametro } from '../../domain/definicion-parametro.js';
import { ParametroDefEntidad, type FilaDefinicion } from './entidades.js';
import { definicionDesdeFila } from './mapeo.js';

/** Comodines de LIKE en el texto buscado: se buscan literalmente. */
const COMODINES_LIKE = /[\\%_]/g;

export class BusquedaDefinicionesTypeOrm implements BusquedaDefiniciones {
  constructor(private readonly unidadDeTrabajo: TypeOrmUnitOfWork) {}

  async listar(filtro: FiltroDefiniciones): Promise<DefinicionParametro[]> {
    if (filtro.productos.length === 0) return [];
    const filas = await this.unidadDeTrabajo.manager.getRepository(ParametroDefEntidad).find({ where: condiciones(filtro), order: { codigo: 'ASC' } });
    return filas.map(definicionDesdeFila);
  }
}

/** Varias condiciones son un OR: el texto puede estar en el código o en la descripción. */
function condiciones(filtro: FiltroDefiniciones): FindOptionsWhere<FilaDefinicion>[] {
  const base: FindOptionsWhere<FilaDefinicion> = { productoCodigo: In([...filtro.productos]), ...(filtro.incluirObsoletas ? {} : { obsoleto: false }) };
  const texto = filtro.texto?.trim();
  if (!texto) return [base];
  const patron = `%${texto.replace(COMODINES_LIKE, (comodin) => `\\${comodin}`)}%`;
  return [
    { ...base, codigo: ILike(patron) },
    { ...base, descripcion: ILike(patron) },
  ];
}
