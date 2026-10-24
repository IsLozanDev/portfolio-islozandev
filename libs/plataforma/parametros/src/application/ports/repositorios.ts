import type { DefinicionParametro } from '../../domain/definicion-parametro.js';

export interface ResumenDefiniciones {
  insertadas: number;
  actualizadas: number;
  obsoletas: number;
  reactivadas: number;
}

export interface CambiosDefiniciones {
  insertar: DefinicionParametro[];
  actualizar: DefinicionParametro[];
  /** Vuelven a aparecer en el manifiesto: dejan de ser obsoletas y toman los campos nuevos. */
  reactivar: DefinicionParametro[];
  obsoletar: string[];
}

export interface SesionDefiniciones {
  /** Incluye las obsoletas. */
  todasDe(productoCodigo: string): Promise<DefinicionParametro[]>;
  /** Escribe los cambios y una fila en cfg.definiciones_aplicadas (sube vd). */
  aplicar(productoCodigo: string, cambios: CambiosDefiniciones, resumen: ResumenDefiniciones): Promise<void>;
}

/**
 * Las definiciones son globales: las escribe el CLI del manifiesto con la conexión de migración y su
 * propia transacción, fuera de UnitOfWork (mismo criterio que RepositorioManifiestos de seg).
 */
export interface RepositorioDefiniciones {
  transaccion<T>(trabajo: (sesion: SesionDefiniciones) => Promise<T>): Promise<T>;
}
