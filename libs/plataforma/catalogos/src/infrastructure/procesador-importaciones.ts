import type { Clock, EventPublisher, TenantContext } from '@vitrina/plataforma/kernel';
import type { TypeOrmUnitOfWork } from '@vitrina/plataforma/kernel-infra';
import type { Redis } from 'ioredis';
import type { Avisar } from '../application/importacion/avance.js';
import { ProcesarImportacion } from '../application/importacion/procesar-importacion.js';
import { CanalAvanceRedis } from './redis/canal-avance.redis.js';
import { CatalogosRepositorioTypeOrm } from './typeorm/catalogos.repositorio.js';
import { EscrituraImportacionTypeOrm } from './typeorm/escritura-importacion.typeorm.js';
import { ImportacionesRepositorioTypeOrm } from './typeorm/importaciones.repositorio.js';

export interface PiezasProcesador {
  unidadDeTrabajo: TypeOrmUnitOfWork;
  contexto: TenantContext;
  reloj: Clock;
  eventos: EventPublisher;
  /** Para el avance: un cliente que no sea el de BullMQ (los Worker bloquean su conexión). */
  redis: Redis;
  avisar: Avisar;
}

/** Arma el caso de uso del worker con los adaptadores de la lib: el worker no conoce los repositorios. */
export function crearProcesarImportacion(piezas: PiezasProcesador): ProcesarImportacion {
  const { unidadDeTrabajo, contexto, reloj, eventos, redis, avisar } = piezas;
  return new ProcesarImportacion({
    unidadDeTrabajo,
    contexto,
    reloj,
    catalogos: new CatalogosRepositorioTypeOrm(unidadDeTrabajo),
    importaciones: new ImportacionesRepositorioTypeOrm(unidadDeTrabajo),
    escritura: new EscrituraImportacionTypeOrm(unidadDeTrabajo),
    eventos,
    canal: new CanalAvanceRedis(redis),
    avisar,
  });
}
