import type { DefinicionParametro } from '../../domain/definicion-parametro.js';
import type { AmbitoValor, OrigenValor } from '../../domain/tipos.js';
import type { ValorParametro } from '../../domain/valor-parametro.js';

/** Lectura de definiciones dentro de la UnitOfWork de la aplicación (incluye obsoletas). */
export interface LecturaDefiniciones {
  buscar(codigo: string): Promise<DefinicionParametro | null>;
}

/** Valores del tenant del contexto. Bloqueo optimista por `version`: un cambio concurrente da ConflictError. */
export interface RepositorioValores {
  buscar(codigo: string, ambito: AmbitoValor): Promise<ValorParametro | null>;
  guardar(valor: ValorParametro): Promise<void>;
  eliminar(valor: ValorParametro): Promise<void>;
}

export interface ValorEfectivo {
  valor: unknown;
  origen: OrigenValor;
}

/** vt sube con cada valor del tenant; vd, con cada registro de definiciones. Van en la clave de caché. */
export interface VersionesParametros {
  vt: number;
  vd: number;
}

/** Resolución con las funciones cfg.valor (TR-RN-014) y cfg.versiones. */
export interface ResolucionSql {
  /** null si el código no existe. */
  valor(codigo: string, tenantId: string, empresaId: string | null, sucursalId: string | null): Promise<ValorEfectivo | null>;
  versiones(tenantId: string): Promise<VersionesParametros>;
}

/** Lo que se guarda en caché: el efectivo y si la definición está obsoleta (para avisar en cada acierto). */
export interface ValorEnCache extends ValorEfectivo {
  obsoleto: boolean;
}

export interface CacheParametros {
  leer(clave: string): Promise<ValorEnCache | null>;
  guardar(clave: string, valor: ValorEnCache, ttlSegundos: number): Promise<void>;
}

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
