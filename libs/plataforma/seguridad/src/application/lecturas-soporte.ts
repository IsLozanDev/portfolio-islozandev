import type { Clock, UnitOfWork } from '@vitrina/plataforma/kernel';
import type { Listado } from './ports/lectura-miembros.js';
import type { FiltroSolicitudesSoporte, LecturaSoporte, SolicitudSoporte } from './ports/lectura-soporte.js';

export interface DependenciasLecturaSoporte {
  unidadDeTrabajo: UnitOfWork;
  lectura: LecturaSoporte;
  reloj: Clock;
}

/** Bandeja del administrador: solicitudes del tenant del token, de la más reciente a la más antigua. */
export class ListarSolicitudesSoporte {
  constructor(private readonly dependencias: Omit<DependenciasLecturaSoporte, 'reloj'>) {}

  ejecutar(filtro: FiltroSolicitudesSoporte): Promise<Listado<SolicitudSoporte>> {
    const { unidadDeTrabajo, lectura } = this.dependencias;
    return unidadDeTrabajo.run(() => lectura.delTenant(filtro));
  }
}

/** Insignia del menú: PENDIENTE sin caducar. */
export class ContarSolicitudesPendientes {
  constructor(private readonly dependencias: DependenciasLecturaSoporte) {}

  ejecutar(): Promise<number> {
    const { unidadDeTrabajo, lectura, reloj } = this.dependencias;
    return unidadDeTrabajo.run(() => lectura.pendientes(reloj.now()));
  }
}
