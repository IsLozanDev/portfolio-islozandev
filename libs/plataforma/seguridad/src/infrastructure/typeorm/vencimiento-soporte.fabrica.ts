import type { Clock, EventPublisher, TenantContext } from '@vitrina/plataforma/kernel';
import type { TypeOrmUnitOfWork } from '@vitrina/plataforma/kernel-infra';
import type { DataSource } from 'typeorm';
import { VencerAccesosSoporte } from '../../application/vencer-accesos-soporte.js';
import { AccesoSoporteRepositorioTypeOrm } from './acceso-soporte.repositorio.js';
import { AsignacionRepositorioTypeOrm, BitacoraSeguridadTypeOrm } from './asignacion.repositorio.js';
import { LecturaSoporteTypeOrm } from './lectura-soporte.typeorm.js';
import { MembresiaRepositorioTypeOrm } from './membresia.repositorio.js';

export interface PiezasVencimientoSoporte {
  unidadDeTrabajo: TypeOrmUnitOfWork;
  contexto: TenantContext;
  reloj: Clock;
  eventos: EventPublisher;
  /** Para la lectura entre tenants (seg.accesos_soporte_por_vencer). */
  dataSource: Pick<DataSource, 'query'>;
  avisar: (mensaje: string, datos: Record<string, unknown>) => void;
}

/**
 * Para apps/worker, que no importa SeguridadModule (guards, controladores): arma el caso de uso con sus
 * adaptadores. El DataSource necesita ENTIDADES_SEG_LECTURA y ENTIDADES_SEG_SOPORTE.
 */
export function crearVencerAccesosSoporte(piezas: PiezasVencimientoSoporte): VencerAccesosSoporte {
  const { unidadDeTrabajo, contexto, reloj, eventos, dataSource, avisar } = piezas;
  return new VencerAccesosSoporte({
    unidadDeTrabajo,
    contexto,
    reloj,
    eventos,
    avisar,
    lectura: new LecturaSoporteTypeOrm(unidadDeTrabajo, contexto, dataSource),
    accesos: new AccesoSoporteRepositorioTypeOrm(unidadDeTrabajo, contexto),
    membresias: new MembresiaRepositorioTypeOrm(unidadDeTrabajo, contexto),
    asignaciones: new AsignacionRepositorioTypeOrm(unidadDeTrabajo, contexto),
    bitacora: new BitacoraSeguridadTypeOrm(unidadDeTrabajo, contexto),
  });
}
