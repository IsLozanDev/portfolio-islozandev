import { NotFoundError, type Clock, type UnitOfWork } from '@vitrina/plataforma/kernel';
import { fechaLocal } from './otorgar-asignacion.js';
import type { Asignables, FiltroMiembros, LecturaMiembros, Listado, MiembroDetalle, MiembroListado } from './ports/lectura-miembros.js';
import type { ProductosContratados } from './ports/repositorios.js';

export interface DependenciasLecturaMiembros {
  unidadDeTrabajo: UnitOfWork;
  lectura: LecturaMiembros;
  reloj: Clock;
}

/** Miembros del tenant del token, sin filtrar por el alcance del actor (decisión del spec 16a). */
export class ListarMiembros {
  constructor(private readonly dependencias: DependenciasLecturaMiembros) {}

  ejecutar(filtro: FiltroMiembros): Promise<Listado<MiembroListado>> {
    const { unidadDeTrabajo, lectura, reloj } = this.dependencias;
    return unidadDeTrabajo.run(() => lectura.listar(filtro, fechaLocal(reloj.now())));
  }
}

export class ConsultarMiembro {
  constructor(private readonly dependencias: DependenciasLecturaMiembros) {}

  /** Una membresía de otro tenant no se ve con la RLS: responde que no existe (404, no 403). */
  ejecutar(membresiaId: string): Promise<MiembroDetalle> {
    const { unidadDeTrabajo, lectura, reloj } = this.dependencias;
    return unidadDeTrabajo.run(async () => {
      const detalle = await lectura.detalle(membresiaId, fechaLocal(reloj.now()));
      if (!detalle) throw new NotFoundError('La membresía no existe');
      return detalle;
    });
  }
}

/** Roles y perfiles para el selector de invitar y asignar: solo de productos contratados (TR-RN-006). */
export class ListarAsignables {
  constructor(private readonly dependencias: Omit<DependenciasLecturaMiembros, 'reloj'> & { productos: ProductosContratados }) {}

  ejecutar(): Promise<Asignables> {
    const { unidadDeTrabajo, lectura, productos } = this.dependencias;
    return unidadDeTrabajo.run(async () => lectura.asignables(await productos.vigentes()));
  }
}
