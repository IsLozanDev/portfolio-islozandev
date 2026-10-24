import type { DataSource, EntityManager } from 'typeorm';
import type { CambiosDefiniciones, RepositorioDefiniciones, ResumenDefiniciones, SesionDefiniciones } from '../../application/ports/repositorios.js';
import { DefinicionParametro } from '../../domain/definicion-parametro.js';
import type { AlcanceParametro, TipoParametro } from '../../domain/tipos.js';

interface FilaDefinicion {
  codigo: string;
  producto_codigo: string;
  descripcion: string;
  tipo: TipoParametro;
  valor_defecto: unknown;
  alcance_maximo: AlcanceParametro;
  esquema: object | null;
  obsoleto: boolean;
}

// node-pg manda un string como texto plano: todo valor jsonb viaja serializado. null queda como SQL NULL.
const jsonb = (v: unknown): string | null => (v === null ? null : JSON.stringify(v));

/** Corre con la conexión de migración (dueña de las tablas): cfg.parametro_def es global. */
export class DefinicionesRepositorioTypeOrm implements RepositorioDefiniciones {
  constructor(private readonly dataSource: DataSource) {}

  transaccion<T>(trabajo: (sesion: SesionDefiniciones) => Promise<T>): Promise<T> {
    return this.dataSource.transaction((manager) => trabajo(new Sesion(manager)));
  }
}

class Sesion implements SesionDefiniciones {
  constructor(private readonly m: EntityManager) {}

  async todasDe(productoCodigo: string): Promise<DefinicionParametro[]> {
    const filas: FilaDefinicion[] = await this.m.query(
      `SELECT codigo, producto_codigo, descripcion, tipo, valor_defecto, alcance_maximo, esquema, obsoleto
         FROM cfg.parametro_def WHERE producto_codigo = $1`,
      [productoCodigo],
    );
    return filas.map((f) =>
      DefinicionParametro.reconstituir({
        codigo: f.codigo,
        productoCodigo: f.producto_codigo,
        descripcion: f.descripcion,
        tipo: f.tipo,
        valorDefecto: f.valor_defecto,
        alcanceMaximo: f.alcance_maximo,
        esquema: f.esquema,
        obsoleto: f.obsoleto,
      }),
    );
  }

  async aplicar(productoCodigo: string, c: CambiosDefiniciones, resumen: ResumenDefiniciones): Promise<void> {
    for (const d of c.insertar) {
      await this.m.query(
        `INSERT INTO cfg.parametro_def (codigo, producto_codigo, descripcion, tipo, valor_defecto, alcance_maximo, esquema)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7::jsonb)`,
        [d.codigo, productoCodigo, d.descripcion, d.tipo, jsonb(d.valorDefecto), d.alcanceMaximo, jsonb(d.esquema)],
      );
    }
    for (const d of [...c.actualizar, ...c.reactivar]) {
      await this.m.query(
        `UPDATE cfg.parametro_def
            SET descripcion = $2, valor_defecto = $3::jsonb, alcance_maximo = $4, esquema = $5::jsonb, obsoleto = false, actualizado_en = now()
          WHERE codigo = $1`,
        [d.codigo, d.descripcion, jsonb(d.valorDefecto), d.alcanceMaximo, jsonb(d.esquema)],
      );
    }
    if (c.obsoletar.length > 0) {
      await this.m.query('UPDATE cfg.parametro_def SET obsoleto = true, actualizado_en = now() WHERE codigo = ANY($1)', [c.obsoletar]);
    }
    await this.m.query('INSERT INTO cfg.definiciones_aplicadas (producto_codigo, cambios) VALUES ($1, $2::jsonb)', [productoCodigo, JSON.stringify(resumen)]);
  }
}
