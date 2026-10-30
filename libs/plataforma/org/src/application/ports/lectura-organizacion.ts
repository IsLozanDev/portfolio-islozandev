import type { Atributos, TipoUnidad } from '../../domain/unidad-operativa.js';

/** pagina empieza en 1. Los topes de tamano los fija la capa HTTP. */
export interface Pagina {
  pagina: number;
  tamano: number;
}

export interface Listado<T> {
  items: T[];
  total: number;
}

export interface FiltroEmpresas extends Pagina {
  activo?: boolean;
}

export interface FiltroSucursales extends Pagina {
  activo?: boolean;
}

export interface FiltroUnidades extends Pagina {
  empresaId?: string;
  sucursalId?: string;
  tipo?: TipoUnidad;
  activo?: boolean;
}

export interface EmpresaListada {
  id: string;
  ruc: string;
  razonSocial: string;
  nombreComercial: string | null;
  direccionFiscal: string | null;
  ubigeo: string | null;
  activo: boolean;
  version: number;
}

export interface SucursalListada {
  id: string;
  empresaId: string;
  codigo: string;
  nombre: string;
  codigoEstablecimientoSunat: string | null;
  direccion: string | null;
  ubigeo: string | null;
  telefono: string | null;
  zonaHoraria: string;
  esPrincipal: boolean;
  activo: boolean;
  version: number;
}

export interface UnidadListada {
  id: string;
  empresaId: string;
  sucursalId: string | null;
  tipo: TipoUnidad;
  codigo: string;
  nombre: string;
  padreId: string | null;
  atributos: Atributos;
  activo: boolean;
  version: number;
}

/** Organización del tenant del contexto, en la transacción activa. Para pantallas: no devuelve agregados. */
export interface LecturaOrganizacion {
  /** Por razón social. */
  empresas(filtro: FiltroEmpresas): Promise<Listado<EmpresaListada>>;
  /** La principal primero, luego por código. */
  sucursales(empresaId: string, filtro: FiltroSucursales): Promise<Listado<SucursalListada>>;
  /** Por tipo y código. */
  unidades(filtro: FiltroUnidades): Promise<Listado<UnidadListada>>;
  /** null si no existe o es de otro tenant. */
  empresa(empresaId: string): Promise<EmpresaListada | null>;
  sucursal(sucursalId: string): Promise<SucursalListada | null>;
  unidad(unidadId: string): Promise<UnidadListada | null>;
}
