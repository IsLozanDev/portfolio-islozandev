import type { TypeOrmUnitOfWork } from '@vitrina/plataforma/kernel-infra';
import type { Repository } from 'typeorm';
import type { CacheIdentidadRepository } from '../../application/ports/persistencia.js';
import type { TipoConsultable } from '../../domain/datos-identidad.js';
import type { EntradaCache } from '../../domain/entrada-cache.js';
import { CacheDocumentoEntidad, type FilaCacheDocumento } from './entidades.js';
import { entradaDesdeFila, filaDesdeEntrada } from './mapeo-cache.js';

const LLAVE_CACHE: (keyof FilaCacheDocumento)[] = ['tipoDoc', 'numero'];

export class CacheIdentidadRepositorioTypeOrm implements CacheIdentidadRepository {
  constructor(private readonly unidadDeTrabajo: TypeOrmUnitOfWork) {}

  async obtener(tipo: TipoConsultable, numero: string): Promise<EntradaCache | null> {
    const fila = await this.repositorio().findOneBy({ tipoDoc: tipo, numero });
    return fila ? entradaDesdeFila(fila) : null;
  }

  async guardar(entrada: EntradaCache): Promise<void> {
    await this.repositorio().upsert(filaDesdeEntrada(entrada), LLAVE_CACHE);
  }

  private repositorio(): Repository<FilaCacheDocumento> {
    return this.unidadDeTrabajo.manager.getRepository(CacheDocumentoEntidad);
  }
}
