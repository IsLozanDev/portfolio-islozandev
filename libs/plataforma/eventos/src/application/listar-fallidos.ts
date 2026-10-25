import type { UnitOfWork } from '@vitrina/plataforma/kernel';
import type { EventoFallido } from '../domain/evento-fallido.js';
import type { FiltroFallidos, RepositorioFallidos } from './ports/repositorios.js';

export const LIMITE_FALLIDOS_POR_DEFECTO = 50;
export const LIMITE_MAXIMO_FALLIDOS = 100;

export type ConsultaFallidos = Partial<FiltroFallidos>;

export interface DependenciasLecturaFallidos {
  unidadDeTrabajo: UnitOfWork;
  fallidos: RepositorioFallidos;
}

/** Fallidos del tenant, los más recientes primero. Por defecto solo los que siguen en `FALLIDO` (TR-RF-095). */
export class ListarFallidos {
  constructor(private readonly dependencias: DependenciasLecturaFallidos) {}

  ejecutar(consulta: ConsultaFallidos): Promise<EventoFallido[]> {
    const { unidadDeTrabajo, fallidos } = this.dependencias;
    const filtro: FiltroFallidos = { ...consulta, estado: consulta.estado ?? 'FALLIDO', limite: Math.min(consulta.limite ?? LIMITE_FALLIDOS_POR_DEFECTO, LIMITE_MAXIMO_FALLIDOS) };
    return unidadDeTrabajo.run(() => fallidos.listar(filtro));
  }
}
