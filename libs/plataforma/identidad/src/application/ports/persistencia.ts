import type { TipoDocumento } from '@vitrina/shared/util';
import type { TipoConsultable } from '../../domain/datos-identidad.js';
import type { EntradaCache } from '../../domain/entrada-cache.js';
import type { MotivoConsulta } from '../../domain/motivo-consulta.js';
import type { ResultadoConsulta } from '../../domain/resultado-consulta.js';

/** idn.cache_documento: global, sin tenant. */
export interface CacheIdentidadRepository {
  obtener(tipo: TipoConsultable, numero: string): Promise<EntradaCache | null>;
  /** Inserta o reemplaza por (tipo, numero). */
  guardar(entrada: EntradaCache): Promise<void>;
}

export interface RegistroConsulta {
  tenantId: string;
  usuarioId: string | null;
  productoCodigo: string | null;
  tipo: TipoDocumento;
  numeroHash: string;
  motivo: MotivoConsulta;
  resultado: ResultadoConsulta;
  proveedor: string | null;
  consultadoEn: Date;
}

/** idn.consulta_log: por tenant, solo inserción. */
export interface BitacoraConsultas {
  registrar(registro: RegistroConsulta): Promise<void>;
}

export const HASHER_DOCUMENTO = Symbol('HasherDocumento');

/** TR-RNF-111: el número nunca se guarda en claro. Lo implementa apps/api con la sal de plataforma. */
export interface HasherDocumento {
  hashear(numero: string): string;
}
