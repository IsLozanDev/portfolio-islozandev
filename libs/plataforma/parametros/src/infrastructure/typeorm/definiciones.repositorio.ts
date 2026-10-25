import { In, type DataSource, type EntityManager, type Repository } from 'typeorm';
import type { CambiosDefiniciones, RepositorioDefiniciones, ResumenDefiniciones, SesionDefiniciones } from '../../application/ports/repositorios.js';
import type { DefinicionParametro } from '../../domain/definicion-parametro.js';
import { DefinicionAplicadaEntidad, ParametroDefEntidad, type FilaDefinicion, type ValorJson } from './entidades.js';
import { definicionDesdeFila } from './mapeo.js';

/** Corre con la conexión de migración (dueña de las tablas): cfg.parametro_def es global. */
export class DefinicionesRepositorioTypeOrm implements RepositorioDefiniciones {
  constructor(private readonly dataSource: DataSource) {}

  transaccion<T>(trabajo: (sesion: SesionDefiniciones) => Promise<T>): Promise<T> {
    return this.dataSource.transaction((gestorEntidades) => trabajo(new SesionDefinicionesTypeOrm(gestorEntidades)));
  }
}

class SesionDefinicionesTypeOrm implements SesionDefiniciones {
  private readonly definiciones: Repository<FilaDefinicion>;

  constructor(private readonly gestorEntidades: EntityManager) {
    this.definiciones = gestorEntidades.getRepository(ParametroDefEntidad);
  }

  async todasDe(productoCodigo: string): Promise<DefinicionParametro[]> {
    const filas = await this.definiciones.find({ where: { productoCodigo } });
    return filas.map(definicionDesdeFila);
  }

  async aplicar(productoCodigo: string, cambios: CambiosDefiniciones, resumen: ResumenDefiniciones): Promise<void> {
    if (cambios.insertar.length > 0) {
      await this.definiciones.insert(cambios.insertar.map((definicion) => ({ ...camposEditables(definicion), codigo: definicion.codigo, productoCodigo, tipo: definicion.tipo })));
    }
    const ahora = new Date();
    for (const definicion of [...cambios.actualizar, ...cambios.reactivar]) {
      await this.definiciones.update({ codigo: definicion.codigo }, { ...camposEditables(definicion), obsoleto: false, actualizadoEn: ahora });
    }
    if (cambios.obsoletar.length > 0) {
      await this.definiciones.update({ codigo: In(cambios.obsoletar) }, { obsoleto: true, actualizadoEn: ahora });
    }
    await this.gestorEntidades.getRepository(DefinicionAplicadaEntidad).insert({ productoCodigo, cambios: resumen });
  }
}

/** Lo que el manifiesto puede cambiar en una definición existente (el tipo no: lo rechaza el caso de uso). */
function camposEditables(definicion: DefinicionParametro): Pick<FilaDefinicion, 'descripcion' | 'valorDefecto' | 'alcanceMaximo' | 'esquema'> {
  return {
    descripcion: definicion.descripcion,
    // La definición ya validó el defecto contra su tipo: nunca es null ni undefined.
    valorDefecto: definicion.valorDefecto as ValorJson,
    alcanceMaximo: definicion.alcanceMaximo,
    esquema: definicion.esquema,
  };
}
